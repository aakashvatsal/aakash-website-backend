import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InjectModel,
} from '@nestjs/mongoose';

import {
  Model,
  Types,
} from 'mongoose';

import {
  CreateNowStatusDto,
} from './dto/create-now-status.dto';

import {
  NowHistoryQueryDto,
} from './dto/now-history-query.dto';

import {
  UpdateNowStatusDto,
} from './dto/update-now-status.dto';

import {
  NowSource,
  NowStatus,
  NowStatusDocument,
  NowVisibility,
} from './schemas/now-status.schema';

@Injectable()
export class NowService {
  constructor(
    @InjectModel(
      NowStatus.name,
    )
    private readonly nowStatusModel:
      Model<NowStatusDocument>,
  ) {}

  async create(
    data:
      CreateNowStatusDto,
  ) {
    const now =
      new Date();

    const startedAt =
      data.startedAt
        ? new Date(
            data.startedAt,
          )
        : now;

    const expiresAt =
      data.expiresAt
        ? new Date(
            data.expiresAt,
          )
        : undefined;

    const lastActivityAt =
      data.lastActivityAt
        ? new Date(
            data.lastActivityAt,
          )
        : now;

    if (
      Number.isNaN(
        startedAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid startedAt date.',
      );
    }

    if (
      expiresAt &&
      Number.isNaN(
        expiresAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid expiresAt date.',
      );
    }

    if (
      Number.isNaN(
        lastActivityAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid lastActivityAt date.',
      );
    }

    if (
      expiresAt &&
      expiresAt.getTime() <=
        startedAt.getTime()
    ) {
      throw new BadRequestException(
        'expiresAt must be later than startedAt.',
      );
    }

    await this.endCurrentStatus(
      startedAt,
    );

    try {
      const status =
        await this.nowStatusModel.create(
          {
            ...data,

            startedAt,

            expiresAt,

            lastActivityAt,

            isCurrent:
              true,

            isActive:
              true,

            isArchived:
              false,
          },
        );

      return status;
    } catch (
      error: any
    ) {
      if (
        error?.code ===
        11000
      ) {
        throw new BadRequestException(
          'Another current status already exists.',
        );
      }

      throw error;
    }
  }

  async findAll(
    query:
      NowHistoryQueryDto,
  ) {
    const page =
      query.page ??
      1;

    const limit =
      query.limit ??
      20;

    const filter:
      Record<
        string,
        unknown
      > = {};

    if (
      query.activityType
    ) {
      filter.activityType =
        query.activityType;
    }

    if (
      query.visibility
    ) {
      filter.visibility =
        query.visibility;
    }

    if (
      query.source
    ) {
      filter.source =
        query.source;
    }

    if (
      typeof query.isCurrent ===
      'boolean'
    ) {
      filter.isCurrent =
        query.isCurrent;
    }

    if (
      typeof query.isActive ===
      'boolean'
    ) {
      filter.isActive =
        query.isActive;
    } else {
      filter.isActive =
        true;
    }

    if (
      typeof query.isArchived ===
      'boolean'
    ) {
      filter.isArchived =
        query.isArchived;
    } else {
      filter.isArchived =
        false;
    }

    const [
      data,
      total,
    ] =
      await Promise.all([
        this.nowStatusModel
          .find(
            filter,
          )
          .sort({
            startedAt:
              -1,
          })
          .skip(
            (page -
              1) *
              limit,
          )
          .limit(
            limit,
          )
          .lean(),

        this.nowStatusModel.countDocuments(
          filter,
        ),
      ]);

    return {
      data,

      pagination: {
        page,

        limit,

        total,

        totalPages:
          Math.ceil(
            total /
              limit,
          ),
      },
    };
  }

  async findById(
    nowStatusId:
      string,
  ) {
    const status =
      await this.nowStatusModel
        .findOne({
          _id:
            this.toObjectId(
              nowStatusId,
            ),

          isActive:
            true,
        })
        .lean();

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    return status;
  }

