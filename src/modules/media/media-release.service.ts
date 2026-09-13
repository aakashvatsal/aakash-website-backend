import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { MediaAssetLibraryService } from './media-asset-library.service';
import { MediaLaunchService } from './media-launch.service';
import { MediaOperationsService } from './media-operations.service';
import { MediaPreflightService } from './media-preflight.service';
import { MediaPresenceService } from './media-presence.service';
import {
  MediaAsset,
  MediaAssetDocument,
  MediaAssetStatus,
} from './schemas/media-asset.schema';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import {
  MediaPlanningCycle,
  MediaPlanningCycleDocument,
} from './schemas/media-planning-cycle.schema';
import { MediaPublicationReviewStatus } from './schemas/media-publication-review.schema';
import { MediaPlatform, MediaPostStatus } from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

const PRIMARY_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
] as const;
const TZ = 'Asia/Kolkata';

export type ReleaseCheckStatus = 'pass' | 'warn' | 'block';
export type ReleaseStage =
  | 'intelligence'
  | 'launch'
  | 'planning'
  | 'production'
  | 'review'
  | 'delivery'
  | 'learning'
  | 'integrity';

export interface ReleaseCheck {
  key: string;
  stage: ReleaseStage;
  title: string;
  status: ReleaseCheckStatus;
  message: string;
  action?: string;
}

@Injectable()
export class MediaReleaseService {
  constructor(
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    @InjectModel(MediaPlanningCycle.name)
    private readonly planningModel: Model<MediaPlanningCycleDocument>,
    private readonly presenceService: MediaPresenceService,
    private readonly launchService: MediaLaunchService,
    private readonly operationsService: MediaOperationsService,
    private readonly assetLibraryService: MediaAssetLibraryService,
    private readonly preflightService: MediaPreflightService,
  ) {}

