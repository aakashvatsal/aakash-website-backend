import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseDocument,
} from '../../hsakaa/schemas/hsakaa-decision-case.schema';
import {
  JournalEntry,
  JournalEntryDocument,
} from '../journal/schemas/journal-entry.schema';
import {
  MediaPost,
  MediaPostDocument,
} from '../media/schemas/media-post.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import {
  CreatePersonInteractionDto,
  PersonTimelineQueryDto,
} from './dto/person-interaction.dto';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import {
  Memory,
  MemoryDocument,
  MemoryEntityType,
  MemoryLifecycleStatus,
  MemoryPersonRelation,
  MemoryType,
} from './schemas/memory.schema';
import {
  PersonInteraction,
  PersonInteractionDocument,
} from './schemas/person-interaction.schema';

export type PersonTimelineEventType =
  | 'interaction'
  | 'memory'
  | 'commitment'
  | 'journal'
  | 'task'
  | 'media'
  | 'decision';

export interface PersonTimelineEvent {
  id: string;
  type: PersonTimelineEventType;
  occurredAt: Date;
  title: string;
  summary: string;
  attribution: string;
  personRelation?: MemoryPersonRelation | null;
  sourceId: string;
  linkedMemoryIds: string[];
  href?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PersonTimelineService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly personModel: Model<MemoryPersonDocument>,
    @InjectModel(PersonInteraction.name)
    private readonly interactionModel: Model<PersonInteractionDocument>,
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<MemoryDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,
    @InjectModel(MediaPost.name)
    private readonly mediaModel: Model<MediaPostDocument>,
    @InjectModel(HsakaaDecisionCase.name)
    private readonly decisionModel: Model<HsakaaDecisionCaseDocument>,
  ) {}

  async recordInteraction(personId: string, dto: CreatePersonInteractionDto) {
    this.assertObjectId(personId, 'person ID');

    const primaryPersonId = new Types.ObjectId(personId);
    const participantIds = this.uniqueObjectIds([
      personId,
      ...(dto.participantIds ?? []),
    ]);

    const people = await this.personModel
      .find({
        _id: { $in: participantIds },
        isActive: true,
        isArchived: false,
      })
      .select({ _id: 1 })
      .lean();

    if (people.length !== participantIds.length) {
      throw new BadRequestException(
        'Every interaction participant must be an active saved Person.',
      );
    }

    if (dto.linkedMemoryId) {
      await this.assertMemoryBelongsToParticipants(
        dto.linkedMemoryId,
        participantIds,
      );
    }

    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid interaction date.');
    }

    const interaction = await this.interactionModel.create({
      primaryPersonId,
      participantIds,
      type: dto.type,
      channel: dto.channel,
      direction: dto.direction,
      occurredAt,
      durationMinutes: dto.durationMinutes,
      summary: dto.summary.trim(),
      tags: this.normalizeTags(dto.tags),
      linkedMemoryId: dto.linkedMemoryId
        ? new Types.ObjectId(dto.linkedMemoryId)
        : undefined,
      sourceLabel: dto.sourceLabel?.trim() || undefined,
      sourceUrl: dto.sourceUrl?.trim() || undefined,
      metadata: dto.metadata ?? {},
    });

    await this.personModel.updateMany(
      { _id: { $in: participantIds } },
      { $max: { lastInteractionAt: occurredAt } },
    );

    return interaction.toObject();
  }

  async getTimeline(personId: string, query: PersonTimelineQueryDto = {}) {
    this.assertObjectId(personId, 'person ID');
    const personObjectId = new Types.ObjectId(personId);

    const person = await this.personModel
      .findOne({ _id: personObjectId, isActive: true, isArchived: false })
      .lean();

    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    const selectedTypes = new Set<PersonTimelineEventType>(
      query.types?.length
        ? query.types
        : [
            'interaction',
            'memory',
            'commitment',
            'journal',
            'task',
            'media',
            'decision',
          ],
    );
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);

    const [interactions, memories] = await Promise.all([
      selectedTypes.has('interaction')
        ? this.interactionModel
            .find({ participantIds: personObjectId })
            .sort({ occurredAt: -1 })
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      this.memoryModel
        .find({
          lifecycleStatus: { $ne: MemoryLifecycleStatus.FORGOTTEN },
          $or: [
            { personId: personObjectId },
            { 'personLinks.personId': personObjectId },
          ],
        })
        .sort({ happenedAt: -1, capturedAt: -1 })
        .limit(Math.max(limit * 3, 100))
        .lean(),
    ]);

    const memoryContexts = memories.map((memory) => ({
      memory,
      relation: this.getPersonRelation(memory, personObjectId),
    }));
    const memoryIds = memories.map((memory) => memory._id);

    const [tasks, journals, media] = memoryIds.length
      ? await Promise.all([
          selectedTypes.has('task')
            ? this.taskModel
                .find({ memoryIds: { $in: memoryIds }, isActive: true })
                .lean()
            : Promise.resolve([]),
          selectedTypes.has('journal')
            ? this.journalModel
                .find({ memoryIds: { $in: memoryIds }, isActive: true })
                .lean()
            : Promise.resolve([]),
          selectedTypes.has('media')
            ? this.mediaModel
                .find({ memoryIds: { $in: memoryIds }, isActive: true })
                .lean()
            : Promise.resolve([]),
        ])
      : [[], [], []];

    const decisionIds = this.collectDecisionIds(memories);
    const decisions =
      selectedTypes.has('decision') && decisionIds.length
        ? await this.decisionModel.find({ _id: { $in: decisionIds } }).lean()
        : [];

    const events: PersonTimelineEvent[] = [];

    for (const interaction of interactions) {
      events.push({
        id: `interaction:${interaction._id.toString()}`,
        type: 'interaction',
        occurredAt: interaction.occurredAt,
        title: this.humanize(interaction.type),
        summary: interaction.summary,
        attribution:
          interaction.primaryPersonId.toString() === personId
            ? 'primary_participant'
            : 'participant',
        sourceId: interaction._id.toString(),
        linkedMemoryIds: interaction.linkedMemoryId
          ? [interaction.linkedMemoryId.toString()]
          : [],
        metadata: {
          channel: interaction.channel,
          direction: interaction.direction,
          durationMinutes: interaction.durationMinutes ?? null,
          participantIds: interaction.participantIds.map((id) => id.toString()),
        },
      });
    }

    for (const { memory, relation } of memoryContexts) {
      const type: PersonTimelineEventType =
        memory.type === MemoryType.COMMITMENT ? 'commitment' : 'memory';
      if (!selectedTypes.has(type)) {
        continue;
      }
      events.push({
        id: `${type}:${memory._id.toString()}`,
        type,
        occurredAt: memory.happenedAt ?? memory.capturedAt,
        title:
          type === 'commitment' ? 'Commitment' : this.humanize(memory.type),
        summary: memory.content,
        attribution: relation ?? 'related',
        personRelation: relation,
        sourceId: memory._id.toString(),
        linkedMemoryIds: [memory._id.toString()],
        href: `/admin/hsakaa/memory/${memory._id.toString()}`,
        metadata: {
          lifecycleStatus: memory.lifecycleStatus,
          verificationStatus: memory.verificationStatus,
          scope: memory.scope,
        },
      });
    }

    const memoryRelationById = new Map(
      memoryContexts.map(({ memory, relation }) => [
        memory._id.toString(),
        relation,
      ]),
    );

    for (const task of tasks) {
      const linked = this.linkedMemoryContext(
        task.memoryIds,
        memoryRelationById,
      );
      events.push({
        id: `task:${task._id.toString()}`,
        type: 'task',
        occurredAt:
          task.completedAt ??
          task.dueAt ??
          task.startAt ??
          this.createdAt(task),
        title: task.title,
        summary: task.description ?? task.notes ?? task.status,
        attribution: 'linked_via_memory',
        personRelation: linked.relation,
        sourceId: task._id.toString(),
        linkedMemoryIds: linked.memoryIds,
        href: `/admin/tasks`,
        metadata: { status: task.status, priority: task.priority },
      });
    }

    for (const journal of journals) {
      const linked = this.linkedMemoryContext(
        journal.memoryIds,
        memoryRelationById,
      );
      events.push({
        id: `journal:${journal._id.toString()}`,
        type: 'journal',
        occurredAt: journal.date,
        title: journal.title,
        summary: journal.highlight ?? journal.content ?? '',
        attribution: 'linked_via_memory',
        personRelation: linked.relation,
        sourceId: journal._id.toString(),
        linkedMemoryIds: linked.memoryIds,
        href: `/admin/journal/${journal._id.toString()}`,
        metadata: { type: journal.type, visibility: journal.visibility },
      });
    }

    for (const post of media) {
      const linked = this.linkedMemoryContext(
        post.memoryIds,
        memoryRelationById,
      );
      events.push({
        id: `media:${post._id.toString()}`,
        type: 'media',
        occurredAt: post.date,
        title: post.content.title,
        summary:
          post.content.shortDescription ??
          post.content.hook ??
          post.content.caption ??
          '',
        attribution: 'linked_via_memory',
        personRelation: linked.relation,
        sourceId: post._id.toString(),
        linkedMemoryIds: linked.memoryIds,
        href: `/admin/media`,
        metadata: { platform: post.platform, postType: post.postType },
      });
    }

    const memoryIdsByDecisionId = this.memoryIdsByDecisionId(memories);
    for (const decision of decisions) {
      const linkedMemoryIds =
        memoryIdsByDecisionId.get(decision._id.toString()) ?? [];
      const linked = this.linkedMemoryContext(
        linkedMemoryIds.map((id) => new Types.ObjectId(id)),
        memoryRelationById,
      );
      events.push({
        id: `decision:${decision._id.toString()}`,
        type: 'decision',
        occurredAt: decision.generatedAt,
        title: decision.question,
        summary:
          decision.outcome?.evaluation?.summary ??
          decision.analysis?.summary ??
          '',
        attribution: 'linked_via_memory',
        personRelation: linked.relation,
        sourceId: decision._id.toString(),
        linkedMemoryIds,
        href: `/admin/hsakaa/intelligence`,
        metadata: {
          horizon: decision.horizon,
          hasCommitment: Boolean(decision.commitment),
          outcomeStatus: decision.outcome?.status ?? null,
        },
      });
    }

    events.sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );

    const sliced = events.slice(0, limit);
    const counts = events.reduce<Record<PersonTimelineEventType, number>>(
      (accumulator, event) => {
        accumulator[event.type] += 1;
        return accumulator;
      },
      {
        interaction: 0,
        memory: 0,
        commitment: 0,
        journal: 0,
        task: 0,
        media: 0,
        decision: 0,
      },
    );

    return {
      person: {
        personId,
        name: person.preferredName || person.name,
        fullName: person.name,
        organizationName: person.organizationName,
        roleTitle: person.roleTitle,
        lastInteractionAt: person.lastInteractionAt,
      },
      counts,
      total: events.length,
      events: sliced,
    };
  }

  private async assertMemoryBelongsToParticipants(
    memoryId: string,
    participantIds: Types.ObjectId[],
  ) {
    this.assertObjectId(memoryId, 'linked memory ID');
    const participantStrings = new Set(
      participantIds.map((id) => id.toString()),
    );
    const memory = await this.memoryModel
      .findOne({
        _id: new Types.ObjectId(memoryId),
        lifecycleStatus: { $ne: MemoryLifecycleStatus.FORGOTTEN },
      })
      .lean();

    if (!memory) {
      throw new BadRequestException('Linked memory was not found.');
    }

    const linkedPersonIds = new Set<string>();
    if (memory.personId) {
      linkedPersonIds.add(memory.personId.toString());
    }
    for (const link of memory.personLinks ?? []) {
      linkedPersonIds.add(link.personId.toString());
    }

    if (![...linkedPersonIds].some((id) => participantStrings.has(id))) {
      throw new BadRequestException(
        'Linked memory must already belong to one of the exact interaction participants.',
      );
    }
  }

  private getPersonRelation(
    memory: Memory & { _id: Types.ObjectId },
    personId: Types.ObjectId,
  ): MemoryPersonRelation | null {
    const link = (memory.personLinks ?? []).find((candidate) =>
      candidate.personId.equals(personId),
    );
    if (link) {
      return link.relation;
    }
    return memory.personId?.equals(personId)
      ? MemoryPersonRelation.PRIMARY_SUBJECT
      : null;
  }

  private collectDecisionIds(
    memories: Array<Memory & { _id: Types.ObjectId }>,
  ) {
    const ids = new Set<string>();
    for (const memory of memories) {
      for (const entity of memory.entities ?? []) {
        if (entity.type !== MemoryEntityType.DECISION) {
          continue;
        }
        const candidate = entity.entityId?.toString() ?? entity.externalId;
        if (candidate && Types.ObjectId.isValid(candidate)) {
          ids.add(candidate);
        }
      }
    }
    return [...ids].map((id) => new Types.ObjectId(id));
  }

  private memoryIdsByDecisionId(
    memories: Array<Memory & { _id: Types.ObjectId }>,
  ) {
    const map = new Map<string, string[]>();
    for (const memory of memories) {
      for (const entity of memory.entities ?? []) {
        if (entity.type !== MemoryEntityType.DECISION) {
          continue;
        }
        const decisionId = entity.entityId?.toString() ?? entity.externalId;
        if (!decisionId || !Types.ObjectId.isValid(decisionId)) {
          continue;
        }
        map.set(decisionId, [
          ...(map.get(decisionId) ?? []),
          memory._id.toString(),
        ]);
      }
    }
    return map;
  }

  private linkedMemoryContext(
    candidateIds: Types.ObjectId[],
    relationById: Map<string, MemoryPersonRelation | null>,
  ) {
    const memoryIds = candidateIds
      .map((id) => id.toString())
      .filter((id) => relationById.has(id));
    const relation =
      memoryIds.map((id) => relationById.get(id)).find(Boolean) ?? null;
    return { memoryIds, relation };
  }

  private createdAt(value: unknown) {
    const createdAt = (value as { createdAt?: Date }).createdAt;
    return createdAt instanceof Date ? createdAt : new Date(0);
  }

  private uniqueObjectIds(values: string[]) {
    const unique = [...new Set(values.filter(Boolean))];
    for (const value of unique) {
      this.assertObjectId(value, 'participant ID');
    }
    return unique.map((value) => new Types.ObjectId(value));
  }

  private normalizeTags(values?: string[]) {
    return [
      ...new Set(
        (values ?? [])
          .map((value) => value.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(Boolean),
      ),
    ];
  }

  private humanize(value: string) {
    return value
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private assertObjectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${label}.`);
    }
  }
}