  async getCurrent() {
    await this.expireCurrentIfNeeded();

    const status =
      await this.nowStatusModel
        .findOne({
          isCurrent:
            true,

          isActive:
            true,

          isArchived:
            false,
        })
        .sort({
          createdAt:
            -1,
        })
        .lean();

    return (
      status ??
      null
    );
  }

  async getCurrentDocument() {
    await this.expireCurrentIfNeeded();

    return this.nowStatusModel.findOne({
      isCurrent:
        true,

      isActive:
        true,

      isArchived:
        false,
    });
  }

  async canAutomaticSourceReplaceCurrent() {
    const current =
      await this.getCurrentDocument();

    if (!current) {
      return true;
    }

    if (
      current.source ===
      NowSource.MANUAL
    ) {
      return false;
    }

    if (
      current.source ===
      NowSource.HSAKAA
    ) {
      return false;
    }

    return true;
  }

  async getPublicCurrent() {
    await this.expireCurrentIfNeeded();

    const status =
      await this.nowStatusModel
        .findOne({
          isCurrent:
            true,

          isActive:
            true,

          isArchived:
            false,

          visibility:
            NowVisibility.PUBLIC,
        })
        .sort({
          createdAt:
            -1,
        })
        .lean();

    if (!status) {
      return null;
    }

    return this.toPublicStatus(
      status,
    );
  }

  async getHistory(
    page = 1,
    limit = 20,
  ) {
    const safePage =
      Math.max(
        1,
        Math.floor(
          page,
        ),
      );

    const safeLimit =
      Math.min(
        Math.max(
          1,
          Math.floor(
            limit,
          ),
        ),
        100,
      );

    const filter = {
      isCurrent:
        false,

      isActive:
        true,

      isArchived:
        false,
    };

    const [
      data,
      total,
    ] =
      await Promise.all([
        this.nowStatusModel
          .find(
            filter,
          )
          .sort({
            startedAt:
              -1,
          })
          .skip(
            (safePage -
              1) *
              safeLimit,
          )
          .limit(
            safeLimit,
          )
          .lean(),

        this.nowStatusModel.countDocuments(
          filter,
        ),
      ]);

    return {
      data,

      pagination: {
        page:
          safePage,

        limit:
          safeLimit,

        total,

        totalPages:
          Math.ceil(
            total /
              safeLimit,
          ),
      },
    };
  }

  async update(
    nowStatusId:
      string,
    data:
      UpdateNowStatusDto,
  ) {
    const status =
      await this.nowStatusModel.findOne({
        _id:
          this.toObjectId(
            nowStatusId,
          ),

        isActive:
          true,
      });

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    if (
      data.startedAt
    ) {
      const startedAt =
        new Date(
          data.startedAt,
        );

      if (
        Number.isNaN(
          startedAt.getTime(),
        )
      ) {
        throw new BadRequestException(
          'Invalid startedAt date.',
        );
      }

      status.startedAt =
        startedAt;
    }

    if (
      data.expiresAt !==
      undefined
    ) {
      if (
        data.expiresAt
      ) {
        const expiresAt =
          new Date(
            data.expiresAt,
          );

        if (
          Number.isNaN(
            expiresAt.getTime(),
          )
        ) {
          throw new BadRequestException(
            'Invalid expiresAt date.',
          );
        }

        status.expiresAt =
          expiresAt;
      } else {
        status.expiresAt =
          undefined;
      }
    }

    if (
      data.lastActivityAt
    ) {
      const lastActivityAt =
        new Date(
          data.lastActivityAt,
        );

      if (
        Number.isNaN(
          lastActivityAt.getTime(),
        )
      ) {
        throw new BadRequestException(
          'Invalid lastActivityAt date.',
        );
      }

      status.lastActivityAt =
        lastActivityAt;
    }

    const {
      startedAt,
      expiresAt,
      lastActivityAt,
      ...rest
    } = data;

    Object.assign(
      status,
      rest,
    );

    if (
      status.expiresAt &&
      status.expiresAt.getTime() <=
        status.startedAt.getTime()
    ) {
      throw new BadRequestException(
        'expiresAt must be later than startedAt.',
      );
    }

    await status.save();

    return status;
  }