  async overview() {
    const today = this.localDate(new Date());
    const [
      strategy,
      voice,
      launch,
      operations,
      storage,
      review,
      plan,
      integrity,
    ] = await Promise.all([
      this.presenceService.getStrategy(),
      this.presenceService.getVoiceProfile(),
      this.launchService.overview(),
      this.operationsService.overview(),
      Promise.resolve(this.assetLibraryService.storageStatus()),
      this.preflightService.overview(200),
      this.planningModel
        .findOne({
          isActive: true,
          startDate: { $lte: today },
          endDate: { $gte: today },
        })
        .sort({ startDate: -1, generatedAt: -1 })
        .lean(),
      this.integrityHealth(),
    ]);

    const planHealth = this.planHealth(plan, today);
    const checks: ReleaseCheck[] = [
      this.booleanCheck(
        'presence_strategy',
        'intelligence',
        'Presence Strategy exists',
        Boolean(strategy),
        'The persistent 30/90-day Presence Strategy is available.',
        'Build the Presence Strategy before launch.',
        '/admin/media/presence',
      ),
      this.booleanCheck(
        'voice_profile',
        'intelligence',
        'Aakash Voice Profile exists',
        Boolean(voice),
        'Content generation has a persistent Aakash voice/authenticity model.',
        'Build the Aakash Voice Profile before launch.',
        '/admin/media/presence',
      ),
      this.booleanCheck(
        'launch_state',
        'launch',
        'Day-1 launch calibration started',
        Boolean(launch.state),
        `Launch calibration is active at day ${launch.dayNumber}.`,
        'Start Day 1 and generate launch calibration.',
        '/admin/media/launch',
      ),
      {
        key: 'profile_setup',
        stage: 'launch',
        title: 'Five platform profile plans',
        status:
          launch.readiness.totalProfiles === 5 &&
          launch.readiness.profilePlanReady
            ? launch.readiness.profilesApplied ===
              launch.readiness.totalProfiles
              ? 'pass'
              : 'warn'
            : 'block',
        message:
          launch.readiness.totalProfiles === 5 &&
          launch.readiness.profilePlanReady
            ? `${launch.readiness.profilesApplied}/${launch.readiness.totalProfiles} platform profile plans are marked applied.`
            : 'LinkedIn, Instagram, YouTube, X and WhatsApp do not all have a launch profile plan.',
        action: '/admin/media/launch',
      },
      {
        key: 'current_plan',
        stage: 'planning',
        title: 'Current seven-day plan',
        status: planHealth.valid ? 'pass' : 'block',
        message: planHealth.message,
        action: '/admin/media/plan',
      },
      {
        key: 'five_platform_decisions',
        stage: 'planning',
        title: 'Every day explicitly covers all five channels',
        status: planHealth.platformCoverageValid ? 'pass' : 'block',
        message: planHealth.platformCoverageMessage,
        action: '/admin/media/plan',
      },
      {
        key: 'private_media_storage',
        stage: 'production',
        title: 'Private Media S3 storage',
        status: storage.configured ? 'pass' : 'block',
        message: storage.configured
          ? `Private ${storage.provider.toUpperCase()} storage is configured with ${storage.serverSideEncryption}.`
          : 'Media Asset Library storage is not configured; reusable production inputs cannot be safely uploaded.',
        action: '/admin/media/library',
      },
      {
        key: 'scheduled_assets',
        stage: 'production',
        title: 'Scheduled posts have no required asset gaps',
        status:
          integrity.scheduledWithPendingRequiredAssets === 0 ? 'pass' : 'block',
        message:
          integrity.scheduledWithPendingRequiredAssets === 0
            ? 'No scheduled publication has an unresolved required production asset.'
            : `${integrity.scheduledWithPendingRequiredAssets} scheduled publication(s) still have required assets pending.`,
        action: '/admin/media/production',
      },
      {
        key: 'fresh_owner_approval',
        stage: 'review',
        title: 'Scheduled posts have fresh owner-approved preflight',
        status:
          integrity.scheduledWithoutFreshApproval === 0 ? 'pass' : 'block',
        message:
          integrity.scheduledWithoutFreshApproval === 0
            ? 'Every currently scheduled publication has a fresh owner-approved final review.'
            : `${integrity.scheduledWithoutFreshApproval} scheduled publication(s) are missing fresh owner-approved preflight.`,
        action: '/admin/media/review',
      },
      {
        key: 'review_backlog',
        stage: 'review',
        title: 'Review queue is understood',
        status:
          review.summary.changesRequired + review.summary.stale > 0
            ? 'warn'
            : 'pass',
        message:
          review.summary.changesRequired + review.summary.stale > 0
            ? `${review.summary.changesRequired} changes-required and ${review.summary.stale} stale review(s) remain in the queue.`
            : 'No changes-required or stale publication reviews are waiting.',
        action: '/admin/media/review',
      },
      {
        key: 'delivery_paths',
        stage: 'delivery',
        title: 'All five channels have an executable delivery path',
        status: operations.platforms.some((item) => item.status === 'blocked')
          ? 'block'
          : operations.platforms.some((item) => item.status === 'partial')
            ? 'warn'
            : 'pass',
        message: `${operations.platforms.filter((item) => item.status === 'ready').length}/5 platforms are fully ready; ${operations.platforms.filter((item) => item.status === 'blocked').length} blocked.`,
        action: '/admin/media/operations',
      },
      {
        key: 'publishing_queue',
        stage: 'delivery',
        title: 'Publishing queue has no unsafe state',
        status:
          operations.queue.stuckPublishing > 0 || operations.queue.exhausted > 0
            ? 'block'
            : operations.queue.requiresAttention > 0
              ? 'warn'
              : 'pass',
        message: `${operations.queue.stuckPublishing} stuck, ${operations.queue.exhausted} exhausted, ${operations.queue.overdue} overdue, ${operations.queue.manualRequired} manual-review publication(s).`,
        action: '/admin/media/operations',
      },
      {
        key: 'analytics_lifecycle',
        stage: 'learning',
        title: 'Analytics lifecycle is operating',
        status: operations.lifecycle.dueSnapshots > 20 ? 'warn' : 'pass',
        message:
          operations.lifecycle.dueSnapshots > 0
            ? `${operations.lifecycle.dueSnapshots} lifecycle metric snapshot(s) are currently due.`
            : 'No lifecycle metric snapshots are overdue.',
        action: '/admin/media/learning',
      },
      {
        key: 'orphan_integrity',
        stage: 'integrity',
        title: 'No orphaned active publications',
        status: integrity.orphanedPublications === 0 ? 'pass' : 'block',
        message:
          integrity.orphanedPublications === 0
            ? 'Every active publication still resolves to an active canonical content item.'
            : `${integrity.orphanedPublications} active publication(s) reference missing/inactive canonical content.`,
        action: '/admin/media/core',
      },
      {
        key: 'unverified_library_uploads',
        stage: 'integrity',
        title: 'Media Library upload intents are resolved',
        status: integrity.unverifiedLibraryAssets > 0 ? 'warn' : 'pass',
        message:
          integrity.unverifiedLibraryAssets > 0
            ? `${integrity.unverifiedLibraryAssets} reusable Media Library upload(s) are still unverified/planned.`
            : 'No reusable Media Library uploads are left in an unverified state.',
        action: '/admin/media/library',
      },
    ];

    const blockers = checks.filter((item) => item.status === 'block');
    const warnings = checks.filter((item) => item.status === 'warn');
    const stageOrder: ReleaseStage[] = [
      'intelligence',
      'launch',
      'planning',
      'production',
      'review',
      'delivery',
      'learning',
      'integrity',
    ];
    const stages = stageOrder.map((stage) => {
      const stageChecks = checks.filter((item) => item.stage === stage);
      return {
        stage,
        status: stageChecks.some((item) => item.status === 'block')
          ? ('blocked' as const)
          : stageChecks.some((item) => item.status === 'warn')
            ? ('attention' as const)
            : ('ready' as const),
        passed: stageChecks.filter((item) => item.status === 'pass').length,
        total: stageChecks.length,
      };
    });
    const passed = checks.filter((item) => item.status === 'pass').length;
    const score = Math.round((passed / Math.max(checks.length, 1)) * 100);

    return {
      generatedAt: new Date().toISOString(),
      timezone: TZ,
      status:
        blockers.length > 0
          ? ('blocked' as const)
          : warnings.length > 0
            ? ('attention' as const)
            : ('ready' as const),
      releaseCandidateReady: blockers.length === 0,
      score,
      blockers: blockers.map((item) => ({
        key: item.key,
        title: item.title,
        message: item.message,
        action: item.action,
      })),
      warnings: warnings.map((item) => ({
        key: item.key,
        title: item.title,
        message: item.message,
        action: item.action,
      })),
      checks,
      stages,
      snapshot: {
        today,
        plan: plan
          ? {
              id: plan._id.toString(),
              startDate: plan.startDate,
              endDate: plan.endDate,
              days: plan.days.length,
            }
          : null,
        launchDay: launch.dayNumber,
        launchPhase: launch.phase,
        profilesApplied: launch.readiness.profilesApplied,
        reviewQueue: review.summary,
        operations: {
          status: operations.status,
          queueRequiresAttention: operations.queue.requiresAttention,
          dueSnapshots: operations.lifecycle.dueSnapshots,
        },
        integrity,
      },
      policy: {
        thisAuditNeverPublishesContent: true,
        thisAuditNeverSendsEngagementReplies: true,
        ownerApprovedFreshPreflightIsRequiredForScheduledContent: true,
        everyPlanningDayMustExplicitlyPostOrSkipAllFivePrimaryPlatforms: true,
        safeRepairOnlyReconcilesExistingDeliveryState: true,
        releaseReadinessDoesNotOverridePrivacyOrEvidenceBlocks: true,
      },
    };
  }

