import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MediaCalendarService } from './media-calendar.service';
import { MediaEngagementService } from './media-engagement.service';
import { MediaLearningService } from './media-learning.service';
import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';
import {
  MediaPlanningCycle,
  MediaPlanningCycleDocument,
} from './schemas/media-planning-cycle.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import { MediaExecutionService } from './media-execution.service';
import { MediaExecutionKind } from './schemas/media-daily-execution.schema';

const TZ = 'Asia/Kolkata';

@Injectable()
export class MediaTodayService {
  constructor(
    @InjectModel(MediaPlanningCycle.name)
    private readonly planningModel: Model<MediaPlanningCycleDocument>,
    private readonly calendarService: MediaCalendarService,
    private readonly engagementService: MediaEngagementService,
    private readonly learningService: MediaLearningService,
    private readonly adaptationService: MediaStrategyAdaptationService,
    private readonly executionService: MediaExecutionService,
  ) {}

  async overview(date?: string) {
    const today = date?.slice(0, 10) || this.localDate(new Date());
    const issues: string[] = [];

    const safe = async <T>(
      label: string,
      operation: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        issues.push(`${label}: ${this.errorMessage(error)}`);
        return fallback;
      }
    };

    const [plan, calendar, engagement, learning, adaptation] =
      await Promise.all([
        safe(
          'Presence Plan',
          () =>
            this.planningModel
              .findOne({
                isActive: true,
                startDate: { $lte: today },
                endDate: { $gte: today },
              })
              .sort({ startDate: -1, generatedAt: -1 })
              .lean(),
          null,
        ),
        safe('Publishing Calendar', () => this.calendarService.overview(), {
          publishingQueue: [],
        } as unknown as Awaited<ReturnType<MediaCalendarService['overview']>>),
        safe('Engagement', () => this.engagementService.overview(14), {
          recent: [],
        } as unknown as Awaited<
          ReturnType<MediaEngagementService['overview']>
        >),
        safe('Learning', () => this.learningService.overview(90), {
          lifecycle: { due: [] },
        } as unknown as Awaited<ReturnType<MediaLearningService['overview']>>),
        safe('Presence Adaptation', () => this.adaptationService.overview(), {
          latest: null,
        } as unknown as Awaited<
          ReturnType<MediaStrategyAdaptationService['overview']>
        >),
      ]);
    const planDays = Array.isArray(plan?.days) ? plan.days : [];
    const day = planDays.find((item) => item.date === today) ?? null;
    const dayExecutions = Array.isArray(day?.executions) ? day.executions : [];
    const dayEngagement = Array.isArray(day?.engagement) ? day.engagement : [];
    const publishingQueue = Array.isArray(calendar?.publishingQueue)
      ? calendar.publishingQueue
      : [];
    const recentEngagement = Array.isArray(engagement?.recent)
      ? engagement.recent
      : [];
    const lifecycleDue = Array.isArray(learning?.lifecycle?.due)
      ? learning.lifecycle.due
      : [];
    const publishing = publishingQueue.filter((item) => {
      if (!item.scheduledAt) return false;
      return this.localDate(new Date(item.scheduledAt)) === today;
    });
    const urgentEngagement = recentEngagement
      .filter((item) => item.needsResponse)
      .slice(0, 10);
    const analyticsDue = lifecycleDue.slice(0, 20);
    const postExecutions = dayExecutions.filter(
      (item) => item.action === 'post',
    );
    const skipExecutions = dayExecutions.filter(
      (item) => item.action === 'skip',
    );
    const production = postExecutions
      .filter((item) => item.estimatedMinutes > 0)
      .map((item) => ({
        platform: item.platform,
        time: item.time,
        title: item.title || item.hook || `${item.platform} content`,
        format: item.format,
        estimatedMinutes: item.estimatedMinutes,
        instruction:
          item.productionNotes || `Prepare the ${item.format} execution.`,
      }));
    const manualPublishing = publishing.filter(
      (item) => item.deliveryStatus === MediaDeliveryStatus.MANUAL_REQUIRED,
    );
    const totalPlannedMinutes =
      postExecutions.reduce((sum, item) => sum + item.estimatedMinutes, 0) +
      dayEngagement.reduce((sum, item) => sum + Math.max(0, item.count) * 3, 0);

    const storyExecution =
      day?.instagramStory?.action === 'post'
        ? {
            key: `${today}:post:instagram_story:${day.instagramStory.time || 'flexible'}`,
            date: today,
            kind: MediaExecutionKind.POST,
            platform: MediaPlatform.INSTAGRAM,
            title: `Instagram Story · ${day.theme}`,
            time: day.instagramStory.time || undefined,
            sourceKey: 'instagram_story',
            instruction:
              day.instagramStory.captureBrief || day.instagramStory.reason,
          }
        : null;
    const communityExecution =
      day?.youtubeCommunity?.action === 'post'
        ? {
            key: `${today}:post:youtube_community:${day.youtubeCommunity.time || 'flexible'}`,
            date: today,
            kind: MediaExecutionKind.POST,
            platform: MediaPlatform.YOUTUBE,
            title: `YouTube Community · ${day.theme}`,
            time: day.youtubeCommunity.time || undefined,
            sourceKey: 'youtube_community',
            instruction:
              day.youtubeCommunity.publishCopy || day.youtubeCommunity.reason,
          }
        : null;

