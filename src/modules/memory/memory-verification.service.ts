import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

import {
  MemoryPerson,
  MemoryPersonDocument,
  PersonIdentityStatus,
} from './schemas/memory-person.schema';
import {
  PersonVerificationSession,
  PersonVerificationSessionDocument,
  VerificationChannel,
  VerificationSessionStatus,
} from './schemas/person-verification-session.schema';

@Injectable()
export class MemoryVerificationService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly memoryPersonModel: Model<MemoryPersonDocument>,

    @InjectModel(PersonVerificationSession.name)
    private readonly verificationSessionModel: Model<PersonVerificationSessionDocument>,
  ) {}

  async requestOtp(
    // ownerUserId: string,
    identifier: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const genericResponse = {
      message: 'If the identity is recognised, an OTP has been sent.',
    };

    const isEmail = identifier.includes('@');

    const destination = isEmail
      ? this.normalizeEmail(identifier)
      : this.normalizePhone(identifier);

    const channel = isEmail
      ? VerificationChannel.EMAIL
      : VerificationChannel.PHONE;

    const person = await this.memoryPersonModel.findOne({
      // ownerUserId: new Types.ObjectId(
      //   ownerUserId,
      // ),
      isActive: true,
      isArchived: false,
      isBlocked: false,
      $or: [
        {
          'emails.email': destination,
        },
        {
          'phoneNumbers.phoneNumber': destination,
        },
      ],
    });

    if (!person) {
      return genericResponse;
    }

    const recentRequestCount =
      await this.verificationSessionModel.countDocuments({
        // ownerUserId: person.ownerUserId,
        destination,
        createdAt: {
          $gte: new Date(Date.now() - 15 * 60 * 1000),
        },
      });

    if (recentRequestCount >= 3) {
      return genericResponse;
    }

    await this.verificationSessionModel.updateMany(
      {
        // ownerUserId: person.ownerUserId,
        personId: person._id,
        status: VerificationSessionStatus.PENDING,
      },
      {
        $set: {
          status: VerificationSessionStatus.REVOKED,
        },
      },
    );

    const otp = randomInt(100000, 1000000).toString();

    const otpHash = await bcrypt.hash(otp, 10);

    const session = await this.verificationSessionModel.create({
      // ownerUserId: person.ownerUserId,
      personId: person._id,
      channel,
      destination,
      otpHash,
      status: VerificationSessionStatus.PENDING,
      attempts: 0,
      maximumAttempts: 5,
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      identityVersion: person.identityVersion,
      ipAddress,
      userAgent,
    });

    const now = new Date();

    if (channel === VerificationChannel.EMAIL) {
      const emailIdentity = person.emails.find(
        (item) => item.email === destination,
      );

      if (emailIdentity) {
        emailIdentity.lastOtpSentAt = now;
      }
    } else {
      const phoneIdentity = person.phoneNumbers.find(
        (item) => item.phoneNumber === destination,
      );

      if (phoneIdentity) {
        phoneIdentity.lastOtpSentAt = now;
      }
    }

    await person.save();

    this.sendOtp(destination, channel, otp);

    return {
      ...genericResponse,

      /*
       * In a high-security system, you may also hide this ID
       * and use an opaque challenge token.
       */
      verificationSessionId: session._id.toString(),
    };
  }

  async verifyOtp(verificationSessionId: string, otp: string) {
    this.validateObjectId(verificationSessionId, 'verification session ID');

    const session = await this.verificationSessionModel
      .findOne({
        _id: new Types.ObjectId(verificationSessionId),
        status: VerificationSessionStatus.PENDING,
      })
      .select('+otpHash +sessionTokenHash');

    if (!session) {
      throw new UnauthorizedException(
        'Invalid or expired verification session.',
      );
    }

    if (session.otpExpiresAt.getTime() <= Date.now()) {
      session.status = VerificationSessionStatus.EXPIRED;

      await session.save();

      throw new UnauthorizedException('OTP has expired.');
    }

    if (session.attempts >= session.maximumAttempts) {
      session.status = VerificationSessionStatus.BLOCKED;

      await session.save();

      throw new UnauthorizedException('Maximum OTP attempts exceeded.');
    }

    const otpMatches = await bcrypt.compare(otp, session.otpHash);

    if (!otpMatches) {
      session.attempts += 1;

      if (session.attempts >= session.maximumAttempts) {
        session.status = VerificationSessionStatus.BLOCKED;
      }

      await session.save();

      throw new UnauthorizedException('Invalid OTP.');
    }

    const person = await this.memoryPersonModel.findOne({
      _id: session.personId,
      // ownerUserId: session.ownerUserId,
      isActive: true,
      isArchived: false,
      isBlocked: false,
    });

    if (!person) {
      throw new UnauthorizedException('Person identity is unavailable.');
    }

    if (person.identityVersion !== session.identityVersion) {
      session.status = VerificationSessionStatus.REVOKED;

      await session.save();

      throw new UnauthorizedException(
        'Identity information changed. Request a new OTP.',
      );
    }

    const now = new Date();

    if (session.channel === VerificationChannel.EMAIL) {
      const identity = person.emails.find(
        (item) => item.email === session.destination,
      );

      if (!identity) {
        throw new UnauthorizedException(
          'Email identity is no longer available.',
        );
      }

      identity.isVerified = true;
      identity.verifiedAt = identity.verifiedAt ?? now;
      identity.lastVerifiedAt = now;
    } else {
      const identity = person.phoneNumbers.find(
        (item) => item.phoneNumber === session.destination,
      );

      if (!identity) {
        throw new UnauthorizedException(
          'Phone identity is no longer available.',
        );
      }

      identity.isVerified = true;
      identity.verifiedAt = identity.verifiedAt ?? now;
      identity.lastVerifiedAt = now;
    }

    const verifiedEmailCount = person.emails.filter(
      (item) => item.isVerified,
    ).length;

    const verifiedPhoneCount = person.phoneNumbers.filter(
      (item) => item.isVerified,
    ).length;

    const totalIdentityCount =
      person.emails.length + person.phoneNumbers.length;

    const verifiedIdentityCount = verifiedEmailCount + verifiedPhoneCount;

    person.identityStatus =
      verifiedIdentityCount === totalIdentityCount && totalIdentityCount > 0
        ? PersonIdentityStatus.VERIFIED
        : PersonIdentityStatus.PARTIALLY_VERIFIED;

    person.firstVerifiedAt = person.firstVerifiedAt ?? now;

    person.lastVerifiedAt = now;
    person.lastAccessedAt = now;

    const rawSessionToken = randomBytes(48).toString('hex');

    session.sessionTokenHash = this.hashToken(rawSessionToken);

    session.status = VerificationSessionStatus.VERIFIED;

    session.verifiedAt = now;
    session.sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    session.lastAccessedAt = now;

    await Promise.all([person.save(), session.save()]);

    return {
      sessionToken: rawSessionToken,
      sessionExpiresAt: session.sessionExpiresAt,

      person: {
        id: person._id,
        name: person.preferredName ?? person.name,
      },
    };
  }

  async validateSession(rawSessionToken: string) {
    if (!rawSessionToken?.trim()) {
      throw new UnauthorizedException('Memory session token is required.');
    }

    const sessionTokenHash = this.hashToken(rawSessionToken.trim());

    const session = await this.verificationSessionModel
      .findOne({
        sessionTokenHash,
        status: VerificationSessionStatus.VERIFIED,
        sessionExpiresAt: {
          $gt: new Date(),
        },
      })
      .select('+sessionTokenHash');

    if (!session) {
      throw new UnauthorizedException('Memory session is invalid or expired.');
    }

    const person = await this.memoryPersonModel.findOne({
      _id: session.personId,
      // ownerUserId: session.ownerUserId,
      identityVersion: session.identityVersion,
      isActive: true,
      isArchived: false,
      isBlocked: false,
    });

    if (!person) {
      throw new UnauthorizedException(
        'Verified person identity is no longer valid.',
      );
    }

    session.lastAccessedAt = new Date();
    session.accessCount += 1;

    person.lastAccessedAt = new Date();

    await Promise.all([session.save(), person.save()]);

    return {
      // ownerUserId: session.ownerUserId,
      personId: session.personId,
      verificationSessionId: session._id,
      identityVersion: session.identityVersion,
    };
  }

  async revokeSession(rawSessionToken: string) {
    if (!rawSessionToken?.trim()) {
      throw new BadRequestException('Memory session token is required.');
    }

    const sessionTokenHash = this.hashToken(rawSessionToken.trim());

    const result = await this.verificationSessionModel.updateOne(
      {
        sessionTokenHash,
        status: VerificationSessionStatus.VERIFIED,
      },
      {
        $set: {
          status: VerificationSessionStatus.REVOKED,
        },
      },
    );

    return {
      revoked: result.modifiedCount > 0,
    };
  }

  private sendOtp(
    destination: string,
    channel: VerificationChannel,
    otp: string,
  ) {
    /*
     * Replace this with your email or SMS provider.
     *
     * Examples:
     * - Resend / SendGrid / AWS SES for email
     * - Twilio / MSG91 / AWS SNS for SMS
     */

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${channel} ${destination}: ${otp}`);
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string) {
    const normalized = phone.trim().replace(/[^\d+]/g, '');

    if (!normalized.startsWith('+') || !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException(
        'Phone number must use valid E.164 format.',
      );
    }

    return normalized;
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