  async repairSafeState() {
    const operations = await this.operationsService.repairSafeState();
    const overview = await this.overview();
    return {
      ranAt: new Date().toISOString(),
      operations,
      overview,
      policy: {
        doesNotPublishNewContent: true,
        doesNotGenerateNewContent: true,
        doesNotSendEngagementReplies: true,
        doesNotApprovePreflight: true,
        doesNotBlindlyRetryAmbiguousDirectPublishes: true,
      },
    };
  }

  private booleanCheck(
    key: string,
    stage: ReleaseStage,
    title: string,
    value: boolean,
    passMessage: string,
    failMessage: string,
    action?: string,
  ): ReleaseCheck {
    return {
      key,
      stage,
      title,
      status: value ? 'pass' : 'block',
      message: value ? passMessage : failMessage,
      action,
    };
  }

  private planHealth(
    plan: (MediaPlanningCycle & { _id: { toString(): string } }) | null,
    today: string,
  ) {
    if (!plan) {
      return {
        valid: false,
        message: `No seven-day Presence Plan covers ${today}.`,
        platformCoverageValid: false,
        platformCoverageMessage:
          'A current plan is required before five-platform coverage can be verified.',
      };
    }
    const datesValid = plan.days.length === 7;
    let platformCoverageValid = datesValid;
    const missing: string[] = [];
    for (const day of plan.days) {
      const platforms = new Set(day.executions.map((item) => item.platform));
      const missingPlatforms = PRIMARY_PLATFORMS.filter(
        (platform) => !platforms.has(platform),
      );
      if (
        missingPlatforms.length > 0 ||
        platforms.size !== PRIMARY_PLATFORMS.length
      ) {
        platformCoverageValid = false;
        missing.push(
          `${day.date}: ${missingPlatforms.length ? missingPlatforms.join(', ') : 'duplicate platform decision'}`,
        );
      }
    }
    return {
      valid: datesValid,
      message: datesValid
        ? `${plan.startDate} → ${plan.endDate} covers today with exactly seven plan days.`
        : `The current plan contains ${plan.days.length} day(s), not seven.`,
      platformCoverageValid,
      platformCoverageMessage: platformCoverageValid
        ? 'Each of the seven days contains exactly one POST or SKIP decision for LinkedIn, Instagram, YouTube, X and WhatsApp.'
        : `Five-platform daily coverage is incomplete: ${missing.slice(0, 4).join('; ')}${missing.length > 4 ? `; +${missing.length - 4} more` : ''}.`,
    };
  }

