import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import {
  BrainDumpSource,
  BrainDumpStatus,
  BrainDumpTarget,
} from '../modules/brain-dump/schemas/brain-dump.schema';
import { ChatService } from '../modules/chat/chat.service';
import { MessageRole } from '../modules/chat/schemas/message.schema';
import { JournalService } from '../modules/journal/journal.service';
import { MediaContentDirectorService } from '../modules/media/media-content-director.service';
import { MediaProductionService } from '../modules/media/media-production.service';
import { MediaCalendarService } from '../modules/media/media-calendar.service';
import { MediaEngagementService } from '../modules/media/media-engagement.service';
import { MediaPlatform } from '../modules/media/schemas/media-post.schema';
import {
  JournalEntryType,
  JournalMood,
  JournalSource,
  JournalVisibility,
} from '../modules/journal/schemas/journal-entry.schema';
import { MemoryService } from '../modules/memory/memory.service';
import { RemindersService } from '../modules/reminders/reminders.service';
import { ReminderStatus } from '../modules/reminders/schemas/reminder.schema';
import {
  MemoryAccessLevel,
  MemoryDurability,
  MemoryEntityType,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../modules/memory/schemas/memory.schema';
import {
  TaskPriority,
  TaskSource,
  TaskStatus,
} from '../modules/tasks/schemas/task.schema';
import { TasksService } from '../modules/tasks/tasks.service';
import {
  HsakaaDecisionEvidenceKind,
  HsakaaDecisionEvidenceStance,
  HsakaaDecisionExperimentResult,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { HsakaaDecisionExperimentService } from './hsakaa-decision-experiment.service';
import {
  HsakaaAction,
  HsakaaActionDocument,
  HsakaaActionRisk,
  HsakaaActionStatus,
  HsakaaActionType,
} from './schemas/hsakaa-action.schema';

export interface HsakaaClientAction {
  id: string;
  type: HsakaaActionType;
  status: HsakaaActionStatus;
  risk: HsakaaActionRisk;
  summary: string;
  preview: Record<string, unknown>;
  expiresAt: string;
  confirmationToken: string;
}

interface ProposalContext {
  conversationId: string | Types.ObjectId;
  requestId: string;
}

type RawArguments = Record<string, unknown>;

@Injectable()
export class HsakaaActionService {
  private readonly confirmationTtlMinutes: number;

  constructor(
    @InjectModel(HsakaaAction.name)
    private readonly actionModel: Model<HsakaaActionDocument>,
    private readonly tasksService: TasksService,
    private readonly brainDumpService: BrainDumpService,
    private readonly journalService: JournalService,
    private readonly memoryService: MemoryService,
    private readonly remindersService: RemindersService,
    private readonly decisionExperimentService: HsakaaDecisionExperimentService,
    private readonly mediaContentDirectorService: MediaContentDirectorService,
    private readonly mediaProductionService: MediaProductionService,
    private readonly mediaCalendarService: MediaCalendarService,
    private readonly mediaEngagementService: MediaEngagementService,
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) {
    const configured = Number(
      this.configService.get<string>('HSAKAA_ACTION_CONFIRMATION_TTL_MINUTES'),
    );

    this.confirmationTtlMinutes = Number.isFinite(configured)
      ? Math.min(Math.max(Math.trunc(configured), 5), 120)
      : 30;
  }

  async proposeTaskCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const title = this.requiredString(args, 'title', 200);
    const status = this.optionalEnum(
      args,
      'status',
      [
        TaskStatus.INBOX,
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.WAITING,
        TaskStatus.BLOCKED,
      ],
      TaskStatus.TODO,
    );
    const priority = this.optionalEnum(
      args,
      'priority',
      Object.values(TaskPriority),
      TaskPriority.MEDIUM,
    );

    const payload = this.cleanTaskWritePayload(args, {
      includeTitle: true,
      includeStatus: true,
    });
    payload.title = title;
    payload.status = status;
    payload.priority = priority;

    return this.createProposal(context, {
      actionType: HsakaaActionType.TASK_CREATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Create task “${title}”`,
      preview: this.taskCreatePreview(payload),
      payload,
    });
  }

  async proposeTaskUpdate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const taskId = this.requiredTaskId(args);
    const task = await this.tasksService.findOne(taskId);
    const updates = this.cleanTaskWritePayload(args, {
      includeTitle: true,
      includeStatus: false,
      excludeTaskId: true,
    });

    if (!Object.keys(updates).length) {
      throw new BadRequestException('At least one task field must be changed.');
    }

    return this.createProposal(context, {
      actionType: HsakaaActionType.TASK_UPDATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Update task “${task.title}”`,
      preview: {
        Task: task.title,
        ...this.humanizeTaskChanges(updates),
      },
      payload: { taskId, updates },
      targetTaskId: taskId,
    });
  }

  async proposeTaskStatus(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const taskId = this.requiredTaskId(args);
    const task = await this.tasksService.findOne(taskId);
    const status = this.requiredEnum(args, 'status', Object.values(TaskStatus));

    return this.createProposal(context, {
      actionType: HsakaaActionType.TASK_STATUS,
      risk: HsakaaActionRisk.LOW,
      summary: `Change task “${task.title}” to ${this.humanStatus(status)}`,
      preview: {
        Task: task.title,
        From: this.humanStatus(task.status),
        To: this.humanStatus(status),
      },
      payload: { taskId, status },
      targetTaskId: taskId,
    });
  }

  async proposeTaskComplete(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleTaskAction(
      context,
      args,
      HsakaaActionType.TASK_COMPLETE,
      'Complete',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeTaskReopen(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleTaskAction(
      context,
      args,
      HsakaaActionType.TASK_REOPEN,
      'Reopen',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeTaskArchive(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleTaskAction(
      context,
      args,
      HsakaaActionType.TASK_ARCHIVE,
      'Archive',
      HsakaaActionRisk.MEDIUM,
    );
  }

  async proposeBrainDumpCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const content = this.requiredString(args, 'content', 12000);
    const payload = this.cleanBrainDumpCreatePayload(args);
    payload.content = content;

    const label =
      typeof payload.title === 'string' && payload.title
        ? payload.title
        : this.previewText(content, 90);

    return this.createProposal(context, {
      actionType: HsakaaActionType.BRAIN_DUMP_CREATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Capture Brain Dump “${label}”`,
      preview: {
        Title: payload.title ?? null,
        Content: this.previewText(content, 240),
        Tags: payload.tags ?? [],
        Favourite: payload.isFavourite ?? false,
      },
      payload,
    });
  }

  async proposeBrainDumpProcess(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const brainDumpId = this.requiredBrainDumpId(args);
    const item = await this.brainDumpService.findOne(brainDumpId);

    if (item.status !== BrainDumpStatus.INBOX) {
      throw new ConflictException(
        `Brain dump item cannot be processed from status "${item.status}".`,
      );
    }

    const target = this.requiredEnum(
      args,
      'target',
      Object.values(BrainDumpTarget),
    );
    const processPayload = this.cleanBrainDumpProcessPayload(args, target);

    return this.createProposal(context, {
      actionType: HsakaaActionType.BRAIN_DUMP_PROCESS,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Process Brain Dump as ${target}`,
      preview: {
        BrainDump: item.title ?? this.previewText(item.content, 120),
        Target: target,
        Title: processPayload.title ?? item.title ?? null,
        Priority: processPayload.priority ?? null,
        Area: processPayload.area ?? null,
        Due: processPayload.dueAt ?? null,
        Tags: processPayload.tags ?? [],
      },
      payload: { brainDumpId, ...processPayload },
      targetBrainDumpId: brainDumpId,
    });
  }

  async proposeBrainDumpDiscard(context: ProposalContext, args: RawArguments) {
    const brainDumpId = this.requiredBrainDumpId(args);
    const item = await this.brainDumpService.findOne(brainDumpId);

    if (item.status === BrainDumpStatus.PROCESSED) {
      throw new ConflictException(
        'Processed brain dump items cannot be discarded. Archive them instead.',
      );
    }

    return this.createBrainDumpStateProposal(
      context,
      item,
      brainDumpId,
      HsakaaActionType.BRAIN_DUMP_DISCARD,
      'Discard',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeBrainDumpReopen(context: ProposalContext, args: RawArguments) {
    const brainDumpId = this.requiredBrainDumpId(args);
    const item = await this.brainDumpService.findOne(brainDumpId);

    if (item.status !== BrainDumpStatus.DISCARDED) {
      throw new ConflictException(
        'Only discarded brain dump items can be reopened.',
      );
    }

    return this.createBrainDumpStateProposal(
      context,
      item,
      brainDumpId,
      HsakaaActionType.BRAIN_DUMP_REOPEN,
      'Reopen',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeBrainDumpArchive(context: ProposalContext, args: RawArguments) {
    const brainDumpId = this.requiredBrainDumpId(args);
    const item = await this.brainDumpService.findOne(brainDumpId);

    return this.createBrainDumpStateProposal(
      context,
      item,
      brainDumpId,
      HsakaaActionType.BRAIN_DUMP_ARCHIVE,
      'Archive',
      HsakaaActionRisk.MEDIUM,
    );
  }

  async proposeJournalCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const title = this.requiredString(args, 'title', 240);
    const payload = this.cleanJournalWritePayload(args, true);
    payload.title = title;
    payload.date =
      this.optionalIsoDate(args, 'date') ?? new Date().toISOString();
    payload.visibility = JournalVisibility.PRIVATE;
    payload.isPublished = false;
    payload.source = JournalSource.HSAKAA;

    return this.createProposal(context, {
      actionType: HsakaaActionType.JOURNAL_CREATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Create private journal entry “${title}”`,
      preview: this.journalPreview(payload),
      payload,
    });
  }

  async proposeJournalUpdate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const journalEntryId = this.requiredJournalEntryId(args);
    const entry = await this.journalService.findById(journalEntryId);
    const updates = this.cleanJournalWritePayload(args, false);

    if (!Object.keys(updates).length) {
      throw new BadRequestException(
        'At least one journal field must be changed.',
      );
    }

    return this.createProposal(context, {
      actionType: HsakaaActionType.JOURNAL_UPDATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Update journal entry “${entry.title}”`,
      preview: {
        Journal: entry.title,
        ...this.humanizeJournalChanges(updates),
      },
      payload: { journalEntryId, updates },
      targetJournalEntryId: journalEntryId,
    });
  }

  async proposeJournalAppend(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const journalEntryId = this.requiredJournalEntryId(args);
    const entry = await this.journalService.findById(journalEntryId);
    const content = this.requiredString(args, 'content', 12000);

    return this.createProposal(context, {
      actionType: HsakaaActionType.JOURNAL_APPEND,
      risk: HsakaaActionRisk.LOW,
      summary: `Append to journal entry “${entry.title}”`,
      preview: {
        Journal: entry.title,
        Append: this.previewText(content, 360),
      },
      payload: { journalEntryId, content },
      targetJournalEntryId: journalEntryId,
    });
  }

  async proposeJournalArchive(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleJournalAction(
      context,
      args,
      HsakaaActionType.JOURNAL_ARCHIVE,
      'Archive',
      HsakaaActionRisk.MEDIUM,
    );
  }

  async proposeJournalRestore(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleJournalAction(
      context,
      args,
      HsakaaActionType.JOURNAL_RESTORE,
      'Restore',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeMemoryCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const content = this.requiredString(args, 'content', 12000);
    const payload = this.cleanMemoryWritePayload(args);
    payload.content = content;
    payload.source = MemorySource.CHAT;
    payload.verificationStatus = MemoryVerificationStatus.CONFIRMED;
    payload.accessLevel = payload.accessLevel ?? MemoryAccessLevel.OWNER_ONLY;
    payload.sensitivity = payload.sensitivity ?? MemorySensitivity.NORMAL;

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEMORY_CREATE,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Save memory “${this.previewText(content, 100)}”`,
      preview: this.memoryPreview(payload),
      payload,
    });
  }

  async proposeMemoryUpdate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const memoryId = this.requiredMemoryId(args);
    const memory = await this.memoryService.findOne(memoryId);
    const updates = this.cleanMemoryWritePayload(args);

    if (!Object.keys(updates).length) {
      throw new BadRequestException(
        'At least one memory field must be changed.',
      );
    }

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEMORY_UPDATE,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Update memory “${this.previewText(memory.content, 100)}”`,
      preview: {
        Memory: this.previewText(memory.content, 180),
        ...this.humanizeMemoryChanges(updates),
      },
      payload: { memoryId, updates },
      targetMemoryId: memoryId,
    });
  }

  async proposeMemoryArchive(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleMemoryAction(
      context,
      args,
      HsakaaActionType.MEMORY_ARCHIVE,
      'Archive',
      HsakaaActionRisk.MEDIUM,
    );
  }

  async proposeMemoryRestore(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleMemoryAction(
      context,
      args,
      HsakaaActionType.MEMORY_RESTORE,
      'Restore',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeReminderCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const title = this.requiredString(args, 'title', 200);
    const reminderAt = this.requiredDateString(args, 'reminderAt');

    if (new Date(reminderAt).getTime() <= Date.now()) {
      throw new BadRequestException('Reminder time must be in the future.');
    }

    const priority = this.optionalEnum(
      args,
      'priority',
      Object.values(TaskPriority),
      TaskPriority.MEDIUM,
    );

    const payload: Record<string, unknown> = {
      title,
      reminderAt,
      priority,
      status: TaskStatus.TODO,
      ...(this.optionalString(args, 'description', 5000)
        ? { description: this.optionalString(args, 'description', 5000) }
        : {}),
      ...(this.optionalDateString(args, 'dueAt')
        ? { dueAt: this.optionalDateString(args, 'dueAt') }
        : {}),
      ...(this.optionalString(args, 'area', 100)
        ? { area: this.optionalString(args, 'area', 100) }
        : {}),
      ...(this.stringArray(args, 'tags', 30, 100).length
        ? { tags: this.stringArray(args, 'tags', 30, 100) }
        : {}),
    };

    return this.createProposal(context, {
      actionType: HsakaaActionType.REMINDER_CREATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Create reminder “${title}”`,
      preview: {
        Reminder: title,
        ScheduledFor: reminderAt,
        DueAt: payload.dueAt ?? null,
        Priority: priority,
        Storage: 'Task-backed reminder',
      },
      payload,
    });
  }

  async proposeReminderSync(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const rawDays = args.days;
    const days =
      typeof rawDays === 'number' && Number.isFinite(rawDays)
        ? Math.min(Math.max(Math.trunc(rawDays), 1), 14)
        : 2;

    return this.createProposal(context, {
      actionType: HsakaaActionType.REMINDER_SYNC,
      risk: HsakaaActionRisk.LOW,
      summary: `Sync reminders for the next ${days} day${days === 1 ? '' : 's'}`,
      preview: {
        Days: days,
        Action: 'Generate/update reminders from Tasks and care routines',
      },
      payload: { days },
    });
  }

  async proposeReminderSnooze(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const reminderId = this.requiredReminderId(args);
    const reminder = await this.remindersService.findOne(reminderId);
    if (
      reminder.status === ReminderStatus.ACKNOWLEDGED ||
      reminder.status === ReminderStatus.DISMISSED
    ) {
      throw new ConflictException(
        'A completed reminder must be reopened before it can be snoozed.',
      );
    }
    const minutes =
      typeof args.minutes === 'number' && Number.isFinite(args.minutes)
        ? Math.min(Math.max(Math.trunc(args.minutes), 1), 10080)
        : undefined;
    const until = this.optionalDateString(args, 'until');

    if (!minutes && !until) {
      throw new BadRequestException(
        'Provide either snooze minutes or an until timestamp.',
      );
    }

    const scheduled = until
      ? new Date(until)
      : new Date(Date.now() + (minutes ?? 15) * 60_000);

    if (scheduled.getTime() <= Date.now()) {
      throw new BadRequestException('Snooze time must be in the future.');
    }

    return this.createProposal(context, {
      actionType: HsakaaActionType.REMINDER_SNOOZE,
      risk: HsakaaActionRisk.LOW,
      summary: `Snooze reminder “${reminder.title}”`,
      preview: {
        Reminder: reminder.title,
        CurrentStatus: reminder.status,
        SnoozedUntil: scheduled.toISOString(),
      },
      payload: {
        reminderId,
        ...(minutes ? { minutes } : {}),
        ...(until ? { until } : {}),
      },
      targetReminderId: reminderId,
    });
  }

  async proposeReminderAcknowledge(
    context: ProposalContext,
    args: RawArguments,
  ) {
    return this.proposeSimpleReminderAction(
      context,
      args,
      HsakaaActionType.REMINDER_ACKNOWLEDGE,
      'Acknowledge',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeReminderDismiss(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleReminderAction(
      context,
      args,
      HsakaaActionType.REMINDER_DISMISS,
      'Dismiss',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeReminderReopen(context: ProposalContext, args: RawArguments) {
    return this.proposeSimpleReminderAction(
      context,
      args,
      HsakaaActionType.REMINDER_REOPEN,
      'Reopen',
      HsakaaActionRisk.LOW,
    );
  }

  async proposeDecisionExperimentCreate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const decisionId = this.requiredDecisionId(args);
    const state =
      await this.decisionExperimentService.getDecisionState(decisionId);
    const title = this.requiredString(args, 'title', 180);
    const hypothesis = this.requiredString(args, 'hypothesis', 600);
    const successCriteria = this.requiredString(args, 'successCriteria', 600);
    const failureCriteria = this.requiredString(args, 'failureCriteria', 600);
    const payload = {
      title,
      hypothesis,
      successCriteria,
      failureCriteria,
      ...(this.optionalString(args, 'description', 1000)
        ? { description: this.optionalString(args, 'description', 1000) }
        : {}),
      assumptionIds: this.stringArray(args, 'assumptionIds', 12, 80),
      supportsOptionIds: this.stringArray(args, 'supportsOptionIds', 5, 40),
      ...(this.optionalDateString(args, 'startAt')
        ? { startAt: this.optionalDateString(args, 'startAt') }
        : {}),
      ...(this.optionalDateString(args, 'targetReviewAt')
        ? { targetReviewAt: this.optionalDateString(args, 'targetReviewAt') }
        : {}),
    };

    return this.createProposal(context, {
      actionType: HsakaaActionType.DECISION_EXPERIMENT_CREATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Create decision experiment “${title}”`,
      preview: {
        Decision: state.question,
        Experiment: title,
        Hypothesis: hypothesis,
        SuccessCriteria: successCriteria,
        TargetReviewAt: payload.targetReviewAt ?? null,
      },
      payload: { decisionId, ...payload },
      targetDecisionId: decisionId,
    });
  }

  async proposeDecisionEvidenceAdd(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const decisionId = this.requiredDecisionId(args);
    const state =
      await this.decisionExperimentService.getDecisionState(decisionId);
    const kind = this.requiredEnum(
      args,
      'kind',
      Object.values(HsakaaDecisionEvidenceKind),
    );
    const stance = this.requiredEnum(
      args,
      'stance',
      Object.values(HsakaaDecisionEvidenceStance),
    );
    const detail = this.requiredString(args, 'detail', 1800);
    const payload = {
      kind,
      stance,
      detail,
      ...(this.optionalString(args, 'sourceReference', 500)
        ? { sourceReference: this.optionalString(args, 'sourceReference', 500) }
        : {}),
      ...(this.optionalString(args, 'metricLabel', 80)
        ? { metricLabel: this.optionalString(args, 'metricLabel', 80) }
        : {}),
      ...(this.optionalString(args, 'metricValue', 120)
        ? { metricValue: this.optionalString(args, 'metricValue', 120) }
        : {}),
      ...(this.optionalDateString(args, 'occurredAt')
        ? { occurredAt: this.optionalDateString(args, 'occurredAt') }
        : {}),
      ...(this.optionalString(args, 'experimentId', 80)
        ? { experimentId: this.optionalString(args, 'experimentId', 80) }
        : {}),
      assumptionIds: this.stringArray(args, 'assumptionIds', 12, 80),
    };

    return this.createProposal(context, {
      actionType: HsakaaActionType.DECISION_EVIDENCE_ADD,
      risk: HsakaaActionRisk.LOW,
      summary: `Add evidence to “${state.question}”`,
      preview: {
        Decision: state.question,
        Evidence: this.previewText(detail, 300),
        Kind: kind,
        Stance: stance,
      },
      payload: { decisionId, ...payload },
      targetDecisionId: decisionId,
    });
  }

  async proposeDecisionExperimentComplete(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const decisionId = this.requiredDecisionId(args);
    const state =
      await this.decisionExperimentService.getDecisionState(decisionId);
    const experimentId = this.requiredString(args, 'experimentId', 80);
    const experiment = state.experiments.find(
      (item) => item.id === experimentId,
    );
    if (!experiment)
      throw new NotFoundException('Decision experiment not found.');
    const result = this.requiredEnum(
      args,
      'result',
      Object.values(HsakaaDecisionExperimentResult),
    );
    const conclusion = this.requiredString(args, 'conclusion', 1800);
    const completedAt = this.optionalDateString(args, 'completedAt');

    return this.createProposal(context, {
      actionType: HsakaaActionType.DECISION_EXPERIMENT_COMPLETE,
      risk: HsakaaActionRisk.LOW,
      summary: `Complete decision experiment “${experiment.title}”`,
      preview: {
        Decision: state.question,
        Experiment: experiment.title,
        Result: result,
        Conclusion: this.previewText(conclusion, 300),
      },
      payload: {
        decisionId,
        experimentId,
        result,
        conclusion,
        ...(completedAt ? { completedAt } : {}),
      },
      targetDecisionId: decisionId,
    });
  }

  async proposeDecisionReassess(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const decisionId = this.requiredDecisionId(args);
    const state =
      await this.decisionExperimentService.getDecisionState(decisionId);
    const reason = this.optionalString(args, 'reason', 1200) ?? '';

    return this.createProposal(context, {
      actionType: HsakaaActionType.DECISION_REASSESS,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Reassess decision “${this.previewText(state.question, 120)}”`,
      preview: {
        Decision: state.question,
        EvidenceCount: state.evidenceLog.length,
        PreviousReassessments: state.reassessments.length,
        Reason: reason || 'Explicit reassessment request',
        HistoricalBaseline: 'Will remain unchanged',
      },
      payload: { decisionId, reason, force: true },
      targetDecisionId: decisionId,
    });
  }

  async proposeMediaCandidateAccept(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const runId = this.requiredString(args, 'runId', 64);
    const candidateKey = this.requiredString(args, 'candidateKey', 120);
    if (!Types.ObjectId.isValid(runId)) {
      throw new BadRequestException(
        'runId must be a valid Media generation run ID.',
      );
    }
    const { candidate } = await this.mediaContentDirectorService.getCandidate(
      runId,
      candidateKey,
    );
    const requestedPlatforms = this.stringArray(args, 'platforms', 7, 40);
    const platforms = requestedPlatforms.filter(
      (value): value is MediaPlatform =>
        Object.values(MediaPlatform).includes(value as MediaPlatform),
    );

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_CANDIDATE_ACCEPT,
      risk: HsakaaActionRisk.LOW,
      summary: `Accept Media candidate “${this.previewText(candidate.title, 110)}”`,
      preview: {
        Candidate: candidate.title,
        Score: candidate.finalScore,
        Novelty: candidate.noveltyScore,
        RepetitionRisk: candidate.repetitionRisk,
        Platforms:
          platforms.length > 0
            ? platforms
            : candidate.publications.map((item) => item.platform),
        Result: 'Create canonical content + platform draft publications',
      },
      payload: {
        runId,
        candidateKey,
        ...(platforms.length ? { platforms } : {}),
      },
    });
  }

  async proposeMediaCandidateReject(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const runId = this.requiredString(args, 'runId', 64);
    const candidateKey = this.requiredString(args, 'candidateKey', 120);
    if (!Types.ObjectId.isValid(runId)) {
      throw new BadRequestException(
        'runId must be a valid Media generation run ID.',
      );
    }
    const { candidate } = await this.mediaContentDirectorService.getCandidate(
      runId,
      candidateKey,
    );
    const reason = this.optionalString(args, 'reason', 1000);

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_CANDIDATE_REJECT,
      risk: HsakaaActionRisk.LOW,
      summary: `Reject Media candidate “${this.previewText(candidate.title, 110)}”`,
      preview: {
        Candidate: candidate.title,
        RepetitionRisk: candidate.repetitionRisk,
        Reason: reason ?? 'Not a fit',
        MemoryEffect: 'Remember this rejection to reduce future repetition',
      },
      payload: { runId, candidateKey, ...(reason ? { reason } : {}) },
    });
  }

  async proposeMediaProductionGenerate(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const publicationId = this.requiredString(args, 'publicationId', 64);
    if (!Types.ObjectId.isValid(publicationId)) {
      throw new BadRequestException(
        'publicationId must be a valid Media publication ID.',
      );
    }
    const pack = await this.mediaProductionService.getPack(publicationId);
    const instructions = this.optionalString(args, 'instructions', 1600);
    const force = Boolean(args.force);

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_PRODUCTION_GENERATE,
      risk: HsakaaActionRisk.LOW,
      summary: `Prepare production pack for “${this.previewText(
        pack.publication.title || pack.contentItem.title,
        110,
      )}”`,
      preview: {
        Content: pack.contentItem.title,
        Platform: pack.publication.platform,
        Format: pack.publication.format,
        CurrentProductionStatus: pack.publication.productionStatus,
        ExistingProductionVersion: pack.publication.productionVersion ?? 0,
        ForceRegenerate: force,
        Instructions: instructions ?? 'Use the approved publication as-is',
        Result:
          'Generate scripts, shot/design direction, asset requirements and production readiness. Will not schedule or publish.',
      },
      payload: {
        publicationId,
        ...(instructions ? { instructions } : {}),
        force,
      },
    });
  }

  async proposeMediaPublicationSchedule(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const publicationId = this.requiredString(args, 'publicationId', 64);
    if (!Types.ObjectId.isValid(publicationId)) {
      throw new BadRequestException(
        'publicationId must be a valid Media publication ID.',
      );
    }
    const slotId = this.optionalString(args, 'slotId', 64);
    const scheduledAt = this.optionalString(args, 'scheduledAt', 80);
    if (!slotId && !scheduledAt) {
      throw new BadRequestException('slotId or scheduledAt is required.');
    }
    if (slotId && !Types.ObjectId.isValid(slotId)) {
      throw new BadRequestException(
        'slotId must be a valid Media calendar slot ID.',
      );
    }
    const pack = await this.mediaProductionService.getPack(publicationId);
    if (!pack.readiness.ready && !pack.readiness.complete) {
      throw new BadRequestException(
        'The publication is not production-ready yet.',
      );
    }
    const autoPublish = args.autoPublish === true;
    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_PUBLICATION_SCHEDULE,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Schedule “${this.previewText(pack.publication.title || pack.contentItem.title, 110)}”`,
      preview: {
        Content: pack.contentItem.title,
        Platform: pack.publication.platform,
        Format: pack.publication.format,
        SlotId: slotId ?? null,
        ScheduledAt: scheduledAt ?? 'Use selected calendar slot',
        AutoPublish: autoPublish,
        ConfirmationBoundary:
          'Nothing is scheduled until this action is confirmed.',
      },
      payload: {
        publicationId,
        ...(slotId ? { slotId } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        autoPublish,
      },
    });
  }

  async proposeMediaPublicationPublish(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const publicationId = this.requiredString(args, 'publicationId', 64);
    if (!Types.ObjectId.isValid(publicationId)) {
      throw new BadRequestException(
        'publicationId must be a valid Media publication ID.',
      );
    }
    const pack = await this.mediaProductionService.getPack(publicationId);
    if (!pack.readiness.ready && !pack.readiness.complete) {
      throw new BadRequestException(
        'The publication is not production-ready yet.',
      );
    }
    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_PUBLICATION_PUBLISH,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Publish “${this.previewText(pack.publication.title || pack.contentItem.title, 110)}” now`,
      preview: {
        Content: pack.contentItem.title,
        Platform: pack.publication.platform,
        Format: pack.publication.format,
        Delivery:
          'Publish now when API-capable; otherwise move to the manual-publish queue.',
        ConfirmationBoundary:
          'No external publish happens until this action is confirmed.',
      },
      payload: { publicationId },
    });
  }

  async proposeMediaEngagementReply(
    context: ProposalContext,
    args: RawArguments,
  ): Promise<HsakaaClientAction> {
    const engagementId = this.requiredString(args, 'engagementId', 64);
    if (!Types.ObjectId.isValid(engagementId)) {
      throw new BadRequestException(
        'engagementId must be a valid Media engagement item ID.',
      );
    }
    const item = await this.mediaEngagementService.getItem(engagementId);
    const reply =
      this.optionalString(args, 'text', 10000) ?? item.suggestedReply?.trim();
    if (!reply) {
      throw new BadRequestException(
        'A reply is required. Draft one first or provide reply text.',
      );
    }
    if (!item.canReply) {
      throw new BadRequestException(
        item.replyRestriction ||
          'This engagement cannot be replied to automatically.',
      );
    }

    return this.createProposal(context, {
      actionType: HsakaaActionType.MEDIA_ENGAGEMENT_REPLY,
      risk: HsakaaActionRisk.MEDIUM,
      summary: `Reply to ${item.platform} engagement from ${
        item.authorUsername || item.authorDisplayName || 'audience member'
      }`,
      preview: {
        Platform: item.platform,
        From: item.authorUsername || item.authorDisplayName || null,
        Incoming: this.previewText(item.text, 240),
        Reply: this.previewText(reply, 500),
        ConfirmationBoundary:
          'No public comment or message is sent until this action is confirmed.',
      },
      payload: { engagementId, text: reply },
    });
  }

  async confirm(actionId: string, confirmationToken: string) {
    const action = await this.getActionWithToken(actionId);

    this.assertToken(action, confirmationToken);

    if (action.status === HsakaaActionStatus.EXECUTED) {
      return {
        action: this.toPublicAction(action),
        message: this.executionMessage(action),
        alreadyExecuted: true,
      };
    }
    await this.assertPendingAndFresh(action);

    const claimed = await this.actionModel.findOneAndUpdate(
      {
        _id: action._id,
        status: HsakaaActionStatus.PENDING,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: HsakaaActionStatus.EXECUTING,
          confirmedAt: new Date(),
          error: undefined,
        },
      },
      { new: true },
    );

    if (!claimed) {
      const latest = await this.actionModel
        .findById(action._id)
        .select('+confirmationTokenHash');

      if (latest?.status === HsakaaActionStatus.EXECUTED) {
        return {
          action: this.toPublicAction(latest),
          message: this.executionMessage(latest),
          alreadyExecuted: true,
        };
      }

      throw new ConflictException(
        'This proposed action is no longer available for confirmation.',
      );
    }

    try {
      const result = await this.execute(claimed);
      claimed.status = HsakaaActionStatus.EXECUTED;
      claimed.executedAt = new Date();
      claimed.result = result;
      claimed.error = undefined;
      await claimed.save();

      const message = this.executionMessage(claimed);
      await this.appendActionMessage(claimed, message);

      return {
        action: this.toPublicAction(claimed),
        message,
        alreadyExecuted: false,
      };
    } catch (error) {
      claimed.status = HsakaaActionStatus.FAILED;
      claimed.error =
        error instanceof Error
          ? error.message.slice(0, 2000)
          : 'Action execution failed.';
      await claimed.save();
      throw error;
    }
  }

  async reject(actionId: string, confirmationToken: string) {
    const action = await this.getActionWithToken(actionId);
    this.assertToken(action, confirmationToken);

    if (action.status === HsakaaActionStatus.REJECTED) {
      return {
        action: this.toPublicAction(action),
        message: `Cancelled: ${action.summary}.`,
      };
    }

    await this.assertPendingAndFresh(action);

    const rejected = await this.actionModel.findOneAndUpdate(
      {
        _id: action._id,
        status: HsakaaActionStatus.PENDING,
      },
      {
        $set: {
          status: HsakaaActionStatus.REJECTED,
          rejectedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!rejected) {
      throw new ConflictException('This proposed action is no longer pending.');
    }

    const message = `Cancelled: ${rejected.summary}.`;
    await this.appendActionMessage(rejected, message);

    return {
      action: this.toPublicAction(rejected),
      message,
    };
  }

  private async createProposal(
    context: ProposalContext,
    input: {
      actionType: HsakaaActionType;
      risk: HsakaaActionRisk;
      summary: string;
      preview: Record<string, unknown>;
      payload: Record<string, unknown>;
      targetTaskId?: string;
      targetBrainDumpId?: string;
      targetJournalEntryId?: string;
      targetMemoryId?: string;
      targetReminderId?: string;
      targetDecisionId?: string;
    },
  ): Promise<HsakaaClientAction> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.confirmationTtlMinutes * 60_000,
    );

    const action = await this.actionModel.create({
      conversationId: new Types.ObjectId(context.conversationId),
      requestId: context.requestId,
      actionType: input.actionType,
      status: HsakaaActionStatus.PENDING,
      risk: input.risk,
      summary: input.summary,
      preview: input.preview,
      payload: input.payload,
      targetTaskId: input.targetTaskId
        ? new Types.ObjectId(input.targetTaskId)
        : undefined,
      targetBrainDumpId: input.targetBrainDumpId
        ? new Types.ObjectId(input.targetBrainDumpId)
        : undefined,
      targetJournalEntryId: input.targetJournalEntryId
        ? new Types.ObjectId(input.targetJournalEntryId)
        : undefined,
      targetMemoryId: input.targetMemoryId
        ? new Types.ObjectId(input.targetMemoryId)
        : undefined,
      targetReminderId: input.targetReminderId
        ? new Types.ObjectId(input.targetReminderId)
        : undefined,
      targetDecisionId: input.targetDecisionId
        ? new Types.ObjectId(input.targetDecisionId)
        : undefined,
      confirmationTokenHash: this.hashToken(rawToken),
      expiresAt,
    });

    return {
      ...this.toPublicAction(action),
      confirmationToken: rawToken,
    };
  }

  private async proposeSimpleTaskAction(
    context: ProposalContext,
    args: RawArguments,
    actionType: HsakaaActionType,
    verb: string,
    risk: HsakaaActionRisk,
  ) {
    const taskId = this.requiredTaskId(args);
    const task = await this.tasksService.findOne(taskId);

    return this.createProposal(context, {
      actionType,
      risk,
      summary: `${verb} task “${task.title}”`,
      preview: {
        Task: task.title,
        CurrentStatus: this.humanStatus(task.status),
        Action: verb,
      },
      payload: { taskId },
      targetTaskId: taskId,
    });
  }

  private createBrainDumpStateProposal(
    context: ProposalContext,
    item: { title?: string; content: string; status: BrainDumpStatus },
    brainDumpId: string,
    actionType: HsakaaActionType,
    verb: string,
    risk: HsakaaActionRisk,
  ) {
    const label = item.title ?? this.previewText(item.content, 120);

    return this.createProposal(context, {
      actionType,
      risk,
      summary: `${verb} Brain Dump “${label}”`,
      preview: {
        BrainDump: label,
        CurrentStatus: item.status,
        Action: verb,
      },
      payload: { brainDumpId },
      targetBrainDumpId: brainDumpId,
    });
  }

  private async proposeSimpleJournalAction(
    context: ProposalContext,
    args: RawArguments,
    actionType: HsakaaActionType,
    verb: string,
    risk: HsakaaActionRisk,
  ) {
    const journalEntryId = this.requiredJournalEntryId(args);
    const entry = await this.journalService.findById(journalEntryId);

    return this.createProposal(context, {
      actionType,
      risk,
      summary: `${verb} journal entry “${entry.title}”`,
      preview: {
        Journal: entry.title,
        Action: verb,
      },
      payload: { journalEntryId },
      targetJournalEntryId: journalEntryId,
    });
  }

  private async proposeSimpleMemoryAction(
    context: ProposalContext,
    args: RawArguments,
    actionType: HsakaaActionType,
    verb: string,
    risk: HsakaaActionRisk,
  ) {
    const memoryId = this.requiredMemoryId(args);
    const memory = await this.memoryService.findOne(memoryId);

    return this.createProposal(context, {
      actionType,
      risk,
      summary: `${verb} memory “${this.previewText(memory.content, 100)}”`,
      preview: {
        Memory: this.previewText(memory.content, 220),
        Action: verb,
      },
      payload: { memoryId },
      targetMemoryId: memoryId,
    });
  }

  private async proposeSimpleReminderAction(
    context: ProposalContext,
    args: RawArguments,
    actionType: HsakaaActionType,
    verb: string,
    risk: HsakaaActionRisk,
  ) {
    const reminderId = this.requiredReminderId(args);
    const reminder = await this.remindersService.findOne(reminderId);

    return this.createProposal(context, {
      actionType,
      risk,
      summary: `${verb} reminder “${reminder.title}”`,
      preview: {
        Reminder: reminder.title,
        CurrentStatus: reminder.status,
        ScheduledFor:
          reminder.scheduledFor instanceof Date
            ? reminder.scheduledFor.toISOString()
            : reminder.scheduledFor,
        Action: verb,
      },
      payload: { reminderId },
      targetReminderId: reminderId,
    });
  }

  private async execute(action: HsakaaActionDocument) {
    const payload = action.payload ?? {};

    switch (action.actionType) {
      case HsakaaActionType.TASK_CREATE: {
        const createPayload = {
          ...payload,
          source: TaskSource.HSAKAA,
          sourceExternalId: `hsakaa-action:${action._id.toString()}`,
          metadata: {
            ...(this.isRecord(payload.metadata) ? payload.metadata : {}),
            hsakaaActionId: action._id.toString(),
            hsakaaConversationId: action.conversationId.toString(),
          },
        };
        const task = await this.tasksService.create(createPayload as never);
        return this.taskResult(task);
      }

      case HsakaaActionType.TASK_UPDATE: {
        const taskId = this.payloadString(payload, 'taskId');
        const updates = this.isRecord(payload.updates) ? payload.updates : {};
        const task = await this.tasksService.update(taskId, updates);
        return this.taskResult(task);
      }

      case HsakaaActionType.TASK_STATUS: {
        const taskId = this.payloadString(payload, 'taskId');
        const status = this.payloadString(payload, 'status') as TaskStatus;
        const result = await this.tasksService.updateStatus(taskId, status);
        return this.taskResult(result.task);
      }

      case HsakaaActionType.TASK_COMPLETE: {
        const result = await this.tasksService.complete(
          this.payloadString(payload, 'taskId'),
        );
        return this.taskResult(result.task);
      }

      case HsakaaActionType.TASK_REOPEN: {
        const result = await this.tasksService.reopen(
          this.payloadString(payload, 'taskId'),
        );
        return this.taskResult(result.task);
      }

      case HsakaaActionType.TASK_ARCHIVE: {
        const task = await this.tasksService.archive(
          this.payloadString(payload, 'taskId'),
        );
        return this.taskResult(task);
      }

      case HsakaaActionType.BRAIN_DUMP_CREATE: {
        const createPayload = {
          ...payload,
          source: BrainDumpSource.HSAKAA,
          metadata: {
            ...(this.isRecord(payload.metadata) ? payload.metadata : {}),
            hsakaaActionId: action._id.toString(),
            hsakaaConversationId: action.conversationId.toString(),
          },
        };
        const brainDump = await this.brainDumpService.create(
          createPayload as never,
        );
        return this.brainDumpResult(brainDump);
      }

      case HsakaaActionType.BRAIN_DUMP_PROCESS: {
        const brainDumpId = this.payloadString(payload, 'brainDumpId');
        const processPayload = { ...payload };
        delete processPayload.brainDumpId;
        const result = await this.brainDumpService.process(
          brainDumpId,
          processPayload as never,
        );
        return {
          brainDump: this.brainDumpResult(result.brainDump),
          target: processPayload.target,
          created: this.entityResult(result.created),
        };
      }

      case HsakaaActionType.BRAIN_DUMP_DISCARD: {
        const item = await this.brainDumpService.discard(
          this.payloadString(payload, 'brainDumpId'),
        );
        return this.brainDumpResult(item);
      }

      case HsakaaActionType.BRAIN_DUMP_REOPEN: {
        const item = await this.brainDumpService.reopen(
          this.payloadString(payload, 'brainDumpId'),
        );
        return this.brainDumpResult(item);
      }

      case HsakaaActionType.BRAIN_DUMP_ARCHIVE: {
        const item = await this.brainDumpService.archive(
          this.payloadString(payload, 'brainDumpId'),
        );
        return this.brainDumpResult(item);
      }

      case HsakaaActionType.JOURNAL_CREATE: {
        const createPayload = {
          ...payload,
          visibility: JournalVisibility.PRIVATE,
          isPublished: false,
          source: JournalSource.HSAKAA,
          sourceExternalId: `hsakaa-action:${action._id.toString()}`,
          metadata: {
            ...(this.isRecord(payload.metadata) ? payload.metadata : {}),
            hsakaaActionId: action._id.toString(),
            hsakaaConversationId: action.conversationId.toString(),
          },
        };
        const entry = await this.journalService.create(createPayload as never);
        return this.journalResult(entry);
      }

      case HsakaaActionType.JOURNAL_UPDATE: {
        const journalEntryId = this.payloadString(payload, 'journalEntryId');
        const updates = this.isRecord(payload.updates) ? payload.updates : {};
        const entry = await this.journalService.update(journalEntryId, updates);
        return this.journalResult(entry);
      }

      case HsakaaActionType.JOURNAL_APPEND: {
        const journalEntryId = this.payloadString(payload, 'journalEntryId');
        const content = this.payloadString(payload, 'content');
        const current = await this.journalService.findById(journalEntryId);
        const existing =
          typeof current.content === 'string' ? current.content.trim() : '';
        const nextContent = existing ? `${existing}\n\n${content}` : content;
        const entry = await this.journalService.update(journalEntryId, {
          content: nextContent,
        });
        return this.journalResult(entry);
      }

      case HsakaaActionType.JOURNAL_ARCHIVE: {
        const entry = await this.journalService.archive(
          this.payloadString(payload, 'journalEntryId'),
        );
        return this.journalResult(entry);
      }

      case HsakaaActionType.JOURNAL_RESTORE: {
        const entry = await this.journalService.restore(
          this.payloadString(payload, 'journalEntryId'),
        );
        return this.journalResult(entry);
      }

      case HsakaaActionType.MEMORY_CREATE: {
        const createPayload = {
          ...payload,
          source: MemorySource.CHAT,
          verificationStatus: MemoryVerificationStatus.CONFIRMED,
          accessLevel: payload.accessLevel ?? MemoryAccessLevel.OWNER_ONLY,
          sensitivity: payload.sensitivity ?? MemorySensitivity.NORMAL,
          sourceReference: {
            ...(this.isRecord(payload.sourceReference)
              ? payload.sourceReference
              : {}),
            entityType: 'hsakaa_action',
            externalId: action._id.toString(),
          },
        };
        const memory = await this.memoryService.create(createPayload as never);
        return this.memoryResult(memory);
      }

      case HsakaaActionType.MEMORY_UPDATE: {
        const memoryId = this.payloadString(payload, 'memoryId');
        const updates = this.isRecord(payload.updates) ? payload.updates : {};
        const memory = await this.memoryService.update(memoryId, updates);
        return this.memoryResult(memory);
      }

      case HsakaaActionType.MEMORY_ARCHIVE: {
        const memory = await this.memoryService.archive(
          this.payloadString(payload, 'memoryId'),
        );
        return this.memoryResult(memory);
      }

      case HsakaaActionType.MEMORY_RESTORE: {
        const memory = await this.memoryService.restore(
          this.payloadString(payload, 'memoryId'),
        );
        return this.memoryResult(memory);
      }

      case HsakaaActionType.REMINDER_CREATE: {
        const createPayload = {
          ...payload,
          source: TaskSource.HSAKAA,
          sourceExternalId: `hsakaa-reminder-action:${action._id.toString()}`,
          metadata: {
            ...(this.isRecord(payload.metadata) ? payload.metadata : {}),
            hsakaaActionId: action._id.toString(),
            hsakaaConversationId: action.conversationId.toString(),
            reminderOnly: true,
          },
        };
        const task = await this.tasksService.create(createPayload as never);
        const sync = await this.syncReminders(14);
        return {
          task: this.taskResult(task),
          reminderAt: payload.reminderAt,
          sync,
        };
      }

      case HsakaaActionType.REMINDER_SYNC: {
        const rawDays = payload.days;
        const days =
          typeof rawDays === 'number' && Number.isFinite(rawDays)
            ? Math.min(Math.max(Math.trunc(rawDays), 1), 14)
            : 2;
        return this.syncReminders(days);
      }

      case HsakaaActionType.REMINDER_SNOOZE: {
        const reminder = await this.remindersService.snooze(
          this.payloadString(payload, 'reminderId'),
          {
            ...(typeof payload.minutes === 'number'
              ? { minutes: payload.minutes }
              : {}),
            ...(typeof payload.until === 'string'
              ? { until: payload.until }
              : {}),
          },
        );
        return this.reminderResult(reminder);
      }

      case HsakaaActionType.REMINDER_ACKNOWLEDGE: {
        const reminder = await this.remindersService.acknowledge(
          this.payloadString(payload, 'reminderId'),
        );
        return this.reminderResult(reminder);
      }

      case HsakaaActionType.REMINDER_DISMISS: {
        const reminder = await this.remindersService.dismiss(
          this.payloadString(payload, 'reminderId'),
        );
        return this.reminderResult(reminder);
      }

      case HsakaaActionType.REMINDER_REOPEN: {
        const reminder = await this.remindersService.reopen(
          this.payloadString(payload, 'reminderId'),
        );
        return this.reminderResult(reminder);
      }

      case HsakaaActionType.DECISION_EXPERIMENT_CREATE: {
        const decisionId = this.payloadString(payload, 'decisionId');
        const createPayload = { ...payload };
        delete createPayload.decisionId;
        const result = await this.decisionExperimentService.createExperiment(
          decisionId,
          createPayload as never,
        );
        return { ...result };
      }

      case HsakaaActionType.DECISION_EVIDENCE_ADD: {
        const decisionId = this.payloadString(payload, 'decisionId');
        const evidencePayload = { ...payload };
        delete evidencePayload.decisionId;
        const result = await this.decisionExperimentService.addEvidence(
          decisionId,
          evidencePayload as never,
        );
        return { ...result };
      }

      case HsakaaActionType.DECISION_EXPERIMENT_COMPLETE: {
        const decisionId = this.payloadString(payload, 'decisionId');
        const experimentId = this.payloadString(payload, 'experimentId');
        const completePayload = { ...payload };
        delete completePayload.decisionId;
        delete completePayload.experimentId;
        const result = await this.decisionExperimentService.completeExperiment(
          decisionId,
          experimentId,
          completePayload as never,
        );
        return { ...result };
      }

      case HsakaaActionType.MEDIA_CANDIDATE_ACCEPT: {
        const runId = this.payloadString(payload, 'runId');
        const candidateKey = this.payloadString(payload, 'candidateKey');
        const rawPlatforms = Array.isArray(payload.platforms)
          ? payload.platforms.filter(
              (value): value is MediaPlatform =>
                typeof value === 'string' &&
                Object.values(MediaPlatform).includes(value as MediaPlatform),
            )
          : undefined;
        const result = await this.mediaContentDirectorService.acceptCandidate(
          runId,
          candidateKey,
          rawPlatforms?.length ? { platforms: rawPlatforms } : {},
        );
        return {
          contentItemId: result.contentItem?._id?.toString(),
          title: result.contentItem?.title,
          publicationIds: result.publications.map((item) =>
            item._id.toString(),
          ),
          platforms: result.publications.map((item) => item.platform),
          alreadyAccepted: result.alreadyAccepted,
        };
      }

      case HsakaaActionType.MEDIA_CANDIDATE_REJECT: {
        const result = await this.mediaContentDirectorService.rejectCandidate(
          this.payloadString(payload, 'runId'),
          this.payloadString(payload, 'candidateKey'),
          typeof payload.reason === 'string' ? { reason: payload.reason } : {},
        );
        return {
          candidateKey: this.payloadString(payload, 'candidateKey'),
          status: result.candidate?.status ?? 'rejected',
          alreadyRejected: result.alreadyRejected,
        };
      }

      case HsakaaActionType.MEDIA_PRODUCTION_GENERATE: {
        const result = await this.mediaProductionService.generate(
          this.payloadString(payload, 'publicationId'),
          {
            ...(typeof payload.instructions === 'string'
              ? { instructions: payload.instructions }
              : {}),
            force: payload.force === true,
          },
        );
        return {
          publicationId: result.publication._id.toString(),
          productionStatus: result.publication.productionStatus,
          productionVersion: result.publication.productionVersion,
          requiredAssets: result.readiness.requiredAssets,
          readyAssets: result.readiness.readyAssets,
          ready: result.readiness.ready,
          alreadyGenerated: result.alreadyGenerated,
        };
      }

      case HsakaaActionType.MEDIA_PUBLICATION_SCHEDULE: {
        const publication = await this.mediaCalendarService.schedulePublication(
          this.payloadString(payload, 'publicationId'),
          {
            ...(typeof payload.slotId === 'string'
              ? { slotId: payload.slotId }
              : {}),
            ...(typeof payload.scheduledAt === 'string'
              ? { scheduledAt: payload.scheduledAt }
              : {}),
            autoPublish: payload.autoPublish === true,
          },
        );
        return {
          publicationId: publication._id.toString(),
          scheduledAt: publication.scheduledAt?.toISOString(),
          autoPublish: publication.autoPublish,
          deliveryStatus: publication.deliveryStatus,
        };
      }

      case HsakaaActionType.MEDIA_PUBLICATION_PUBLISH: {
        const publication = await this.mediaCalendarService.publishNow(
          this.payloadString(payload, 'publicationId'),
        );
        return {
          publicationId: publication._id.toString(),
          status: publication.status,
          deliveryStatus: publication.deliveryStatus,
          publishedAt: publication.publishedAt?.toISOString(),
          externalPostUrl: publication.externalPostUrl,
          lastPublishError: publication.lastPublishError,
        };
      }

      case HsakaaActionType.MEDIA_ENGAGEMENT_REPLY: {
        const item = await this.mediaEngagementService.sendReply(
          this.payloadString(payload, 'engagementId'),
          this.payloadString(payload, 'text'),
        );
        return {
          engagementId: item._id.toString(),
          platform: item.platform,
          status: item.status,
          repliedAt: item.repliedAt?.toISOString(),
          replyExternalId: item.replyExternalId,
        };
      }

      case HsakaaActionType.DECISION_REASSESS: {
        const decisionId = this.payloadString(payload, 'decisionId');
        const result = await this.decisionExperimentService.reassess(
          decisionId,
          {
            reason: typeof payload.reason === 'string' ? payload.reason : '',
            force: true,
          },
        );
        return { ...result };
      }

      default:
        throw new BadRequestException('Unsupported HSAKAA action type.');
    }
  }

  private async getActionWithToken(actionId: string) {
    if (!Types.ObjectId.isValid(actionId)) {
      throw new BadRequestException('Invalid HSAKAA action ID.');
    }

    const action = await this.actionModel
      .findById(actionId)
      .select('+confirmationTokenHash');

    if (!action) {
      throw new NotFoundException('Proposed HSAKAA action not found.');
    }

    return action;
  }

  private async assertPendingAndFresh(action: HsakaaActionDocument) {
    if (action.expiresAt.getTime() <= Date.now()) {
      if (action.status === HsakaaActionStatus.PENDING) {
        action.status = HsakaaActionStatus.EXPIRED;
        await action.save();
      }
      throw new ConflictException(
        'This proposed action has expired. Ask HSAKAA to propose it again.',
      );
    }

    if (action.status !== HsakaaActionStatus.PENDING) {
      throw new ConflictException(
        `This proposed action is ${action.status} and cannot be changed.`,
      );
    }
  }

  private assertToken(action: HsakaaActionDocument, rawToken: string) {
    const expected = Buffer.from(action.confirmationTokenHash, 'hex');
    const actual = Buffer.from(this.hashToken(rawToken), 'hex');

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new ConflictException('Invalid action confirmation token.');
    }
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private toPublicAction(action: HsakaaActionDocument) {
    return {
      id: action._id.toString(),
      type: action.actionType,
      status: action.status,
      risk: action.risk,
      summary: action.summary,
      preview: action.preview ?? {},
      expiresAt: action.expiresAt.toISOString(),
      result: action.result ?? null,
      error: action.error ?? null,
    };
  }

  private taskResult(task: unknown) {
    const candidate = task as {
      toObject?: () => Record<string, unknown>;
    };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(task)
          ? task
          : {};

    return {
      id: this.idString(raw._id),
      title: raw.title,
      status: raw.status,
      priority: raw.priority,
      dueAt: raw.dueAt,
      isArchived: raw.isArchived,
    };
  }

  private brainDumpResult(item: unknown) {
    const candidate = item as {
      toObject?: () => Record<string, unknown>;
    };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(item)
          ? item
          : {};

    return {
      id: this.idString(raw._id),
      title: raw.title,
      content:
        typeof raw.content === 'string'
          ? this.previewText(raw.content, 240)
          : undefined,
      status: raw.status,
      processedAs: raw.processedAs,
      processedEntityId: this.idString(raw.processedEntityId),
      isArchived: raw.isArchived,
    };
  }

  private entityResult(entity: unknown) {
    const candidate = entity as {
      toObject?: () => Record<string, unknown>;
    };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(entity)
          ? entity
          : {};

    return {
      id: this.idString(raw._id ?? raw.id),
      title: raw.title,
      type: raw.type,
      status: raw.status,
    };
  }

  private journalResult(entry: unknown) {
    const candidate = entry as { toObject?: () => Record<string, unknown> };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(entry)
          ? entry
          : {};

    return {
      id: this.idString(raw._id),
      title: raw.title,
      type: raw.type,
      date: raw.date,
      isArchived: raw.isArchived,
      isPublished: raw.isPublished,
      visibility: raw.visibility,
    };
  }

  private memoryResult(memory: unknown) {
    const candidate = memory as { toObject?: () => Record<string, unknown> };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(memory)
          ? memory
          : {};

    return {
      id: this.idString(raw._id),
      content:
        typeof raw.content === 'string'
          ? this.previewText(raw.content, 240)
          : undefined,
      type: raw.type,
      accessLevel: raw.accessLevel,
      sensitivity: raw.sensitivity,
      verificationStatus: raw.verificationStatus,
      isArchived: raw.isArchived,
    };
  }

  private async syncReminders(days: number): Promise<Record<string, unknown>> {
    const result: unknown = await this.remindersService.syncUpcoming(days);
    return this.isRecord(result) ? result : { result };
  }

  private reminderResult(reminder: unknown) {
    const candidate = reminder as {
      toObject?: () => Record<string, unknown>;
    };
    const raw =
      typeof candidate?.toObject === 'function'
        ? candidate.toObject()
        : this.isRecord(reminder)
          ? reminder
          : {};

    return {
      id: this.idString(raw._id),
      title: raw.title,
      status: raw.status,
      sourceType: raw.sourceType,
      scheduledFor:
        raw.scheduledFor instanceof Date
          ? raw.scheduledFor.toISOString()
          : raw.scheduledFor,
      snoozedUntil:
        raw.snoozedUntil instanceof Date
          ? raw.snoozedUntil.toISOString()
          : raw.snoozedUntil,
      isActive: raw.isActive,
    };
  }

  private executionMessage(action: HsakaaActionDocument) {
    const taskTitle =
      this.isRecord(action.result) && typeof action.result.title === 'string'
        ? action.result.title
        : undefined;

    switch (action.actionType) {
      case HsakaaActionType.TASK_CREATE:
        return taskTitle ? `Created task “${taskTitle}”.` : 'Task created.';
      case HsakaaActionType.TASK_UPDATE:
        return taskTitle ? `Updated task “${taskTitle}”.` : 'Task updated.';
      case HsakaaActionType.TASK_STATUS:
        return taskTitle
          ? `Updated the status of “${taskTitle}”.`
          : 'Task status updated.';
      case HsakaaActionType.TASK_COMPLETE:
        return taskTitle ? `Completed task “${taskTitle}”.` : 'Task completed.';
      case HsakaaActionType.TASK_REOPEN:
        return taskTitle ? `Reopened task “${taskTitle}”.` : 'Task reopened.';
      case HsakaaActionType.TASK_ARCHIVE:
        return taskTitle ? `Archived task “${taskTitle}”.` : 'Task archived.';
      case HsakaaActionType.BRAIN_DUMP_CREATE:
        return 'Captured the Brain Dump item.';
      case HsakaaActionType.BRAIN_DUMP_PROCESS: {
        const target =
          this.isRecord(action.result) &&
          typeof action.result.target === 'string'
            ? action.result.target
            : 'selected destination';
        return `Processed the Brain Dump item into ${target}.`;
      }
      case HsakaaActionType.BRAIN_DUMP_DISCARD:
        return 'Discarded the Brain Dump item.';
      case HsakaaActionType.BRAIN_DUMP_REOPEN:
        return 'Reopened the Brain Dump item.';
      case HsakaaActionType.BRAIN_DUMP_ARCHIVE:
        return 'Archived the Brain Dump item.';

      case HsakaaActionType.JOURNAL_CREATE:
        return 'Created the private journal entry.';
      case HsakaaActionType.JOURNAL_UPDATE:
        return 'Updated the journal entry.';
      case HsakaaActionType.JOURNAL_APPEND:
        return 'Appended to the journal entry.';
      case HsakaaActionType.JOURNAL_ARCHIVE:
        return 'Archived the journal entry.';
      case HsakaaActionType.JOURNAL_RESTORE:
        return 'Restored the journal entry.';
      case HsakaaActionType.MEMORY_CREATE:
        return 'Saved the memory.';
      case HsakaaActionType.MEMORY_UPDATE:
        return 'Updated the memory.';
      case HsakaaActionType.MEMORY_ARCHIVE:
        return 'Archived the memory.';
      case HsakaaActionType.MEMORY_RESTORE:
        return 'Restored the memory.';
      case HsakaaActionType.REMINDER_CREATE:
        return 'Created the task-backed reminder.';
      case HsakaaActionType.REMINDER_SYNC:
        return 'Synced Personal OS reminders.';
      case HsakaaActionType.REMINDER_SNOOZE:
        return 'Snoozed the reminder.';
      case HsakaaActionType.REMINDER_ACKNOWLEDGE:
        return 'Acknowledged the reminder.';
      case HsakaaActionType.REMINDER_DISMISS:
        return 'Dismissed the reminder.';
      case HsakaaActionType.REMINDER_REOPEN:
        return 'Reopened the reminder.';
      case HsakaaActionType.DECISION_EXPERIMENT_CREATE:
        return 'Created the decision experiment.';
      case HsakaaActionType.DECISION_EVIDENCE_ADD:
        return 'Added the decision evidence.';
      case HsakaaActionType.DECISION_EXPERIMENT_COMPLETE:
        return 'Completed the decision experiment.';
      case HsakaaActionType.DECISION_REASSESS:
        return 'Created a new decision reassessment snapshot.';
      case HsakaaActionType.MEDIA_CANDIDATE_ACCEPT:
        return 'Accepted the Media candidate into canonical content and draft platform executions.';
      case HsakaaActionType.MEDIA_CANDIDATE_REJECT:
        return 'Rejected the Media candidate and saved that rejection to content memory.';
      case HsakaaActionType.MEDIA_PRODUCTION_GENERATE:
        return 'Prepared the Media production pack. Nothing was scheduled or published.';
      case HsakaaActionType.MEDIA_PUBLICATION_SCHEDULE:
        return 'Scheduled the Media publication using the approved calendar decision.';
      case HsakaaActionType.MEDIA_PUBLICATION_PUBLISH:
        return 'Ran the approved Media publish action or moved it to the manual-publish queue.';
      case HsakaaActionType.MEDIA_ENGAGEMENT_REPLY:
        return 'Sent the approved Media engagement reply.';
      default:
        return 'Confirmed action executed.';
    }
  }

  private async appendActionMessage(
    action: HsakaaActionDocument,
    content: string,
  ) {
    await this.chatService.appendMessage({
      conversationId: action.conversationId,
      role: MessageRole.ASSISTANT,
      content,
      metadata: {
        scope: 'private',
        actionId: action._id.toString(),
        actionType: action.actionType,
        actionStatus: action.status,
      },
    });
  }

  private cleanTaskWritePayload(
    args: RawArguments,
    options: {
      includeTitle: boolean;
      includeStatus: boolean;
      excludeTaskId?: boolean;
    },
  ) {
    const payload: Record<string, unknown> = {};

    if (options.includeTitle && typeof args.title === 'string') {
      const title = args.title.trim();
      if (title) payload.title = title.slice(0, 200);
    }

    for (const key of ['description', 'area', 'notes'] as const) {
      if (typeof args[key] === 'string') {
        payload[key] = args[key].trim();
      }
    }

    if (typeof args.priority === 'string') {
      payload.priority = this.requiredEnum(
        args,
        'priority',
        Object.values(TaskPriority),
      );
    }

    if (options.includeStatus && typeof args.status === 'string') {
      payload.status = this.requiredEnum(
        args,
        'status',
        Object.values(TaskStatus),
      );
    }

    for (const key of ['startAt', 'dueAt', 'reminderAt'] as const) {
      if (typeof args[key] === 'string' && args[key].trim()) {
        const value = args[key].trim();
        if (Number.isNaN(Date.parse(value))) {
          throw new BadRequestException(`${key} must be a valid ISO date.`);
        }
        payload[key] = value;
      }
    }

    if (typeof args.estimatedMinutes === 'number') {
      payload.estimatedMinutes = Math.max(
        0,
        Math.min(Math.trunc(args.estimatedMinutes), 100000),
      );
    }

    if (Array.isArray(args.tags)) {
      payload.tags = args.tags
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20);
    }

    if (!options.excludeTaskId && typeof args.taskId === 'string') {
      payload.taskId = args.taskId;
    }

    return payload;
  }

  private taskCreatePreview(payload: Record<string, unknown>) {
    return {
      Title: payload.title,
      Status: this.humanStatus(
        typeof payload.status === 'string' ? payload.status : TaskStatus.TODO,
      ),
      Priority: payload.priority ?? TaskPriority.MEDIUM,
      Area: payload.area ?? null,
      Due: payload.dueAt ?? null,
      Reminder: payload.reminderAt ?? null,
      EstimateMinutes: payload.estimatedMinutes ?? null,
      Tags: payload.tags ?? [],
    };
  }

  private humanizeTaskChanges(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    const labels: Record<string, string> = {
      title: 'Title',
      description: 'Description',
      priority: 'Priority',
      area: 'Area',
      startAt: 'Start',
      dueAt: 'Due',
      reminderAt: 'Reminder',
      estimatedMinutes: 'EstimateMinutes',
      tags: 'Tags',
      notes: 'Notes',
    };

    for (const [key, value] of Object.entries(payload)) {
      result[labels[key] ?? key] = value;
    }

    return result;
  }

  private cleanBrainDumpCreatePayload(args: RawArguments) {
    const payload: Record<string, unknown> = {};

    if (typeof args.title === 'string' && args.title.trim()) {
      payload.title = args.title.trim().slice(0, 220);
    }
    if (Array.isArray(args.tags)) {
      payload.tags = this.cleanStringArray(args.tags, 30);
    }
    if (Array.isArray(args.categories)) {
      payload.categories = this.cleanStringArray(args.categories, 20);
    }
    if (Array.isArray(args.entities)) {
      payload.entities = args.entities
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => {
          const type =
            typeof item.type === 'string' &&
            Object.values(MemoryEntityType).includes(
              item.type as MemoryEntityType,
            )
              ? (item.type as MemoryEntityType)
              : undefined;
          const name =
            typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : undefined;
          if (!type || !name) return null;
          return {
            type,
            name,
            ...(typeof item.externalId === 'string' && item.externalId.trim()
              ? { externalId: item.externalId.trim() }
              : {}),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 12);
    }
    if (typeof args.isFavourite === 'boolean') {
      payload.isFavourite = args.isFavourite;
    }

    return payload;
  }

  private cleanBrainDumpProcessPayload(
    args: RawArguments,
    target: BrainDumpTarget,
  ) {
    const payload: Record<string, unknown> = { target };

    if (typeof args.title === 'string' && args.title.trim()) {
      payload.title = args.title.trim().slice(0, 220);
    }
    if (Array.isArray(args.tags)) {
      payload.tags = this.cleanStringArray(args.tags, 30);
    }

    if (target === BrainDumpTarget.TASK) {
      if (typeof args.priority === 'string') {
        payload.priority = this.requiredEnum(
          args,
          'priority',
          Object.values(TaskPriority),
        );
      }
      if (typeof args.area === 'string' && args.area.trim()) {
        payload.area = args.area.trim().slice(0, 100);
      }
      if (typeof args.dueAt === 'string' && args.dueAt.trim()) {
        const dueAt = args.dueAt.trim();
        if (Number.isNaN(Date.parse(dueAt))) {
          throw new BadRequestException('dueAt must be a valid ISO date.');
        }
        payload.dueAt = dueAt;
      }
    }

    if (
      target === BrainDumpTarget.JOURNAL &&
      typeof args.journalType === 'string'
    ) {
      payload.journalType = this.requiredEnum(
        args,
        'journalType',
        Object.values(JournalEntryType),
      );
    }

    if (target === BrainDumpTarget.MEMORY) {
      if (typeof args.memoryType === 'string') {
        payload.memoryType = this.requiredEnum(
          args,
          'memoryType',
          Object.values(MemoryType),
        );
      }
      if (typeof args.memoryAccessLevel === 'string') {
        payload.memoryAccessLevel = this.requiredEnum(
          args,
          'memoryAccessLevel',
          Object.values(MemoryAccessLevel),
        );
      }
      if (typeof args.memorySensitivity === 'string') {
        payload.memorySensitivity = this.requiredEnum(
          args,
          'memorySensitivity',
          Object.values(MemorySensitivity),
        );
      }
    }

    return payload;
  }

  private cleanJournalWritePayload(args: RawArguments, includeDate: boolean) {
    const payload: Record<string, unknown> = {};

    for (const key of ['title', 'content', 'highlight'] as const) {
      if (typeof args[key] === 'string' && args[key].trim()) {
        payload[key] = args[key].trim();
      }
    }

    if (includeDate) {
      const date = this.optionalIsoDate(args, 'date');
      if (date) payload.date = date;
    }

    if (typeof args.type === 'string') {
      payload.type = this.requiredEnum(
        args,
        'type',
        Object.values(JournalEntryType),
      );
    }
    if (typeof args.mood === 'string') {
      payload.mood = this.requiredEnum(
        args,
        'mood',
        Object.values(JournalMood),
      );
    }

    for (const key of [
      'moodScore',
      'energyScore',
      'productivityScore',
      'stressScore',
    ] as const) {
      if (typeof args[key] === 'number' && Number.isFinite(args[key])) {
        payload[key] = Math.min(Math.max(args[key], 0), 10);
      }
    }

    for (const key of [
      'tags',
      'lessons',
      'decisions',
      'ideas',
      'gratitude',
      'challenges',
      'wins',
    ] as const) {
      if (Array.isArray(args[key])) {
        payload[key] = this.cleanStringArray(args[key], 30);
      }
    }

    if (typeof args.isFavourite === 'boolean') {
      payload.isFavourite = args.isFavourite;
    }

    return payload;
  }

  private journalPreview(payload: Record<string, unknown>) {
    return {
      Title: payload.title,
      Date: payload.date,
      Type: payload.type ?? JournalEntryType.REFLECTION,
      Content:
        typeof payload.content === 'string'
          ? this.previewText(payload.content, 360)
          : null,
      Mood: payload.mood ?? null,
      Tags: payload.tags ?? [],
      Visibility: JournalVisibility.PRIVATE,
      Published: false,
    };
  }

  private humanizeJournalChanges(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      result[
        key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
      ] =
        typeof value === 'string' && value.length > 360
          ? this.previewText(value, 360)
          : value;
    }
    return result;
  }

  private cleanMemoryWritePayload(args: RawArguments) {
    const payload: Record<string, unknown> = {};

    if (typeof args.content === 'string' && args.content.trim()) {
      payload.content = args.content.trim().slice(0, 12000);
    }
    if (typeof args.type === 'string') {
      payload.type = this.requiredEnum(args, 'type', Object.values(MemoryType));
    }
    if (Array.isArray(args.tags)) {
      payload.tags = this.cleanStringArray(args.tags, 30);
    }
    for (const key of ['importance', 'confidence'] as const) {
      if (typeof args[key] === 'number' && Number.isFinite(args[key])) {
        payload[key] = Math.min(Math.max(args[key], 0), 1);
      }
    }
    if (typeof args.accessLevel === 'string') {
      payload.accessLevel = this.requiredEnum(
        args,
        'accessLevel',
        Object.values(MemoryAccessLevel),
      );
    }
    if (typeof args.sensitivity === 'string') {
      payload.sensitivity = this.requiredEnum(
        args,
        'sensitivity',
        Object.values(MemorySensitivity),
      );
    }
    if (typeof args.durability === 'string') {
      payload.durability = this.requiredEnum(
        args,
        'durability',
        Object.values(MemoryDurability),
      );
    }
    const happenedAt = this.optionalIsoDate(args, 'happenedAt');
    if (happenedAt) payload.happenedAt = happenedAt;
    const expiresAt = this.optionalIsoDate(args, 'expiresAt');
    if (expiresAt) payload.expiresAt = expiresAt;

    return payload;
  }

  private memoryPreview(payload: Record<string, unknown>) {
    return {
      Content:
        typeof payload.content === 'string'
          ? this.previewText(payload.content, 360)
          : null,
      Type: payload.type ?? MemoryType.FACT,
      Tags: payload.tags ?? [],
      Categories: payload.categories ?? [],
      Entities: payload.entities ?? [],
      Importance: payload.importance ?? 0.5,
      Confidence: payload.confidence ?? 0.5,
      Durability: payload.durability ?? MemoryDurability.DURABLE,
      HappenedAt: payload.happenedAt ?? null,
      AccessLevel: payload.accessLevel ?? MemoryAccessLevel.OWNER_ONLY,
      Sensitivity: payload.sensitivity ?? MemorySensitivity.NORMAL,
      ExpiresAt: payload.expiresAt ?? null,
    };
  }

  private humanizeMemoryChanges(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      result[
        key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
      ] =
        typeof value === 'string' && value.length > 360
          ? this.previewText(value, 360)
          : value;
    }
    return result;
  }

  private requiredJournalEntryId(args: RawArguments) {
    const journalEntryId = this.requiredString(args, 'journalEntryId', 64);
    if (!Types.ObjectId.isValid(journalEntryId)) {
      throw new BadRequestException(
        'journalEntryId must be a valid journal ID.',
      );
    }
    return journalEntryId;
  }

  private requiredMemoryId(args: RawArguments) {
    const memoryId = this.requiredString(args, 'memoryId', 64);
    if (!Types.ObjectId.isValid(memoryId)) {
      throw new BadRequestException('memoryId must be a valid memory ID.');
    }
    return memoryId;
  }

  private optionalString(args: RawArguments, key: string, maxLength: number) {
    if (args[key] === undefined) return undefined;
    const value = args[key];
    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} must be a string.`);
    }
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private stringArray(
    args: RawArguments,
    key: string,
    maxItems: number,
    maxLength: number,
  ) {
    if (args[key] === undefined) return [];
    if (!Array.isArray(args[key])) {
      throw new BadRequestException(`${key} must be an array.`);
    }
    return this.cleanStringArray(args[key], maxItems).map((value) =>
      value.slice(0, maxLength),
    );
  }

  private requiredDateString(args: RawArguments, key: string) {
    const value = this.requiredString(args, key, 100);
    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${key} must be a valid ISO date.`);
    }
    return value;
  }

  private optionalDateString(args: RawArguments, key: string) {
    return this.optionalIsoDate(args, key);
  }

  private optionalIsoDate(args: RawArguments, key: string) {
    if (args[key] === undefined) return undefined;
    const value = this.requiredString(args, key, 100);
    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${key} must be a valid ISO date.`);
    }
    return value;
  }

  private requiredBrainDumpId(args: RawArguments) {
    const brainDumpId = this.requiredString(args, 'brainDumpId', 64);
    if (!Types.ObjectId.isValid(brainDumpId)) {
      throw new BadRequestException(
        'brainDumpId must be a valid brain dump ID.',
      );
    }
    return brainDumpId;
  }

  private cleanStringArray(values: unknown[], maxItems: number) {
    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }

  private previewText(value: string, maxLength: number) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= maxLength
      ? compact
      : `${compact.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
  }

  private requiredDecisionId(args: RawArguments) {
    const decisionId = this.requiredString(args, 'decisionId', 64);
    if (!Types.ObjectId.isValid(decisionId)) {
      throw new BadRequestException('decisionId must be a valid decision ID.');
    }
    return decisionId;
  }

  private requiredReminderId(args: RawArguments) {
    const reminderId = this.requiredString(args, 'reminderId', 100);
    if (!Types.ObjectId.isValid(reminderId)) {
      throw new BadRequestException('Invalid reminder ID.');
    }
    return reminderId;
  }

  private requiredTaskId(args: RawArguments) {
    const taskId = this.requiredString(args, 'taskId', 64);
    if (!Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException('taskId must be a valid task ID.');
    }
    return taskId;
  }

  private requiredString(args: RawArguments, key: string, maxLength: number) {
    const value = args[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${key} is required.`);
    }
    return value.trim().slice(0, maxLength);
  }

  private requiredEnum<T extends string>(
    args: RawArguments,
    key: string,
    values: readonly T[],
  ): T {
    const value = args[key];
    if (typeof value !== 'string' || !values.includes(value as T)) {
      throw new BadRequestException(`${key} is invalid.`);
    }
    return value as T;
  }

  private optionalEnum<T extends string>(
    args: RawArguments,
    key: string,
    values: readonly T[],
    fallback: T,
  ): T {
    return args[key] === undefined
      ? fallback
      : this.requiredEnum(args, key, values);
  }

  private payloadString(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    if (typeof value !== 'string' || !value) {
      throw new BadRequestException(`Stored action ${key} is invalid.`);
    }
    return value;
  }

  private idString(value: unknown) {
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }
    return typeof value === 'string' ? value : '';
  }

  private humanStatus(status: string) {
    return status.replaceAll('_', ' ');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
