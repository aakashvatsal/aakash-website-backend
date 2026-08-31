import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  ConfirmMemoryReviewDto,
  CreateMemoryMergeDraftDto,
  SnoozeMemoryReviewDto,
} from './dto/memory-review.dto';
import { MemoryInboxService } from './memory-inbox.service';
import {
  Memory,
  MemoryDocument,
  MemoryLifecycleStatus,
  MemoryScope,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

export type MemoryReviewReason =
  | 'disputed'
  | 'contradiction'
  | 'old_preference'
  | 'stale'
  | 'uncertain'
  | 'duplicate';

export type MemoryReviewPriority = 'high' | 'medium' | 'low';

export type MemoryReviewItem = {
  reason: MemoryReviewReason;
  priority: MemoryReviewPriority;
  memory: Record<string, unknown>;
  relatedMemory?: Record<string, unknown>;
  ageDays?: number;
  similarity?: number;
  explanation: string;
};

@Injectable()
export class MemoryReviewService {
  constructor(
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<MemoryDocument>,
    private readonly memoryInboxService: MemoryInboxService,
  ) {}

  async getQueue() {
    const memories = await this.memoryModel
      .find({ lifecycleStatus: { $ne: MemoryLifecycleStatus.FORGOTTEN } })
      .select('+contentHash')
      .sort({ updatedAt: -1 })
      .lean();

    return this.buildQueue(memories as unknown as Record<string, unknown>[]);
  }

  buildQueue(memories: Record<string, unknown>[], now = new Date()) {
    const visible = memories.filter((memory) => !this.isSnoozed(memory, now));
    const byId = new Map(
      visible.map((memory) => [this.idOf(memory), memory] as const),
    );

    const disputed: MemoryReviewItem[] = [];
    const contradictions: MemoryReviewItem[] = [];
    const oldPreferences: MemoryReviewItem[] = [];
    const stale: MemoryReviewItem[] = [];
    const uncertain: MemoryReviewItem[] = [];

    for (const memory of visible) {
      const status = this.lifecycleOf(memory);
      const ageDays = this.ageDays(memory, now);

      if (
        status === MemoryLifecycleStatus.DISPUTED ||
        memory.isDisputed === true
      ) {
        disputed.push({
          reason: 'disputed',
          priority: 'high',
          memory,
          ageDays,
          explanation:
            'This memory is disputed and must be explicitly resolved before it can return to current truth.',
        });
      }

      if (status === MemoryLifecycleStatus.CONTRADICTED) {
        const relatedId = this.firstId(memory.contradictedByMemoryIds);
        contradictions.push({
          reason: 'contradiction',
          priority: 'high',
          memory,
          relatedMemory: relatedId ? byId.get(relatedId) : undefined,
          ageDays,
          explanation:
            'This memory has been explicitly contradicted. Review the conflicting records if the current truth is unclear.',
        });
      }

      if (status !== MemoryLifecycleStatus.ACTIVE) continue;

      if (memory.type === MemoryType.PREFERENCE && ageDays >= 180) {
        oldPreferences.push({
          reason: 'old_preference',
          priority: ageDays >= 365 ? 'high' : 'medium',
          memory,
          ageDays,
          explanation:
            'Preferences can change. This one has not been reconfirmed recently.',
        });
      } else if (ageDays >= 365) {
        stale.push({
          reason: 'stale',
          priority: Number(memory.importance ?? 0) >= 0.75 ? 'high' : 'medium',
          memory,
          ageDays,
          explanation:
            'This active memory is old enough that its current validity should be reviewed.',
        });
      }

      const confidence = Number(memory.confidence ?? 0.5);
      const verification =
        memory.verificationStatus as MemoryVerificationStatus;
      if (
        confidence < 0.65 ||
        verification === MemoryVerificationStatus.UNVERIFIED ||
        verification === MemoryVerificationStatus.INFERRED
      ) {
        uncertain.push({
          reason: 'uncertain',
          priority: confidence < 0.45 ? 'high' : 'medium',
          memory,
          ageDays,
          explanation:
            'This active memory has low confidence or has not yet been explicitly confirmed.',
        });
      }
    }

    const duplicates = this.findDuplicates(
      visible.filter(
        (memory) => this.lifecycleOf(memory) === MemoryLifecycleStatus.ACTIVE,
      ),
    );

    const sections = {
      disputed: this.sortItems(disputed),
      contradictions: this.sortItems(contradictions),
      oldPreferences: this.sortItems(oldPreferences),
      stale: this.sortItems(stale),
      uncertain: this.sortItems(uncertain),
      duplicates: this.sortItems(duplicates),
    };

    return {
      generatedAt: now.toISOString(),
      total: Object.values(sections).reduce(
        (sum, items) => sum + items.length,
        0,
      ),
      sections,
      rules: {
        oldPreferenceDays: 180,
        staleDays: 365,
        lowConfidenceBelow: 0.65,
        duplicateSimilarityAtLeast: 0.82,
        openAiCalls: 0,
      },
    };
  }

  async confirmCurrent(memoryId: string, dto: ConfirmMemoryReviewDto) {
    const memory = await this.getMemory(memoryId);
    if (this.lifecycleOf(memory) !== MemoryLifecycleStatus.ACTIVE) {
      throw new BadRequestException(
        'Only an active memory can be confirmed as current. Resolve its lifecycle state first.',
      );
    }

    memory.lastReviewedAt = new Date();
    memory.reviewCount = (memory.reviewCount ?? 0) + 1;
    memory.reviewSnoozedUntil = undefined;
    if (
      memory.verificationStatus === MemoryVerificationStatus.UNVERIFIED ||
      memory.verificationStatus === MemoryVerificationStatus.INFERRED
    ) {
      memory.verificationStatus = MemoryVerificationStatus.CONFIRMED;
    }
    if (dto.note?.trim()) memory.lastReviewNote = dto.note.trim();
    await memory.save();
    return memory;
  }

  async snooze(memoryId: string, dto: SnoozeMemoryReviewDto) {
    const memory = await this.getMemory(memoryId);
    const until = new Date(dto.until);
    if (Number.isNaN(until.getTime()) || until <= new Date()) {
      throw new BadRequestException(
        'Review snooze date must be in the future.',
      );
    }
    memory.reviewSnoozedUntil = until;
    await memory.save();
    return memory;
  }

  async createMergeDraft(memoryId: string, dto: CreateMemoryMergeDraftDto) {
    if (memoryId === dto.otherMemoryId) {
      throw new BadRequestException('A memory cannot be merged with itself.');
    }

    const [left, right] = await Promise.all([
      this.getMemory(memoryId),
      this.getMemory(dto.otherMemoryId),
    ]);

    this.assertMergeCompatible(left, right);
    const content =
      dto.content?.trim() ||
      this.suggestMergedContent(left.content, right.content);

    return this.memoryInboxService.capture({
      content,
      type: left.type,
      scope: left.scope,
      personId: left.personId?.toString() || undefined,
      personLinks: (left.personLinks ?? []).map((link) => ({
        personId: link.personId.toString(),
        relation: link.relation,
      })),
      tags: Array.from(new Set([...(left.tags ?? []), ...(right.tags ?? [])])),
      categories: Array.from(
        new Set([...(left.categories ?? []), ...(right.categories ?? [])]),
      ),
      entities: [...(left.entities ?? []), ...(right.entities ?? [])].map(
        (entity) => ({
          type: entity.type,
          name: entity.name,
          entityId: entity.entityId?.toString(),
          externalId: entity.externalId,
        }),
      ),
      importance: Math.max(left.importance ?? 0.5, right.importance ?? 0.5),
      confidence: Math.max(left.confidence ?? 0.5, right.confidence ?? 0.5),
      verificationStatus: MemoryVerificationStatus.UNVERIFIED,
      durability: left.durability,
      accessLevel: left.accessLevel,
      sensitivity: left.sensitivity,
      proposalReason: `Merge review draft for memories ${left._id.toString()} and ${right._id.toString()}. Source memories remain unchanged until you explicitly manage their lifecycle.`,
    });
  }

  private findDuplicates(memories: Record<string, unknown>[]) {
    const items: MemoryReviewItem[] = [];
    for (let i = 0; i < memories.length; i += 1) {
      for (let j = i + 1; j < memories.length; j += 1) {
        const left = memories[i];
        const right = memories[j];
        if (!this.sameAttribution(left, right)) continue;
        if (left.type !== right.type) continue;
        const similarity = this.similarity(
          this.stringValue(left.content),
          this.stringValue(right.content),
        );
        if (similarity < 0.82) continue;
        items.push({
          reason: 'duplicate',
          priority: similarity >= 0.95 ? 'high' : 'medium',
          memory: left,
          relatedMemory: right,
          similarity,
          explanation:
            'These current memories are semantically very similar and share the same type and person attribution. Review them before creating a merge draft.',
        });
      }
    }
    return items;
  }

  private sameAttribution(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ) {
    if (left.scope !== right.scope) return false;
    return this.subjectSignature(left) === this.subjectSignature(right);
  }

  private subjectSignature(memory: Record<string, unknown>): string {
    const links = Array.isArray(memory.personLinks) ? memory.personLinks : [];
    const subjects = links
      .filter((link) => {
        if (!link || typeof link !== 'object') return false;
        const relation = (link as Record<string, unknown>).relation;
        return relation === 'primary_subject' || relation === 'participant';
      })
      .map((link) => this.idOf((link as Record<string, unknown>).personId))
      .filter(Boolean)
      .sort();
    const scope =
      typeof memory.scope === 'string' ? memory.scope : MemoryScope.GENERAL;
    return `${scope}:${subjects.join(',')}`;
  }

  private similarity(left: string, right: string) {
    const normalize = (value: string) =>
      new Set(
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((token) => token.length > 2),
      );
    const a = normalize(left);
    const b = normalize(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
  }

  private ageDays(memory: Record<string, unknown>, now: Date) {
    const source =
      memory.lastReviewedAt ??
      memory.happenedAt ??
      memory.capturedAt ??
      memory.createdAt;
    const date = source ? this.dateValue(source, now) : now;
    return Math.max(
      0,
      Math.floor((now.getTime() - date.getTime()) / 86_400_000),
    );
  }

  private isSnoozed(memory: Record<string, unknown>, now: Date) {
    if (!memory.reviewSnoozedUntil) return false;
    return this.dateValue(memory.reviewSnoozedUntil, now) > now;
  }

  private lifecycleOf(
    memory: Record<string, unknown> | MemoryDocument,
  ): MemoryLifecycleStatus {
    const record = memory as unknown as Record<string, unknown>;
    return (record.lifecycleStatus ??
      (record.isDisputed
        ? MemoryLifecycleStatus.DISPUTED
        : record.isArchived
          ? MemoryLifecycleStatus.ARCHIVED
          : record.isActive === false
            ? MemoryLifecycleStatus.FORGOTTEN
            : MemoryLifecycleStatus.ACTIVE)) as MemoryLifecycleStatus;
  }

  private firstId(value: unknown): string {
    return Array.isArray(value) && value.length ? this.idOf(value[0]) : '';
  }

  private idOf(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toString();
    if (
      typeof value === 'object' &&
      '_id' in (value as Record<string, unknown>)
    ) {
      return this.idOf((value as Record<string, unknown>)._id);
    }
    return '';
  }

  private stringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  }

  private dateValue(value: unknown, fallback: Date): Date {
    if (value instanceof Date) return value;
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  private sortItems(items: MemoryReviewItem[]) {
    const weight: Record<MemoryReviewPriority, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    return items.sort(
      (a, b) =>
        weight[b.priority] - weight[a.priority] ||
        (b.ageDays ?? 0) - (a.ageDays ?? 0),
    );
  }

  private async getMemory(memoryId: string) {
    if (!Types.ObjectId.isValid(memoryId))
      throw new NotFoundException('Memory not found.');
    const memory = await this.memoryModel
      .findById(memoryId)
      .select('+contentHash');
    if (!memory) throw new NotFoundException('Memory not found.');
    return memory;
  }

  private assertMergeCompatible(left: MemoryDocument, right: MemoryDocument) {
    if (
      this.lifecycleOf(left) !== MemoryLifecycleStatus.ACTIVE ||
      this.lifecycleOf(right) !== MemoryLifecycleStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Only current active memories can produce a merge draft.',
      );
    }
    if (left.type !== right.type || left.scope !== right.scope) {
      throw new BadRequestException(
        'Merge candidates must share the same memory type and scope.',
      );
    }
    const asRecord = (memory: MemoryDocument) =>
      memory.toObject() as unknown as Record<string, unknown>;
    if (!this.sameAttribution(asRecord(left), asRecord(right))) {
      throw new BadRequestException(
        'Merge candidates must have the same person/group attribution.',
      );
    }
  }

  private suggestMergedContent(left: string, right: string) {
    const a = left.trim();
    const b = right.trim();
    if (a.toLowerCase() === b.toLowerCase())
      return a.length >= b.length ? a : b;
    if (a.toLowerCase().includes(b.toLowerCase())) return a;
    if (b.toLowerCase().includes(a.toLowerCase())) return b;
    return `${a}\n\n${b}`;
  }
}
