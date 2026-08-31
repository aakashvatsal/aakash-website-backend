import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  RelationshipContactGapQueryDto,
  RelationshipContextSearchQueryDto,
  UpdatePersonRelationshipContextDto,
} from './dto/person-relationship-context.dto';
import { PersonOpenLoopsService } from './person-open-loops.service';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import {
  PersonInteraction,
  PersonInteractionDocument,
} from './schemas/person-interaction.schema';
import {
  PersonOpenLoopKind,
  PersonOpenLoopStatus,
} from './schemas/person-open-loop.schema';
import {
  PersonRelationshipContext,
  PersonRelationshipContextDocument,
} from './schemas/person-relationship-context.schema';

const DEFAULT_DORMANT_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PersonRelationshipContextService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly personModel: Model<MemoryPersonDocument>,
    @InjectModel(PersonInteraction.name)
    private readonly interactionModel: Model<PersonInteractionDocument>,
    @InjectModel(PersonRelationshipContext.name)
    private readonly contextModel: Model<PersonRelationshipContextDocument>,
    private readonly personOpenLoopsService: PersonOpenLoopsService,
  ) {}

  async getForPerson(personId: string, dormantDays = DEFAULT_DORMANT_DAYS) {
    const person = await this.getActivePerson(personId);
    const personObjectId = person._id;

    const [context, recentInteractions, openLoops] = await Promise.all([
      this.contextModel.findOne({ personId: personObjectId }).lean(),
      this.interactionModel
        .find({ participantIds: personObjectId })
        .sort({ occurredAt: -1 })
        .limit(3)
        .lean(),
      this.personOpenLoopsService.findForPerson(personId, {
        status: PersonOpenLoopStatus.OPEN,
        limit: 200,
      }),
    ]);

    const introducedBy = context?.introducedByPersonId
      ? await this.personModel
          .findOne({
            _id: context.introducedByPersonId,
            isActive: true,
            isArchived: false,
          })
          .select(this.personSummaryProjection())
          .lean()
      : null;

    const lastRecordedInteraction = recentInteractions[0];
    const lastContactAt = this.latestDate(
      lastRecordedInteraction?.occurredAt,
      person.lastInteractionAt,
    );
    const knownSinceAt =
      person.firstMetAt ?? this.readTimestamp(person, 'createdAt') ?? null;
    const daysSinceLastContact = this.daysSince(lastContactAt);
    const daysSinceKnown = this.daysSince(knownSinceAt);
    const preferredCadence = context?.preferredContactCadenceDays;

    const commitments = openLoops.data.filter(
      (item) =>
        item.kind === PersonOpenLoopKind.PROMISE_I_MADE ||
        item.kind === PersonOpenLoopKind.PROMISE_THEY_MADE,
    );

    return {
      person: this.toPersonSummary(person),
      explicitContext: {
        introducedBy: introducedBy ? this.toPersonSummary(introducedBy) : null,
        howWeMet: context?.howWeMet,
        connectionContexts: context?.connectionContexts ?? [],
        preferredContactCadenceDays: preferredCadence,
        relationshipNotes: context?.relationshipNotes,
        metadata: context?.metadata ?? {},
        updatedAt: this.readTimestamp(context, 'updatedAt'),
      },
      contact: {
        hasRecordedContact: lastContactAt !== null,
        lastContactAt,
        lastContactSource: lastRecordedInteraction
          ? 'interaction'
          : person.lastInteractionAt
            ? 'directory'
            : 'none',
        daysSinceLastContact,
        knownSinceAt,
        daysSinceKnown,
        dormantAfterDays: dormantDays,
        isDormant:
          daysSinceLastContact !== null && daysSinceLastContact >= dormantDays,
        preferredContactCadenceDays: preferredCadence,
        isCadenceOverdue:
          Boolean(preferredCadence) &&
          daysSinceLastContact !== null &&
          daysSinceLastContact >= (preferredCadence ?? Number.MAX_SAFE_INTEGER),
      },
      recentDiscussions: recentInteractions.map((interaction) => ({
        interactionId: interaction._id.toString(),
        occurredAt: interaction.occurredAt,
        type: interaction.type,
        channel: interaction.channel,
        summary: interaction.summary,
        topics: interaction.tags ?? [],
      })),
      commitments,
      openLoopSummary: openLoops.summary,
      generatedAt: new Date(),
    };
  }

  async update(personId: string, dto: UpdatePersonRelationshipContextDto) {
    const person = await this.getActivePerson(personId);
    const personObjectId = person._id;
    let introducedByPersonId: Types.ObjectId | undefined;

    if (dto.introducedByPersonId) {
      if (dto.introducedByPersonId === personId) {
        throw new BadRequestException('A person cannot introduce themselves.');
      }

      const introducer = await this.getActivePerson(dto.introducedByPersonId);
      introducedByPersonId = introducer._id;
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    if (dto.introducedByPersonId !== undefined) {
      if (dto.introducedByPersonId === null) {
        unset.introducedByPersonId = 1;
      } else {
        set.introducedByPersonId = introducedByPersonId;
      }
    }

    this.assignNullableText(dto, 'howWeMet', set, unset);
    this.assignNullableText(dto, 'relationshipNotes', set, unset);

    if (dto.connectionContexts !== undefined) {
      set.connectionContexts = this.normalizeContexts(dto.connectionContexts);
    }

    if (dto.preferredContactCadenceDays !== undefined) {
      if (dto.preferredContactCadenceDays === null) {
        unset.preferredContactCadenceDays = 1;
      } else {
        set.preferredContactCadenceDays = dto.preferredContactCadenceDays;
      }
    }

    if (dto.metadata !== undefined) {
      set.metadata = dto.metadata;
    }

    const update: Record<string, unknown> = {
      $setOnInsert: { personId: personObjectId },
    };
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    await this.contextModel.findOneAndUpdate(
      { personId: personObjectId },
      update,
      { upsert: true, new: true, runValidators: true },
    );

    return this.getForPerson(personId);
  }

  async getContactGaps(query: RelationshipContactGapQueryDto = {}) {
    const days = Math.min(
      Math.max(query.days ?? DEFAULT_DORMANT_DAYS, 1),
      3650,
    );
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const now = new Date();
    const [people, contexts] = await Promise.all([
      this.personModel
        .find({ isActive: true, isArchived: false })
        .select({
          ...this.personSummaryProjection(),
          firstMetAt: 1,
          createdAt: 1,
          tags: 1,
        })
        .lean(),
      this.contextModel.find({}).lean(),
    ]);

    const contextsByPerson = new Map(
      contexts.map((context) => [context.personId.toString(), context]),
    );
    const contextQuery = this.cleanSearchContext(query.context);

    const data = people
      .filter((person) =>
        this.matchesContext(person, contextsByPerson, contextQuery),
      )
      .map((person) => {
        const createdAt = this.readTimestamp(person, 'createdAt');
        const lastContactAt = person.lastInteractionAt ?? null;
        const knownSinceAt = person.firstMetAt ?? createdAt ?? null;
        const referenceDate = lastContactAt ?? knownSinceAt;
        const referenceSource = lastContactAt
          ? 'last_contact'
          : person.firstMetAt
            ? 'first_met'
            : createdAt
              ? 'directory_created'
              : 'unknown';
        const daysSinceReference = this.daysBetween(referenceDate, now);
        const daysSinceLastContact = lastContactAt
          ? this.daysBetween(lastContactAt, now)
          : null;
        const explicit = contextsByPerson.get(person._id.toString());

        return {
          person: this.toPersonSummary(person),
          connectionContexts: explicit?.connectionContexts ?? [],
          hasRecordedContact: lastContactAt !== null,
          lastContactAt,
          daysSinceLastContact,
          knownSinceAt,
          daysSinceKnown: this.daysBetween(knownSinceAt, now),
          gapReferenceAt: referenceDate,
          gapReferenceSource: referenceSource,
          daysSinceGapReference: daysSinceReference,
          preferredContactCadenceDays: explicit?.preferredContactCadenceDays,
          cadenceOverdue:
            Boolean(explicit?.preferredContactCadenceDays) &&
            daysSinceLastContact !== null &&
            daysSinceLastContact >=
              (explicit?.preferredContactCadenceDays ??
                Number.MAX_SAFE_INTEGER),
        };
      })
      .filter(
        (item) =>
          item.daysSinceGapReference !== null &&
          item.daysSinceGapReference >= days,
      )
      .sort((a, b) => {
        const importanceDelta =
          (b.person.importance ?? 3) - (a.person.importance ?? 3);
        if (importanceDelta) return importanceDelta;
        return (b.daysSinceGapReference ?? 0) - (a.daysSinceGapReference ?? 0);
      })
      .slice(0, limit);

    return {
      data,
      summary: {
        dormantDays: days,
        count: data.length,
        recordedContactGapCount: data.filter((item) => item.hasRecordedContact)
          .length,
        neverContactedCount: data.filter((item) => !item.hasRecordedContact)
          .length,
        context: query.context?.trim() || null,
      },
      generatedAt: now,
    };
  }

  async findPeopleByContext(query: RelationshipContextSearchQueryDto) {
    const contextQuery = this.cleanSearchContext(query.context);
    if (!contextQuery) {
      throw new BadRequestException('Relationship context is required.');
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const [people, contexts] = await Promise.all([
      this.personModel
        .find({ isActive: true, isArchived: false })
        .select({ ...this.personSummaryProjection(), tags: 1 })
        .lean(),
      this.contextModel.find({}).lean(),
    ]);
    const contextsByPerson = new Map(
      contexts.map((context) => [context.personId.toString(), context]),
    );

    const data = people
      .filter((person) =>
        this.matchesContext(person, contextsByPerson, contextQuery),
      )
      .sort((a, b) => (b.importance ?? 3) - (a.importance ?? 3))
      .slice(0, limit)
      .map((person) => ({
        person: this.toPersonSummary(person),
        connectionContexts:
          contextsByPerson.get(person._id.toString())?.connectionContexts ?? [],
      }));

    return {
      query: query.context.trim(),
      data,
      total: data.length,
      generatedAt: new Date(),
    };
  }

  private async getActivePerson(personId: string) {
    this.assertObjectId(personId, 'person ID');
    const person = await this.personModel
      .findOne({
        _id: new Types.ObjectId(personId),
        isActive: true,
        isArchived: false,
      })
      .lean();

    if (!person) {
      throw new NotFoundException('Memory person not found.');
    }

    return person;
  }

  private matchesContext(
    person: MemoryPerson & { _id: Types.ObjectId },
    contextsByPerson: Map<string, PersonRelationshipContext>,
    query: string,
  ) {
    if (!query) return true;

    const explicit = contextsByPerson.get(person._id.toString());
    const values = [
      person.organizationName,
      ...(person.tags ?? []),
      ...(explicit?.connectionContexts ?? []),
    ];

    return values.some((value) =>
      value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
  }

  private toPersonSummary(person: MemoryPerson & { _id: Types.ObjectId }) {
    return {
      personId: person._id.toString(),
      name: person.preferredName || person.name,
      fullName: person.name,
      relationship: person.relationship,
      relationshipLabel: person.relationshipLabel,
      organizationName: person.organizationName,
      roleTitle: person.roleTitle,
      importance: person.importance ?? 3,
      lastInteractionAt: person.lastInteractionAt,
    };
  }

  private personSummaryProjection() {
    return {
      name: 1,
      preferredName: 1,
      relationship: 1,
      relationshipLabel: 1,
      organizationName: 1,
      roleTitle: 1,
      importance: 1,
      lastInteractionAt: 1,
    } as const;
  }

  private normalizeContexts(values: string[]) {
    return [
      ...new Set(
        values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
      ),
    ];
  }

  private cleanSearchContext(value?: string) {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private assignNullableText(
    dto: UpdatePersonRelationshipContextDto,
    field: 'howWeMet' | 'relationshipNotes',
    set: Record<string, unknown>,
    unset: Record<string, 1>,
  ) {
    const value = dto[field];
    if (value === undefined) return;
    const cleaned = value?.trim();
    if (cleaned) set[field] = cleaned;
    else unset[field] = 1;
  }

  private latestDate(...values: Array<Date | undefined | null>) {
    const valid = values.filter(
      (value): value is Date => value instanceof Date,
    );
    if (!valid.length) return null;
    return new Date(Math.max(...valid.map((value) => value.getTime())));
  }

  private daysSince(value: Date | null) {
    return this.daysBetween(value, new Date());
  }

  private daysBetween(value: Date | null | undefined, now: Date) {
    if (!value) return null;
    const timestamp =
      value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(timestamp)) return null;
    return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
  }

  private readTimestamp(value: unknown, field: string): Date | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = (value as Record<string, unknown>)[field];
    if (candidate instanceof Date) return candidate;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
  }

  private assertObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