  private async integrityHealth() {
    const scheduled = await this.publicationModel
      .find({
        isActive: true,
        status: MediaPostStatus.SCHEDULED,
        deliveryStatus: {
          $in: [
            MediaDeliveryStatus.SCHEDULED,
            MediaDeliveryStatus.PUBLISHING,
            MediaDeliveryStatus.MANUAL_REQUIRED,
            MediaDeliveryStatus.FAILED,
          ],
        },
      })
      .sort({ scheduledAt: 1 })
      .limit(200)
      .lean();

    const contentIds = [
      ...new Set(scheduled.map((item) => item.contentItemId.toString())),
    ];
    const activeContent = contentIds.length
      ? await this.contentModel
          .find({ _id: { $in: contentIds }, isActive: true })
          .select({ _id: 1 })
          .lean()
      : [];
    const activeContentIds = new Set(
      activeContent.map((item) => item._id.toString()),
    );
    const scheduledOrphans = scheduled.filter(
      (item) => !activeContentIds.has(item.contentItemId.toString()),
    ).length;

    const activePublicationIds = await this.publicationModel
      .find({ isActive: true })
      .select({ _id: 1, contentItemId: 1 })
      .limit(5000)
      .lean();
    const allContentIds = [
      ...new Set(
        activePublicationIds.map((item) => item.contentItemId.toString()),
      ),
    ];
    const allActiveContent = allContentIds.length
      ? await this.contentModel
          .find({ _id: { $in: allContentIds }, isActive: true })
          .select({ _id: 1 })
          .lean()
      : [];
    const allActiveSet = new Set(
      allActiveContent.map((item) => item._id.toString()),
    );
    const orphanedPublications = activePublicationIds.filter(
      (item) => !allActiveSet.has(item.contentItemId.toString()),
    ).length;

    const approvalStates = await Promise.all(
      scheduled.map(async (publication) => {
        try {
          const result = await this.preflightService.get(
            publication._id.toString(),
          );
          return (
            result.review?.status === MediaPublicationReviewStatus.APPROVED &&
            !result.stale
          );
        } catch {
          return false;
        }
      }),
    );
    const scheduledWithoutFreshApproval = approvalStates.filter(
      (approved) => !approved,
    ).length;

    const scheduledIds = scheduled.map((item) => item._id);
    const scheduledWithPendingRequiredAssets = scheduledIds.length
      ? await this.assetModel.countDocuments({
          isActive: true,
          publicationId: { $in: scheduledIds },
          generatedFromProduction: true,
          required: true,
          status: { $ne: MediaAssetStatus.READY },
        })
      : 0;
    const unverifiedLibraryAssets = await this.assetModel.countDocuments({
      isActive: true,
      libraryReusable: true,
      status: MediaAssetStatus.PLANNED,
    });

    return {
      activePublicationsAudited: activePublicationIds.length,
      scheduledPublicationsAudited: scheduled.length,
      scheduledOrphans,
      orphanedPublications,
      scheduledWithoutFreshApproval,
      scheduledWithPendingRequiredAssets,
      unverifiedLibraryAssets,
      auditCap: {
        activePublications: 5000,
        scheduledPublications: 200,
      },
    };
  }

  private localDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
