import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  QueryFilter,
  Model,
  Types,
} from 'mongoose';

import { CreateMemoryPersonDto } from './dto/create-memory-person.dto';
import { MemoryPersonQueryDto } from './dto/memory-person-query.dto';
import { UpdateMemoryPersonDto } from './dto/update-memory-person.dto';
import {
  MemoryPerson,
  MemoryPersonDocument,
  PersonIdentityStatus,
} from './schemas/memory-person.schema';
import {
  PersonVerificationSession,
  PersonVerificationSessionDocument,
  VerificationSessionStatus,
} from './schemas/person-verification-session.schema';

@Injectable()
export class MemoryPeopleService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly memoryPersonModel:
      Model<MemoryPersonDocument>,

    @InjectModel(PersonVerificationSession.name)
    private readonly verificationSessionModel:
      Model<PersonVerificationSessionDocument>,
  ) {}

  async create(dto: CreateMemoryPersonDto) {
    // this.validateObjectId(
    //   dto.ownerUserId,
    //   'owner user ID',
    // );

    if (dto.linkedUserId) {
      this.validateObjectId(
        dto.linkedUserId,
        'linked user ID',
      );
    }

    // const ownerUserId =
    //   new Types.ObjectId(dto.ownerUserId);

    const emails = this.prepareEmails(dto.emails);
    const phoneNumbers = this.preparePhones(
      dto.phoneNumbers,
    );

    if (!emails.length && !phoneNumbers.length) {
      throw new BadRequestException(
        'At least one email or phone number is required.',
      );
    }

    const identityFilters: QueryFilter<MemoryPersonDocument>[] =
      [];

    if (emails.length) {
      identityFilters.push({
        'emails.email': {
          $in: emails.map((item) => item.email),
        },
      });
    }

    if (phoneNumbers.length) {
      identityFilters.push({
        'phoneNumbers.phoneNumber': {
          $in: phoneNumbers.map(
            (item) => item.phoneNumber,
          ),
        },
      });
    }

    const duplicate =
      await this.memoryPersonModel.exists({
        // ownerUserId,
        isActive: true,
        $or: identityFilters,
      });

    if (duplicate) {
      throw new ConflictException(
        'A person with this email or phone number already exists.',
      );
    }

    return this.memoryPersonModel.create({
      // ownerUserId,
      linkedUserId: dto.linkedUserId
        ? new Types.ObjectId(dto.linkedUserId)
        : null,
      name: dto.name.trim(),
      preferredName: dto.preferredName?.trim(),
      relationship: dto.relationship,
      relationshipLabel:
        dto.relationshipLabel?.trim(),
      emails,
      phoneNumbers,
      aliases: this.normalizeTags(dto.aliases),
      tags: this.normalizeTags(dto.tags),
      notes: dto.notes?.trim(),
      metadata: dto.metadata ?? {},
    });
  }

  async findAll(query: MemoryPersonQueryDto) {
    // this.validateObjectId(
    //   query.ownerUserId,
    //   'owner user ID',
    // );

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(
      Math.max(query.limit ?? 20, 1),
      100,
    );

    const filter: QueryFilter<MemoryPersonDocument> = {
      // ownerUserId: new Types.ObjectId(
      //   query.ownerUserId,
      // ),
      isActive: true,
    };

    if (query.relationship) {
      filter.relationship = query.relationship;
    }

    if (query.identityStatus) {
      filter.identityStatus = query.identityStatus;
    }

    if (query.isBlocked !== undefined) {
      filter.isBlocked = query.isBlocked;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.memoryPersonModel
        .find(filter)
        .sort({
          name: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.memoryPersonModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    return person.toObject();
  }

  async update(
    personId: string,
    // ownerUserId: string,
    dto: UpdateMemoryPersonDto,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    let identityChanged = false;

    if (dto.name !== undefined) {
      person.name = dto.name.trim();
    }

    if (dto.preferredName !== undefined) {
      person.preferredName =
        dto.preferredName?.trim();
    }

    if (dto.relationship !== undefined) {
      person.relationship = dto.relationship;
    }

    if (dto.relationshipLabel !== undefined) {
      person.relationshipLabel =
        dto.relationshipLabel?.trim();
    }

    if (dto.notes !== undefined) {
      person.notes = dto.notes?.trim();
    }

    if (dto.metadata !== undefined) {
      person.metadata = dto.metadata;
    }

    if (dto.aliases !== undefined) {
      person.aliases = this.normalizeTags(
        dto.aliases,
      );
    }

    if (dto.tags !== undefined) {
      person.tags = this.normalizeTags(dto.tags);
    }

    if (dto.linkedUserId !== undefined) {
      person.linkedUserId = dto.linkedUserId
        ? new Types.ObjectId(dto.linkedUserId)
        : null;
    }

    if (dto.emails !== undefined) {
      person.emails = this.prepareEmails(
        dto.emails,
      );

      identityChanged = true;
    }

    if (dto.phoneNumbers !== undefined) {
      person.phoneNumbers = this.preparePhones(
        dto.phoneNumbers,
      );

      identityChanged = true;
    }

    if (
      !person.emails.length &&
      !person.phoneNumbers.length
    ) {
      throw new BadRequestException(
        'At least one email or phone number is required.',
      );
    }

    if (identityChanged) {
      person.identityVersion += 1;
      person.identityStatus =
        PersonIdentityStatus.UNVERIFIED;

      await this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status: {
            $in: [
              VerificationSessionStatus.PENDING,
              VerificationSessionStatus.VERIFIED,
            ],
          },
        },
        {
          $set: {
            status:
              VerificationSessionStatus.REVOKED,
          },
        },
      );
    }

    await person.save();

    return person;
  }

  async grantConsent(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.memoryAccessConsentGranted = true;
    person.memoryAccessConsentGrantedAt =
      new Date();
    person.memoryAccessConsentRevokedAt =
      undefined;

    await person.save();

    return person;
  }

  async revokeConsent(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.memoryAccessConsentGranted = false;
    person.memoryAccessConsentRevokedAt =
      new Date();
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status:
            VerificationSessionStatus.VERIFIED,
        },
        {
          $set: {
            status:
              VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return person;
  }

  async block(
    personId: string,
    // ownerUserId: string,
    reason?: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isBlocked = true;
    person.blockedReason =
      reason?.trim() || 'Blocked by owner';
    person.identityStatus =
      PersonIdentityStatus.BLOCKED;
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status: {
            $in: [
              VerificationSessionStatus.PENDING,
              VerificationSessionStatus.VERIFIED,
            ],
          },
        },
        {
          $set: {
            status:
              VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return person;
  }

  async unblock(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isBlocked = false;
    person.blockedReason = undefined;
    person.identityStatus =
      PersonIdentityStatus.UNVERIFIED;
    person.identityVersion += 1;

    await person.save();

    return person;
  }

  async archive(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isArchived = true;

    await person.save();

    return person;
  }

  async restore(
    personId: string,
    // ownerUserId: string,
  ) {
    this.validateObjectId(personId, 'person ID');
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const person = await this.memoryPersonModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(personId),
          // ownerUserId: new Types.ObjectId(
          //   ownerUserId,
          // ),
          isActive: true,
        },
        {
          $set: {
            isArchived: false,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!person) {
      throw new NotFoundException(
        'Memory person not found.',
      );
    }

    return person;
  }

  async remove(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isActive = false;
    person.isArchived = true;
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
        },
        {
          $set: {
            status:
              VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return {
      message: 'Memory person deleted successfully.',
    };
  }

  async getDocument(
    personId: string,
    // ownerUserId: string,
  ) {
    this.validateObjectId(personId, 'person ID');
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const person =
      await this.memoryPersonModel.findOne({
        _id: new Types.ObjectId(personId),
        // ownerUserId: new Types.ObjectId(
        //   ownerUserId,
        // ),
        isActive: true,
      });

    if (!person) {
      throw new NotFoundException(
        'Memory person not found.',
      );
    }

    return person;
  }

  private prepareEmails(
    emails?: Array<{
      email: string;
      isPrimary?: boolean;
    }>,
  ) {
    return (emails ?? []).map((item, index) => ({
      email: this.normalizeEmail(item.email),
      isVerified: false,
      isPrimary:
        item.isPrimary ??
        (emails?.length === 1 || index === 0),
    }));
  }

  private preparePhones(
    phoneNumbers?: Array<{
      phoneNumber: string;
      countryCode?: string;
      isPrimary?: boolean;
    }>,
  ) {
    return (phoneNumbers ?? []).map(
      (item, index) => ({
        phoneNumber: this.normalizePhone(
          item.phoneNumber,
        ),
        countryCode: item.countryCode?.trim(),
        isVerified: false,
        isPrimary:
          item.isPrimary ??
          (phoneNumbers?.length === 1 ||
            index === 0),
      }),
    );
  }

  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  normalizePhone(phone: string) {
    const normalized = phone
      .trim()
      .replace(/[^\d+]/g, '');

    if (
      !normalized.startsWith('+') ||
      !/^\+[1-9]\d{7,14}$/.test(normalized)
    ) {
      throw new BadRequestException(
        'Phone number must use valid E.164 format, for example +919876543210.',
      );
    }

    return normalized;
  }

  private normalizeTags(values?: string[]) {
    return [
      ...new Set(
        (values ?? [])
          .map((value) =>
            value
              .trim()
              .toLowerCase()
              .replace(/\s+/g, '-'),
          )
          .filter(Boolean),
      ),
    ];
  }

  private validateObjectId(
    value: string,
    fieldName: string,
  ) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }
  }
}