    const executionSeeds = [
      ...postExecutions.map((item, index) => ({
        key: `${today}:post:${item.platform}:${item.time}:${index}`,
        date: today,
        kind: MediaExecutionKind.POST,
        platform: item.platform,
        title: item.title || item.hook || `${item.platform} post`,
        time: item.time,
        sourceKey: item.opportunityKey || item.storyArcKey,
        instruction: item.productionNotes || item.caption || item.script,
      })),
      ...(storyExecution ? [storyExecution] : []),
      ...(communityExecution ? [communityExecution] : []),
      ...production.map((item, index) => ({
        key: `${today}:production:${item.platform}:${item.time}:${index}`,
        date: today,
        kind: MediaExecutionKind.PRODUCTION,
        platform: item.platform,
        title: item.title,
        time: item.time,
        instruction: item.instruction,
      })),
      ...dayEngagement.map((item, index) => ({
        key: `${today}:engagement:${item.platform}:${item.time}:${index}`,
        date: today,
        kind: MediaExecutionKind.ENGAGEMENT,
        platform: item.platform,
        title: `${item.count} meaningful ${item.count === 1 ? 'interaction' : 'interactions'} on ${item.platform}`,
        time: item.time,
        plannedCount: item.count,
        instruction: `${item.purpose} — ${item.guidance}`,
      })),
      ...manualPublishing.map((item, index) => ({
        key: `${today}:manual_publish:${String(item._id)}:${index}`,
        date: today,
        kind: MediaExecutionKind.MANUAL_PUBLISH,
        platform: item.platform,
        title: item.title || item.hook || `Manual ${item.platform} publish`,
        sourceId: String(item._id),
        instruction:
          'Publish using the approved production pack, then mark the existing publication complete.',
      })),
      ...analyticsDue.slice(0, 20).map((item, index) => ({
        key: `${today}:analytics:${item.publicationId}:${item.period}:${index}`,
        date: today,
        kind: MediaExecutionKind.ANALYTICS_REVIEW,
        platform: item.platform,
        title: `${item.period.replaceAll('_', ' ')} review · ${item.title}`,
        sourceId: item.publicationId,
        instruction:
          'Sync the due lifecycle snapshot and review HSAKAA performance learning.',
      })),
      ...urgentEngagement.slice(0, 10).map((item, index) => ({
        key: `${today}:reply:${String(item._id)}:${index}`,
        date: today,
        kind: MediaExecutionKind.INBOUND_REPLY,
        platform: item.platform,
        title: `Review inbound ${item.platform} reply`,
        sourceId: String(item._id),
        instruction: item.suggestedReply || item.text,
      })),
    ];
    const executionTasks = await safe(
      'Daily Execution',
      () => this.executionService.sync(today, executionSeeds),
      [],
    );
    const carryForward = await safe(
      'Carry Forward',
      () => this.executionService.carryForward(today),
      [],
    );

    return {
      generatedAt: new Date().toISOString(),
      date: today,
      timezone: TZ,
      presenceScore: adaptation.latest
        ? {
            overall: Number(adaptation.latest.overallScore) || 0,
            delta: Number(adaptation.latest.scoreDelta) || 0,
            confidence: Number(adaptation.latest.dataConfidence) || 0,
            platforms: Array.isArray(adaptation.latest.platformScores)
              ? adaptation.latest.platformScores
              : [],
          }
        : null,
      plan: plan
        ? {
            id: plan._id.toString(),
            startDate: plan.startDate,
            endDate: plan.endDate,
          }
        : null,
      day,
      theme: day?.theme ?? 'No current seven-day Presence Plan covers today.',
      workload:
        day?.workload ?? 'Generate the Presence Plan before operating today.',
      totalPlannedMinutes,
      posts: postExecutions,
      skips: skipExecutions,
      production,
      engagement: dayEngagement,
      inboundReplies: urgentEngagement,
      publishing,
      manualPublishing,
      analyticsDue,
      execution: {
        tasks: executionTasks,
        carryForward,
        summary: this.executionService.summary(executionTasks),
      },
      review: {
        weeklyFocus: Array.isArray(adaptation.latest?.focusThisWeek)
          ? adaptation.latest.focusThisWeek
          : [],
        weeklyAvoid: Array.isArray(adaptation.latest?.avoidThisWeek)
          ? adaptation.latest.avoidThisWeek
          : [],
        strategyChangeCandidates: Array.isArray(
          adaptation.latest?.strategyChangeCandidates,
        )
          ? adaptation.latest.strategyChangeCandidates
          : [],
      },
      health: {
        degraded: issues.length > 0,
        issues,
      },
      policy: {
        todayIsSingleOperatingView: true,
        skipIsAValidAction: true,
        exactPlatformCopyComesFromPresencePlan: true,
        outboundEngagementIsGuidanceUntilSpecificExternalTargetsAreAvailable: true,
        inboundRepliesStillRequireApproval: true,
        publishingStillRequiresExistingApprovalFlow: true,
        materialStrategyChangesRequireApproval: true,
        executionProgressIsPersisted: true,
        unfinishedRecentWorkIsCarriedForward: true,
      },
    };
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'temporarily unavailable';
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
