import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  CompleteManualMediaPublishDto,
  ReserveMediaCalendarSlotDto,
  ScheduleMediaPublicationDto,
  UpdateMediaAccountDto,
} from './dto/media-core.dto';
import { MediaBufferService } from './media-buffer.service';
import { MediaCoreService } from './media-core.service';
import { MediaPublishingService } from './media-publishing.service';
import { MediaPreflightService } from './media-preflight.service';
import {
  MediaAccount,
  MediaAccountDocument,
  MediaDeliveryProvider,
} from './schemas/media-account.schema';
import {
  MediaCalendarSlot,
  MediaCalendarSlotDocument,
  MediaCalendarSlotStatus,
} from './schemas/media-calendar-slot.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaProductionStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

const MIN_HORIZON_DAYS = 7;
const MAX_PUBLISH_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 15;
const STUCK_PUBLISHING_MINUTES = 30;

@Injectable()
export class MediaCalendarService {
  constructor(
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaCalendarSlot.name)
    private readonly slotModel: Model<MediaCalendarSlotDocument>,
    private readonly mediaCoreService: MediaCoreService,
    private readonly publishingService: MediaPublishingService,
    private readonly bufferService: MediaBufferService,
    private readonly preflightService: MediaPreflightService,
  ) {}

  async overview() {
    await this.ensureHorizon();
    const now = new Date();
    const accounts = await this.accountModel
      .find({ isActive: true })
      .sort({ platform: 1, isPrimary: -1 })
      .lean();
    const maxHorizon = Math.max(
      MIN_HORIZON_DAYS,
      ...accounts.map((account) =>
        Math.max(MIN_HORIZON_DAYS, account.strategy?.planningHorizonDays ?? 7),
      ),
    );
    const end = this.addDays(now, maxHorizon);
    const slots = await this.slotModel
      .find({
        isActive: true,
        startsAt: { $gte: this.startOfDay(now), $lt: end },
      })
      .sort({ startsAt: 1 })
      .lean();
    const publicationIds = slots
      .map((slot) => slot.publicationId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const publications = publicationIds.length
      ? await this.publicationModel
          .find({ _id: { $in: publicationIds }, isActive: true })
          .lean()
      : [];
    const publicationMap = new Map(
      publications.map((publication) => [
        publication._id.toString(),
        publication,
      ]),
    );

    const coverage = accounts.map((account) => {
      const horizonDays = Math.max(
        MIN_HORIZON_DAYS,
        account.strategy?.planningHorizonDays ?? 7,
      );
      const expected = this.expectedSlotCount(
        account.strategy?.desiredPublicationsPerWeek ?? 0,
        horizonDays,
      );
      const accountEnd = this.addDays(now, horizonDays);
      const accountSlots = slots.filter(
        (slot) =>
          slot.accountId.toString() === account._id.toString() &&
          slot.startsAt < accountEnd &&
          slot.status !== MediaCalendarSlotStatus.CANCELLED,
      );
      const assigned = accountSlots.filter((slot) =>
        Boolean(slot.publicationId),
      );
      const productionGaps = assigned.filter((slot) => {
        const publication = slot.publicationId
          ? publicationMap.get(slot.publicationId.toString())
          : undefined;
        return publication
          ? !this.isProductionReady(publication.productionStatus)
          : false;
      }).length;
      return {
        accountId: account._id.toString(),
        platform: account.platform,
        displayName: account.displayName,
        horizonDays,
        desiredPublicationsPerWeek:
          account.strategy?.desiredPublicationsPerWeek ?? 0,
        requiredSlots: expected,
        assignedSlots: assigned.length,
        openSlots: accountSlots.filter(
          (slot) => slot.status === MediaCalendarSlotStatus.OPEN,
        ).length,
        productionGaps,
        coveragePercent:
          expected === 0
            ? 100
            : Math.min(100, Math.round((assigned.length / expected) * 100)),
        covered: expected === 0 || assigned.length >= expected,
      };
    });

    const readyUnscheduled = await this.publicationModel
      .find({
        isActive: true,
        productionStatus: {
          $in: [MediaProductionStatus.READY, MediaProductionStatus.COMPLETE],
        },
        status: { $in: [MediaPostStatus.READY, MediaPostStatus.DRAFT] },
        $or: [{ scheduledAt: { $exists: false } }, { scheduledAt: null }],
      })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const queue = await this.getPublishingQueue();
    return {
      generatedAt: now,
      minimumPlanningHorizonDays: MIN_HORIZON_DAYS,
      horizonEnd: end,
      fullyCovered: coverage.every((item) => item.covered),
      coverage,
      slots: slots.map((slot) => ({
        ...slot,
        publication: slot.publicationId
          ? publicationMap.get(slot.publicationId.toString())
          : undefined,
      })),
      readyUnscheduled,
      publishingQueue: queue,
      policy: {
        minimumPlanningHorizonDays: MIN_HORIZON_DAYS,
        productionReadinessGatesScheduling: true,
        hsakaaRequiresConfirmationToScheduleOrPublish: true,
        autoPublishRequiresExplicitApproval: true,
        maximumAutomaticPublishAttempts: MAX_PUBLISH_ATTEMPTS,
        whatsappStatusIsManual: true,
      },
    };
  }

  async ensureHorizon() {
    const accounts = await this.accountModel.find({ isActive: true });
    let created = 0;
    for (const account of accounts) {
      if ((account.strategy?.planningHorizonDays ?? 7) < MIN_HORIZON_DAYS) {
        account.strategy.planningHorizonDays = MIN_HORIZON_DAYS;
        await account.save();
      }
      created += await this.ensureAccountSlots(account);
    }
    return { created, minimumPlanningHorizonDays: MIN_HORIZON_DAYS };
  }

  async updateAccount(accountId: string, dto: UpdateMediaAccountDto) {
    if (dto.strategy?.planningHorizonDays !== undefined) {
      dto.strategy.planningHorizonDays = Math.max(
        MIN_HORIZON_DAYS,
        dto.strategy.planningHorizonDays,
      );
    }
    const account = await this.mediaCoreService.updateAccount(accountId, dto);
    await this.ensureAccountSlots(account);
    return account;
  }

  async reserveSlot(slotId: string, dto: ReserveMediaCalendarSlotDto) {
    const slot = await this.requireSlot(slotId);
    const publication = await this.requirePublication(dto.publicationId);
    this.assertSlotCompatible(slot, publication);
    if (
      slot.publicationId &&
      slot.publicationId.toString() !== publication._id.toString()
    ) {
      throw new BadRequestException(
        'Calendar slot already belongs to another publication.',
      );
    }

    if (!publication.accountId) publication.accountId = slot.accountId;
    publication.scheduledAt = slot.startsAt;
    await publication.save();

    slot.publicationId = publication._id;
    slot.status = MediaCalendarSlotStatus.RESERVED;
    slot.autoPublish = false;
    if (dto.notes !== undefined) slot.notes = dto.notes.trim() || undefined;
    await slot.save();
    return this.getSlot(slot._id.toString());
  }

  async schedulePublication(
    publicationId: string,
    dto: ScheduleMediaPublicationDto,
  ) {
    const publication = await this.requirePublication(publicationId);
    if (!this.isProductionReady(publication.productionStatus)) {
      throw new BadRequestException(
        'Publication must be production-ready before it can be scheduled.',
      );
    }

    await this.preflightService.assertApproved(publicationId);

    let slot: MediaCalendarSlotDocument | null = null;
    if (dto.slotId) {
      slot = await this.requireSlot(dto.slotId);
      this.assertSlotCompatible(slot, publication);
      if (
        slot.publicationId &&
        slot.publicationId.toString() !== publication._id.toString()
      ) {
        throw new BadRequestException(
          'Calendar slot already belongs to another publication.',
        );
      }
    }
    const scheduledAt =
      slot?.startsAt ??
      (dto.scheduledAt ? new Date(dto.scheduledAt) : undefined);
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException(
        'A valid slotId or scheduledAt is required.',
      );
    }
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }

    const account = await this.resolveAccount(publication, slot ?? undefined);
    const autoPublish = dto.autoPublish === true;
    if (autoPublish && !this.canAutoPublish(publication, account)) {
      throw new BadRequestException(
        'Automatic publishing is not allowed for this account or publication format.',
      );
    }

    publication.accountId = account._id;
    publication.scheduledAt = scheduledAt;
    publication.scheduleApprovedAt = new Date();
    publication.autoPublish = autoPublish;
    publication.deliveryStatus = MediaDeliveryStatus.SCHEDULED;
    publication.status = MediaPostStatus.SCHEDULED;
    publication.lastPublishError = undefined;
    publication.nextPublishAttemptAt = undefined;
    await publication.save();

    if (slot) {
      slot.publicationId = publication._id;
      slot.status = MediaCalendarSlotStatus.SCHEDULED;
      slot.autoPublish = autoPublish;
      slot.scheduleApprovedAt = publication.scheduleApprovedAt;
      await slot.save();
    }

    if (
      autoPublish &&
      this.publishingService.shouldUseBuffer(publication, account)
    ) {
      try {
        const bufferPost = await this.bufferService.schedule(
          publication,
          account,
          scheduledAt,
        );
        publication.deliveryProviderUsed = MediaDeliveryProvider.BUFFER;
        publication.bufferPostId = bufferPost.id;
        publication.bufferChannelId = account.buffer?.channelId;
        publication.bufferPostStatus = bufferPost.status;
        publication.bufferHandedOffAt = new Date();
        publication.bufferLastSyncedAt = new Date();
        publication.lastPublishError = undefined;
        await publication.save();
      } catch (error) {
        if (account.deliveryProvider === MediaDeliveryProvider.BUFFER) {
          publication.deliveryStatus = MediaDeliveryStatus.FAILED;
          publication.status = MediaPostStatus.FAILED;
          publication.autoPublish = false;
          publication.lastPublishError = this.errorMessage(error);
          await publication.save();
          throw new BadRequestException(
            `Buffer scheduling failed: ${publication.lastPublishError}`,
          );
        }
        publication.deliveryProviderUsed = MediaDeliveryProvider.DIRECT;
        publication.lastPublishError = `Buffer handoff failed; direct delivery fallback will be used: ${this.errorMessage(error)}`;
        await publication.save();
      }
    }
    return publication;
  }

  async publishNow(publicationId: string) {
    const publication = await this.requirePublication(publicationId);
    if (!this.isProductionReady(publication.productionStatus)) {
      throw new BadRequestException(
        'Production must be ready before publishing.',
      );
    }
    await this.preflightService.assertApproved(publicationId);
    const account = await this.resolveAccount(publication);
    return this.attemptPublish(publication, account);
  }

  async retryPublish(publicationId: string, publishNow = true) {
    const publication = await this.requirePublication(publicationId);
    if (publication.deliveryStatus !== MediaDeliveryStatus.FAILED) {
      throw new BadRequestException('Only failed publications can be retried.');
    }
    publication.status = MediaPostStatus.SCHEDULED;
    publication.deliveryStatus = MediaDeliveryStatus.SCHEDULED;
    publication.lastPublishError = undefined;
    publication.nextPublishAttemptAt = undefined;
    publication.bufferPostId = undefined;
    publication.bufferPostStatus = undefined;
    publication.bufferHandedOffAt = undefined;
    publication.bufferLastSyncedAt = undefined;
    publication.deliveryProviderUsed = undefined;
    await publication.save();
    if (!publishNow) return publication;
    const account = await this.resolveAccount(publication);
    return this.attemptPublish(publication, account);
  }

  async completeManualPublish(
    publicationId: string,
    dto: CompleteManualMediaPublishDto,
  ) {
    const publication = await this.requirePublication(publicationId);
    if (
      ![
        MediaDeliveryStatus.MANUAL_REQUIRED,
        MediaDeliveryStatus.SCHEDULED,
        MediaDeliveryStatus.FAILED,
      ].includes(publication.deliveryStatus)
    ) {
      throw new BadRequestException(
        'Publication is not waiting for manual delivery.',
      );
    }
    publication.status = MediaPostStatus.POSTED;
    publication.deliveryStatus = MediaDeliveryStatus.PUBLISHED;
    publication.publishedAt = new Date();
    publication.manualPublishCompletedAt = publication.publishedAt;
    if (dto.externalPostUrl !== undefined) {
      publication.externalPostUrl = dto.externalPostUrl.trim() || undefined;
    }
    if (dto.platformPostId !== undefined) {
      publication.platformPostId = dto.platformPostId.trim() || undefined;
    }
    publication.lastPublishError = undefined;
    publication.nextPublishAttemptAt = undefined;
    await publication.save();
    await this.markSlotsPublished(publication._id);
    return publication;
  }

  async getPublishingQueue() {
    const now = new Date();
    return this.publicationModel
      .find({
        isActive: true,
        deliveryStatus: {
          $in: [
            MediaDeliveryStatus.SCHEDULED,
            MediaDeliveryStatus.MANUAL_REQUIRED,
            MediaDeliveryStatus.FAILED,
            MediaDeliveryStatus.PUBLISHING,
          ],
        },
      })
      .sort({ scheduledAt: 1, updatedAt: -1 })
      .limit(200)
      .lean()
      .then((items) =>
        items.map((item) => ({
          ...item,
          due: Boolean(item.scheduledAt && new Date(item.scheduledAt) <= now),
        })),
      );
  }

  async runDuePublications() {
    await this.recoverStuckPublishing();
    const now = new Date();
    const due = await this.publicationModel.find({
      isActive: true,
      status: MediaPostStatus.SCHEDULED,
      deliveryStatus: {
        $in: [MediaDeliveryStatus.SCHEDULED, MediaDeliveryStatus.FAILED],
      },
      scheduledAt: { $lte: now },
      publishAttempts: { $lt: MAX_PUBLISH_ATTEMPTS },
      $nor: [
        {
          deliveryProviderUsed: MediaDeliveryProvider.BUFFER,
          bufferPostId: { $type: 'string' },
        },
      ],
      $or: [
        { nextPublishAttemptAt: { $exists: false } },
        { nextPublishAttemptAt: null },
        { nextPublishAttemptAt: { $lte: now } },
      ],
    });
    let published = 0;
    let manualRequired = 0;
    let failed = 0;
    for (const publication of due) {
      try {
        const account = await this.resolveAccount(publication);
        if (!publication.autoPublish) {
          publication.deliveryStatus = MediaDeliveryStatus.MANUAL_REQUIRED;
          await publication.save();
          manualRequired += 1;
          continue;
        }
        const result = await this.attemptPublish(publication, account);
        if (result.deliveryStatus === MediaDeliveryStatus.PUBLISHED)
          published += 1;
        else if (result.deliveryStatus === MediaDeliveryStatus.MANUAL_REQUIRED)
          manualRequired += 1;
        else if (result.deliveryStatus === MediaDeliveryStatus.FAILED)
          failed += 1;
      } catch (error) {
        publication.deliveryStatus = MediaDeliveryStatus.FAILED;
        publication.publishAttempts = (publication.publishAttempts ?? 0) + 1;
        publication.lastPublishAttemptAt = now;
        publication.lastPublishError = this.errorMessage(error);
        const retryable = publication.publishAttempts < MAX_PUBLISH_ATTEMPTS;
        publication.status = retryable
          ? MediaPostStatus.SCHEDULED
          : MediaPostStatus.FAILED;
        publication.nextPublishAttemptAt = retryable
          ? this.addMinutes(now, RETRY_DELAY_MINUTES)
          : undefined;
        await publication.save();
        failed += 1;
      }
    }
    return {
      checked: due.length,
      published,
      manualRequired,
      failed,
      ranAt: now,
    };
  }

  async reconcileBufferPublications() {
    if (!this.bufferService.isConfigured()) {
      return { checked: 0, published: 0, failed: 0, pending: 0 };
    }
    const publications = await this.publicationModel
      .find({
        isActive: true,
        deliveryProviderUsed: MediaDeliveryProvider.BUFFER,
        bufferPostId: { $type: 'string' },
        deliveryStatus: {
          $in: [
            MediaDeliveryStatus.SCHEDULED,
            MediaDeliveryStatus.PUBLISHING,
            MediaDeliveryStatus.FAILED,
          ],
        },
      })
      .limit(200);

    let published = 0;
    let failed = 0;
    let pending = 0;
    for (const publication of publications) {
      try {
        const state = await this.bufferService.getPost(
          publication.bufferPostId!,
        );
        publication.bufferPostStatus = state.status;
        publication.bufferLastSyncedAt = new Date();
        if (state.status === 'sent') {
          publication.deliveryStatus = MediaDeliveryStatus.PUBLISHED;
          publication.status = MediaPostStatus.POSTED;
          publication.publishedAt = state.sentAt
            ? new Date(state.sentAt)
            : (publication.publishedAt ?? new Date());
          publication.externalPostUrl =
            state.externalLink ?? publication.externalPostUrl;
          publication.lastPublishError = undefined;
          publication.nextPublishAttemptAt = undefined;
          published += 1;
          await publication.save();
          await this.markSlotsPublished(publication._id);
          continue;
        }
        if (state.status === 'error') {
          publication.deliveryStatus = MediaDeliveryStatus.FAILED;
          publication.status = MediaPostStatus.FAILED;
          publication.lastPublishError =
            state.error?.message ||
            state.error?.rawError ||
            'Buffer could not publish this post.';
          failed += 1;
          await publication.save();
          continue;
        }
        publication.deliveryStatus =
          state.status === 'sending'
            ? MediaDeliveryStatus.PUBLISHING
            : MediaDeliveryStatus.SCHEDULED;
        pending += 1;
        await publication.save();
      } catch (error) {
        publication.bufferLastSyncedAt = new Date();
        publication.lastPublishError = `Buffer status sync failed: ${this.errorMessage(error)}`;
        await publication.save();
        pending += 1;
      }
    }

    return { checked: publications.length, published, failed, pending };
  }

  private async attemptPublish(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ) {
    const now = new Date();
    publication.deliveryStatus = MediaDeliveryStatus.PUBLISHING;
    publication.lastPublishAttemptAt = now;
    publication.publishAttempts = (publication.publishAttempts ?? 0) + 1;
    publication.lastPublishError = undefined;
    await publication.save();
    try {
      const result = await this.publishingService.publish(publication, account);
      if (result.mode === 'manual_required') {
        publication.deliveryStatus = MediaDeliveryStatus.MANUAL_REQUIRED;
        publication.status = MediaPostStatus.SCHEDULED;
        publication.autoPublish = false;
        publication.lastPublishError = result.reason;
        publication.nextPublishAttemptAt = undefined;
      } else if (result.mode === 'buffer_handed_off') {
        publication.deliveryStatus =
          result.bufferPostStatus === 'sending'
            ? MediaDeliveryStatus.PUBLISHING
            : MediaDeliveryStatus.SCHEDULED;
        publication.status = MediaPostStatus.SCHEDULED;
        publication.deliveryProviderUsed = MediaDeliveryProvider.BUFFER;
        publication.bufferPostId = result.bufferPostId;
        publication.bufferChannelId = account.buffer?.channelId;
        publication.bufferPostStatus = result.bufferPostStatus;
        publication.bufferHandedOffAt = now;
        publication.bufferLastSyncedAt = now;
        publication.externalPostUrl = result.externalPostUrl;
        publication.lastPublishError = undefined;
        publication.nextPublishAttemptAt = undefined;
      } else {
        publication.deliveryStatus = MediaDeliveryStatus.PUBLISHED;
        publication.status = MediaPostStatus.POSTED;
        publication.publishedAt = now;
        publication.platformPostId = result.platformPostId;
        publication.externalPostUrl = result.externalPostUrl;
        publication.deliveryProviderUsed =
          result.provider === 'buffer'
            ? MediaDeliveryProvider.BUFFER
            : MediaDeliveryProvider.DIRECT;
        if (result.bufferPostId) {
          publication.bufferPostId = result.bufferPostId;
          publication.bufferChannelId = account.buffer?.channelId;
          publication.bufferPostStatus = result.bufferPostStatus ?? 'sent';
          publication.bufferHandedOffAt = now;
          publication.bufferLastSyncedAt = now;
        }
        publication.lastPublishError = undefined;
        publication.nextPublishAttemptAt = undefined;
      }
      await publication.save();
      if (publication.deliveryStatus === MediaDeliveryStatus.PUBLISHED) {
        await this.markSlotsPublished(publication._id);
      }
      return publication;
    } catch (error) {
      publication.deliveryStatus = MediaDeliveryStatus.FAILED;
      const retryable = publication.publishAttempts < MAX_PUBLISH_ATTEMPTS;
      publication.status = retryable
        ? MediaPostStatus.SCHEDULED
        : MediaPostStatus.FAILED;
      publication.lastPublishError = this.errorMessage(error);
      publication.nextPublishAttemptAt = retryable
        ? this.addMinutes(now, RETRY_DELAY_MINUTES)
        : undefined;
      await publication.save();
      return publication;
    }
  }

  async recoverStuckPublishing() {
    const cutoff = this.addMinutes(new Date(), -STUCK_PUBLISHING_MINUTES);
    const stuck = await this.publicationModel.find({
      isActive: true,
      deliveryStatus: MediaDeliveryStatus.PUBLISHING,
      lastPublishAttemptAt: { $lte: cutoff },
    });

    let bufferManaged = 0;
    let manualReview = 0;
    for (const publication of stuck) {
      if (publication.bufferPostId) {
        // Buffer owns delivery after handoff. Reconciliation can safely ask Buffer
        // for the authoritative state without creating a duplicate post.
        bufferManaged += 1;
        continue;
      }

      publication.deliveryStatus = MediaDeliveryStatus.MANUAL_REQUIRED;
      publication.status = MediaPostStatus.SCHEDULED;
      publication.autoPublish = false;
      publication.nextPublishAttemptAt = undefined;
      publication.lastPublishError =
        'Automatic delivery stopped after an interrupted publish attempt. Verify the platform for a possible existing post before retrying to avoid a duplicate.';
      await publication.save();
      manualReview += 1;
    }

    return {
      checked: stuck.length,
      bufferManaged,
      manualReview,
      cutoff,
      policy: {
        ambiguousDirectPublishesNeverAutoRetry: true,
        bufferHandoffsUseAuthoritativeReconciliation: true,
      },
    };
  }

  private async ensureAccountSlots(account: MediaAccountDocument) {
    const horizonDays = Math.max(
      MIN_HORIZON_DAYS,
      account.strategy?.planningHorizonDays ?? 7,
    );
    const desired = account.strategy?.desiredPublicationsPerWeek ?? 0;
    const target = this.expectedSlotCount(desired, horizonDays);
    if (target <= 0) return 0;

    const start = this.startOfDay(new Date());
    const dates = Array.from({ length: horizonDays }, (_, index) =>
      this.addDays(start, index),
    );
    const preferredDays = (account.strategy?.preferredDaysOfWeek ?? []).filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    );
    const eligible = preferredDays.length
      ? dates.filter((date) =>
          preferredDays.includes(
            this.weekdayInZone(date, account.strategy?.timezone),
          ),
        )
      : dates;
    const pool = eligible.length ? eligible : dates;
    const times = (account.strategy?.preferredPublishTimes ?? ['09:00'])
      .map((value) => value.trim())
      .filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
    const publishTimes = times.length ? times : ['09:00'];

    const candidates: Array<{ date: Date; localDate: string; time: string }> =
      [];
    for (const date of pool) {
      for (const time of publishTimes) {
        candidates.push({
          date,
          localDate: this.dateKeyInZone(date, account.strategy?.timezone),
          time,
        });
      }
    }
    const selected = this.evenlySelect(
      candidates,
      Math.min(target, candidates.length),
    );
    let created = 0;
    for (const item of selected) {
      const startsAt = this.zonedDateTime(
        item.localDate,
        item.time,
        account.strategy?.timezone ?? 'Asia/Kolkata',
      );
      const slotKey = `${account._id.toString()}:${item.localDate}:${item.time}`;
      const existing = await this.slotModel.exists({ slotKey });
      if (existing) continue;
      await this.slotModel.create({
        accountId: account._id,
        platform: account.platform,
        startsAt,
        localDate: item.localDate,
        slotKey,
      });
      created += 1;
    }
    return created;
  }

  private expectedSlotCount(perWeek: number, horizonDays: number) {
    if (!Number.isFinite(perWeek) || perWeek <= 0) return 0;
    return Math.max(
      1,
      Math.ceil((perWeek * Math.max(MIN_HORIZON_DAYS, horizonDays)) / 7),
    );
  }

  private evenlySelect<T>(items: T[], count: number) {
    if (count >= items.length) return items;
    if (count <= 0) return [];
    const selected: T[] = [];
    const used = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const position = Math.min(
        items.length - 1,
        Math.floor((index * items.length) / count),
      );
      if (!used.has(position)) {
        used.add(position);
        selected.push(items[position]);
      }
    }
    return selected;
  }

  private async resolveAccount(
    publication: MediaPublicationDocument,
    slot?: MediaCalendarSlotDocument,
  ) {
    const id = publication.accountId ?? slot?.accountId;
    if (id) {
      const account = await this.accountModel.findOne({
        _id: id,
        isActive: true,
      });
      if (account) return account;
    }
    const account = await this.accountModel
      .findOne({
        platform: publication.platform,
        isActive: true,
      })
      .sort({ isPrimary: -1, createdAt: 1 });
    if (!account) {
      throw new BadRequestException(
        `No active ${publication.platform} Media account is configured.`,
      );
    }
    return account;
  }

  private canAutoPublish(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ) {
    if (!account.capabilities?.canPublish) return false;
    if (account.capabilities?.requiresManualPublish) return false;
    if (
      publication.platform === MediaPlatform.WHATSAPP &&
      publication.format === MediaPostType.WHATSAPP_STATUS
    ) {
      return false;
    }
    return true;
  }

  private async requirePublication(publicationId: string) {
    if (!Types.ObjectId.isValid(publicationId)) {
      throw new BadRequestException('Media publication ID is invalid.');
    }
    const publication = await this.publicationModel.findOne({
      _id: new Types.ObjectId(publicationId),
      isActive: true,
    });
    if (!publication)
      throw new NotFoundException('Media publication not found.');
    return publication;
  }

  private async requireSlot(slotId: string) {
    if (!Types.ObjectId.isValid(slotId)) {
      throw new BadRequestException('Media calendar slot ID is invalid.');
    }
    const slot = await this.slotModel.findOne({
      _id: new Types.ObjectId(slotId),
      isActive: true,
    });
    if (!slot) throw new NotFoundException('Media calendar slot not found.');
    return slot;
  }

  private async getSlot(slotId: string) {
    const slot = await this.requireSlot(slotId);
    const publication = slot.publicationId
      ? await this.publicationModel.findById(slot.publicationId).lean()
      : undefined;
    return { ...slot.toObject(), publication };
  }

  private assertSlotCompatible(
    slot: MediaCalendarSlotDocument,
    publication: MediaPublicationDocument,
  ) {
    if (slot.platform !== publication.platform) {
      throw new BadRequestException(
        `This ${slot.platform} slot cannot contain a ${publication.platform} publication.`,
      );
    }
    if (
      publication.accountId &&
      publication.accountId.toString() !== slot.accountId.toString()
    ) {
      throw new BadRequestException(
        'Publication belongs to a different Media account.',
      );
    }
  }

  private isProductionReady(status: MediaProductionStatus | string) {
    return [
      MediaProductionStatus.READY,
      MediaProductionStatus.COMPLETE,
    ].includes(status as MediaProductionStatus);
  }

  private async markSlotsPublished(publicationId: Types.ObjectId) {
    await this.slotModel.updateMany(
      { publicationId, isActive: true },
      { $set: { status: MediaCalendarSlotStatus.PUBLISHED } },
    );
  }

  private startOfDay(value: Date) {
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private addDays(value: Date, days: number) {
    const result = new Date(value);
    result.setDate(result.getDate() + days);
    return result;
  }

  private addMinutes(value: Date, minutes: number) {
    return new Date(value.getTime() + minutes * 60_000);
  }

  private weekdayInZone(value: Date, timezone = 'Asia/Kolkata') {
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(value);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
  }

  private dateKeyInZone(value: Date, timezone = 'Asia/Kolkata') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    return `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
  }

  private zonedDateTime(localDate: string, time: string, timezone: string) {
    const [year, month, day] = localDate.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let guess = target;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(guess));
      const map = new Map(parts.map((part) => [part.type, part.value]));
      const represented = Date.UTC(
        Number(map.get('year')),
        Number(map.get('month')) - 1,
        Number(map.get('day')),
        Number(map.get('hour')),
        Number(map.get('minute')),
        Number(map.get('second')),
      );
      guess += target - represented;
    }
    return new Date(guess);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 2000)
      : 'Publishing failed.';
  }
}
