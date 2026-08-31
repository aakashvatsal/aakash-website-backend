import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';

import {
  ClosePersonOpenLoopDto,
  CreatePersonOpenLoopDto,
  PersonOpenLoopQueryDto,
  ReopenPersonOpenLoopDto,
  UpdatePersonOpenLoopDto,
} from './dto/person-open-loop.dto';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import {
  PersonInteraction,
  PersonInteractionDocument,
} from './schemas/person-interaction.schema';
import {
  PersonOpenLoop,
  PersonOpenLoopDocument,
  PersonOpenLoopStatus,
} from './schemas/person-open-loop.schema';

@Injectable()
export class PersonOpenLoopsService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly personModel: Model<MemoryPersonDocument>,
    @InjectModel(PersonInteraction.name)
    private readonly interactionModel: Model<PersonInteractionDocument>,
    @InjectModel(PersonOpenLoop.name)
    private readonly openLoopModel: Model<PersonOpenLoopDocument>,
  ) {}

  async create(personId: string, dto: CreatePersonOpenLoopDto) {
    const personObjectId = await this.assertActivePerson(personId);
    const sourceInteractionId = dto.sourceInteractionId
      ? new Types.ObjectId(dto.sourceInteractionId)
      : undefined;

    if (sourceInteractionId) {
      await this.assertInteractionBelongsToPerson(
        sourceInteractionId,
        personObjectId,
      );
    }

    return this.openLoopModel.create({
      personId: personObjectId,
      kind: dto.kind,
      status: PersonOpenLoopStatus.OPEN,
      title: this.requireText(dto.title, 'Open-loop title'),
      details: this.cleanOptionalText(dto.details),
      dueAt: this.parseOptionalDate(dto.dueAt, 'due date'),
      sourceInteractionId,
      metadata: dto.metadata ?? {},
    });
  }

  async findForPerson(personId: string, query: PersonOpenLoopQueryDto = {}) {
    const personObjectId = await this.assertActivePerson(personId);
    const filter = this.buildFilter(query, personObjectId);
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);

    const [data, summary] = await Promise.all([
      this.openLoopModel
        .find(filter)
        .sort({ status: 1, dueAt: 1, createdAt: -1 })
        .limit(limit)
        .lean(),
      this.getSummary({ personId: personObjectId }),
    ]);

    return {
      data: this.sortByFollowUpPriority(data),
      summary,
    };
  }

  async getOpenQueue(query: PersonOpenLoopQueryDto = {}) {
    const filter = this.buildFilter(
      {
        ...query,
        status: PersonOpenLoopStatus.OPEN,
      },
      undefined,
    );
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const [data, summary] = await Promise.all([
      this.openLoopModel
        .find(filter)
        .populate({
          path: 'personId',
          select:
            'name preferredName relationship organizationName roleTitle importance lastInteractionAt isActive isArchived',
          match: { isActive: true, isArchived: false },
        })
        .limit(Math.min(limit * 3, 200))
        .lean(),
      this.getSummary(),
    ]);

    const activePeopleOnly = data.filter((item) => item.personId);

    return {
      data: this.sortByFollowUpPriority(activePeopleOnly).slice(0, limit),
      summary,
      generatedAt: new Date(),
    };
  }

  async update(
    personId: string,
    openLoopId: string,
    dto: UpdatePersonOpenLoopDto,
  ) {
    const loop = await this.getDocument(personId, openLoopId);

    if (loop.status !== PersonOpenLoopStatus.OPEN) {
      throw new BadRequestException(
        'Only open relationship loops can be edited. Reopen this loop first.',
      );
    }

    if (dto.kind !== undefined) {
      loop.kind = dto.kind;
    }

    if (dto.title !== undefined) {
      loop.title = this.requireText(dto.title, 'Open-loop title');
    }

    if (dto.details !== undefined) {
      loop.details = this.cleanOptionalText(dto.details);
    }

    if (dto.dueAt !== undefined) {
      loop.dueAt = this.parseNullableDate(dto.dueAt, 'due date');
    }

    if (dto.sourceInteractionId !== undefined) {
      if (dto.sourceInteractionId === null) {
        loop.sourceInteractionId = undefined;
      } else {
        const sourceInteractionId = new Types.ObjectId(dto.sourceInteractionId);
        await this.assertInteractionBelongsToPerson(
          sourceInteractionId,
          loop.personId,
        );
        loop.sourceInteractionId = sourceInteractionId;
      }
    }

    if (dto.metadata !== undefined) {
      loop.metadata = dto.metadata;
    }

    return loop.save();
  }

  async resolve(
    personId: string,
    openLoopId: string,
    dto: ClosePersonOpenLoopDto = {},
  ) {
    const loop = await this.getDocument(personId, openLoopId);

    if (loop.status === PersonOpenLoopStatus.RESOLVED) {
      return loop;
    }

    if (loop.status !== PersonOpenLoopStatus.OPEN) {
      throw new BadRequestException(
        'Dismissed relationship loops must be reopened before they can be resolved.',
      );
    }

    loop.status = PersonOpenLoopStatus.RESOLVED;
    loop.resolvedAt = new Date();
    loop.dismissedAt = undefined;
    loop.resolutionNote = this.cleanOptionalText(dto.resolutionNote);

    return loop.save();
  }

  async dismiss(
    personId: string,
    openLoopId: string,
    dto: ClosePersonOpenLoopDto = {},
  ) {
    const loop = await this.getDocument(personId, openLoopId);

    if (loop.status === PersonOpenLoopStatus.DISMISSED) {
      return loop;
    }

    if (loop.status !== PersonOpenLoopStatus.OPEN) {
      throw new BadRequestException(
        'Resolved relationship loops must be reopened before they can be dismissed.',
      );
    }

    loop.status = PersonOpenLoopStatus.DISMISSED;
    loop.dismissedAt = new Date();
    loop.resolvedAt = undefined;
    loop.resolutionNote = this.cleanOptionalText(dto.resolutionNote);

    return loop.save();
  }

  async reopen(
    personId: string,
    openLoopId: string,
    dto: ReopenPersonOpenLoopDto = {},
  ) {
    const loop = await this.getDocument(personId, openLoopId);

    loop.status = PersonOpenLoopStatus.OPEN;
    loop.resolvedAt = undefined;
    loop.dismissedAt = undefined;
    loop.resolutionNote = undefined;

    if (dto.dueAt !== undefined) {
      loop.dueAt = this.parseNullableDate(dto.dueAt, 'due date');
    }

    return loop.save();
  }

  private async getDocument(personId: string, openLoopId: string) {
    const personObjectId = await this.assertActivePerson(personId);
    this.assertObjectId(openLoopId, 'open-loop ID');

    const loop = await this.openLoopModel.findOne({
      _id: new Types.ObjectId(openLoopId),
      personId: personObjectId,
    });

    if (!loop) {
      throw new NotFoundException('Relationship open loop not found.');
    }

    return loop;
  }

  private async assertActivePerson(personId: string) {
    this.assertObjectId(personId, 'person ID');
    const personObjectId = new Types.ObjectId(personId);
    const exists = await this.personModel.exists({
      _id: personObjectId,
      isActive: true,
      isArchived: false,
    });

    if (!exists) {
      throw new NotFoundException('Memory person not found.');
    }

    return personObjectId;
  }

  private async assertInteractionBelongsToPerson(
    interactionId: Types.ObjectId,
    personId: Types.ObjectId,
  ) {
    const exists = await this.interactionModel.exists({
      _id: interactionId,
      participantIds: personId,
    });

    if (!exists) {
      throw new BadRequestException(
        'Source interaction is not linked to this person.',
      );
    }
  }

  private buildFilter(
    query: PersonOpenLoopQueryDto,
    personId?: Types.ObjectId,
  ): QueryFilter<PersonOpenLoopDocument> {
    const filter: QueryFilter<PersonOpenLoopDocument> = {};

    if (personId) {
      filter.personId = personId;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.kind) {
      filter.kind = query.kind;
    }

    const dueAt: { $gte?: Date; $lte?: Date; $lt?: Date } = {};

    if (query.dueAfter) {
      dueAt.$gte = this.parseRequiredDate(query.dueAfter, 'due-after date');
    }

    if (query.dueBefore) {
      dueAt.$lte = this.parseRequiredDate(query.dueBefore, 'due-before date');
    }

    if (query.overdueOnly) {
      dueAt.$lt = new Date();
    }

    if (Object.keys(dueAt).length > 0) {
      filter.dueAt = dueAt;
    }

    return filter;
  }

  private async getSummary(options: { personId?: Types.ObjectId } = {}) {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const base = options.personId ? { personId: options.personId } : {};
    const open = { ...base, status: PersonOpenLoopStatus.OPEN };

    const [openCount, overdue, dueSoon, noDue, resolved, dismissed] =
      await Promise.all([
        this.openLoopModel.countDocuments(open),
        this.openLoopModel.countDocuments({
          ...open,
          dueAt: { $lt: now },
        }),
        this.openLoopModel.countDocuments({
          ...open,
          dueAt: { $gte: now, $lte: sevenDaysFromNow },
        }),
        this.openLoopModel.countDocuments({
          ...open,
          dueAt: { $exists: false },
        }),
        this.openLoopModel.countDocuments({
          ...base,
          status: PersonOpenLoopStatus.RESOLVED,
        }),
        this.openLoopModel.countDocuments({
          ...base,
          status: PersonOpenLoopStatus.DISMISSED,
        }),
      ]);

    return {
      open: openCount,
      overdue,
      dueWithinSevenDays: dueSoon,
      withoutDueDate: noDue,
      resolved,
      dismissed,
    };
  }

  private sortByFollowUpPriority<T extends { dueAt?: Date | string | null }>(
    items: T[],
  ) {
    return [...items].sort((left, right) => {
      const leftTime = this.dateSortValue(left.dueAt);
      const rightTime = this.dateSortValue(right.dueAt);

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return 0;
    });
  }

  private dateSortValue(value?: Date | string | null) {
    if (!value) {
      return Number.MAX_SAFE_INTEGER;
    }

    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  }

  private parseOptionalDate(value: string | undefined, fieldName: string) {
    if (!value) {
      return undefined;
    }

    return this.parseRequiredDate(value, fieldName);
  }

  private parseNullableDate(value: string | null, fieldName: string) {
    if (value === null || value.trim() === '') {
      return undefined;
    }

    return this.parseRequiredDate(value, fieldName);
  }

  private parseRequiredDate(value: string, fieldName: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }

    return date;
  }

  private cleanOptionalText(value?: string) {
    const cleaned = value?.trim();
    return cleaned || undefined;
  }

  private requireText(value: string, fieldName: string) {
    const cleaned = value.trim();

    if (!cleaned) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return cleaned;
  }

  private assertObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
