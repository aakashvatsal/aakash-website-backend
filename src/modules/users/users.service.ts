import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  QueryFilter,
  Model,
  Types,
} from 'mongoose';
import * as bcrypt from 'bcrypt';

import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import {
  User,
  UserDocument,
} from './schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto) {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.userModel.exists({
      email,
    });

    if (existing) {
      throw new ConflictException(
        'An account with this email already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(
      dto.password,
      this.passwordSaltRounds,
    );

    const user = await this.userModel.create({
      ...dto,
      name: dto.name.trim(),
      email,
      password: hashedPassword,
      timezone: dto.timezone || 'Asia/Kolkata',
    });

    return this.sanitizeUser(user.toObject());
  }

  async validateLogin(dto: LoginUserDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.userModel
      .findOne({
        email,
        isActive: true,
        isArchived: false,
      })
      .select('+password');

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    user.lastLoginAt = new Date();

    await user.save();

    return this.sanitizeUser(user.toObject());
  }

  async findAll(query: UserQueryDto) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(
      Math.max(query.limit || 20, 1),
      100,
    );

    const filter: QueryFilter<UserDocument> = {};

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.isEmailVerified !== undefined) {
      filter.isEmailVerified =
        query.isEmailVerified;
    }

    if (query.search?.trim()) {
      const search = this.escapeRegex(
        query.search.trim(),
      );

      filter.$or = [
        {
          name: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          email: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.userModel.countDocuments(filter),
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

  async findOne(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        isActive: true,
        isArchived: false,
      })
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return user;
  }

  async findByEmail(emailValue: string) {
    const email = this.normalizeEmail(emailValue);

    const user = await this.userModel
      .findOne({
        email,
        isActive: true,
        isArchived: false,
      })
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return user;
  }

  async findByEmailWithPassword(
    emailValue: string,
  ) {
    const email = this.normalizeEmail(emailValue);

    return this.userModel
      .findOne({
        email,
        isActive: true,
        isArchived: false,
      })
      .select('+password');
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
  ) {
    this.validateObjectId(userId, 'user ID');

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }

    const updated = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isActive: true,
          isArchived: false,
        },
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return updated;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ) {
    this.validateObjectId(userId, 'user ID');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        isActive: true,
        isArchived: false,
      })
      .select('+password');

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Current password is incorrect.',
      );
    }

    user.password = await bcrypt.hash(
      dto.newPassword,
      this.passwordSaltRounds,
    );

    user.passwordChangedAt = new Date();

    await user.save();

    return {
      message: 'Password changed successfully.',
    };
  }

  async changeEmail(
    userId: string,
    dto: ChangeEmailDto,
  ) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(userId),
        isActive: true,
        isArchived: false,
      })
      .select('+password');

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Password is incorrect.',
      );
    }

    const email = this.normalizeEmail(dto.email);

    if (email === user.email) {
      throw new BadRequestException(
        'New email must be different from the current email.',
      );
    }

    const duplicate = await this.userModel.exists({
      _id: {
        $ne: user._id,
      },
      email,
    });

    if (duplicate) {
      throw new ConflictException(
        'An account with this email already exists.',
      );
    }

    user.email = email;
    user.isEmailVerified = false;
    user.emailVerifiedAt = undefined;

    await user.save();

    return this.sanitizeUser(user.toObject());
  }

  async verifyEmail(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isActive: true,
          isArchived: false,
        },
        {
          $set: {
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return user;
  }

  async updateLastLogin(userId: string) {
    this.validateObjectId(userId, 'user ID');

    await this.userModel.updateOne(
      {
        _id: new Types.ObjectId(userId),
        isActive: true,
        isArchived: false,
      },
      {
        $set: {
          lastLoginAt: new Date(),
        },
      },
    );
  }

  async deactivate(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            isActive: false,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return {
      message: 'Account deactivated successfully.',
    };
  }

  async reactivate(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isActive: false,
          isArchived: false,
        },
        {
          $set: {
            isActive: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found or already active.',
      );
    }

    return user;
  }

  async archive(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isArchived: false,
        },
        {
          $set: {
            isArchived: true,
            isActive: false,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    return {
      message: 'User archived successfully.',
    };
  }

  async restore(userId: string) {
    this.validateObjectId(userId, 'user ID');

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isArchived: true,
        },
        {
          $set: {
            isArchived: false,
            isActive: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!user) {
      throw new NotFoundException(
        'Archived user not found.',
      );
    }

    return user;
  }

  async remove(userId: string) {
    return this.archive(userId);
  }

  private sanitizeUser(
    user: Record<string, any>,
  ) {
    const {
      password,
      ...safeUser
    } = user;

    return safeUser;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private escapeRegex(value: string) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
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