  async setCurrent(
    nowStatusId:
      string,
  ) {
    const status =
      await this.nowStatusModel.findOne({
        _id:
          this.toObjectId(
            nowStatusId,
          ),

        isActive:
          true,

        isArchived:
          false,
      });

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    if (
      status.isCurrent
    ) {
      return status;
    }

    const now =
      new Date();

    await this.endCurrentStatus(
      now,
    );

    status.isCurrent =
      true;

    status.startedAt =
      now;

    status.endedAt =
      undefined;

    status.lastActivityAt =
      now;

    if (
      status.expiresAt &&
      status.expiresAt.getTime() <=
        now.getTime()
    ) {
      status.expiresAt =
        undefined;
    }

    await status.save();

    return status;
  }

  async endCurrent() {
    const status =
      await this.nowStatusModel.findOne({
        isCurrent:
          true,

        isActive:
          true,

        isArchived:
          false,
      });

    if (!status) {
      return null;
    }

    const now =
      new Date();

    status.isCurrent =
      false;

    status.endedAt =
      now;

    status.lastActivityAt =
      now;

    await status.save();

    return status;
  }

  async touchCurrent() {
    const status =
      await this.nowStatusModel.findOne({
        isCurrent:
          true,

        isActive:
          true,

        isArchived:
          false,
      });

    if (!status) {
      return null;
    }

    status.lastActivityAt =
      new Date();

    await status.save();

    return status;
  }

  async archive(
    nowStatusId:
      string,
  ) {
    const status =
      await this.nowStatusModel.findOne({
        _id:
          this.toObjectId(
            nowStatusId,
          ),

        isActive:
          true,
      });

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    const now =
      new Date();

    status.isArchived =
      true;

    status.isCurrent =
      false;

    status.endedAt =
      status.endedAt ??
      now;

    await status.save();

    return status;
  }

  async restore(
    nowStatusId:
      string,
  ) {
    const status =
      await this.nowStatusModel.findOne({
        _id:
          this.toObjectId(
            nowStatusId,
          ),

        isActive:
          true,
      });

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    status.isArchived =
      false;

    await status.save();

    return status;
  }

  async remove(
    nowStatusId:
      string,
  ) {
    const status =
      await this.nowStatusModel.findOne({
        _id:
          this.toObjectId(
            nowStatusId,
          ),

        isActive:
          true,
      });

    if (!status) {
      throw new NotFoundException(
        'Now status not found.',
      );
    }

    const now =
      new Date();

    status.isActive =
      false;

    status.isCurrent =
      false;

    status.endedAt =
      status.endedAt ??
      now;

    await status.save();

    return {
      success:
        true,

      message:
        'Now status removed successfully.',
    };
  }

  private async endCurrentStatus(
    endedAt:
      Date,
  ) {
    await this.nowStatusModel.updateMany(
      {
        isCurrent:
          true,

        isActive:
          true,
      },
      {
        $set: {
          isCurrent:
            false,

          endedAt,
        },
      },
    );
  }

  private async expireCurrentIfNeeded() {
    const now =
      new Date();

    await this.nowStatusModel.updateMany(
      {
        isCurrent:
          true,

        isActive:
          true,

        expiresAt: {
          $lte:
            now,
        },
      },
      {
        $set: {
          isCurrent:
            false,

          endedAt:
            now,
        },
      },
    );
  }

  private toPublicStatus(
    status: any,
  ) {
    const response = {
      ...status,
    };

    if (
      !status.showLocation
    ) {
      delete response.locationName;
      delete response.locationType;
    }

    if (
      !status.showAvailability
    ) {
      delete response.availability;
    }

    if (
      !status.showMood
    ) {
      delete response.mood;
    }

    if (
      !status.showHealth
    ) {
      delete response.health;
      delete response.energyScore;
    }

    delete response.metadata;

    return response;
  }

  private toObjectId(
    id:
      string,
  ) {
    if (
      !Types.ObjectId.isValid(
        id,
      )
    ) {
      throw new BadRequestException(
        'Invalid now status ID.',
      );
    }

    return new Types.ObjectId(
      id,
    );
  }
}