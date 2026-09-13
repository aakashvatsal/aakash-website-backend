import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import {
  BrainDumpSource,
  BrainDumpStatus,
  BrainDumpTarget,
} from '../modules/brain-dump/schemas/brain-dump.schema';
import { ChatService } from '../modules/chat/chat.service';
import { JournalService } from '../modules/journal/journal.service';
import {
  JournalEntryType,
  JournalSource,
  JournalVisibility,
} from '../modules/journal/schemas/journal-entry.schema';
import { MemoryService } from '../modules/memory/memory.service';
import { RemindersService } from '../modules/reminders/reminders.service';
import {
  ReminderSourceType,
  ReminderStatus,
} from '../modules/reminders/schemas/reminder.schema';
import {
  MemoryAccessLevel,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../modules/memory/schemas/memory.schema';
import { TaskPriority, TaskStatus } from '../modules/tasks/schemas/task.schema';
import { TasksService } from '../modules/tasks/tasks.service';
import { HsakaaActionService } from './hsakaa-action.service';
import {
  HsakaaActionRisk,
  HsakaaActionStatus,
  HsakaaActionType,
} from './schemas/hsakaa-action.schema';

describe('HsakaaActionService', () => {
  const conversationId = new Types.ObjectId();
  const actionId = new Types.ObjectId();
  let actionDocument: Record<string, any>;
  let actionModel: Record<string, jest.Mock>;
  let tasksService: Record<string, jest.Mock>;
  let brainDumpService: Record<string, jest.Mock>;
  let journalService: Record<string, jest.Mock>;
  let memoryService: Record<string, jest.Mock>;
  let remindersService: Record<string, jest.Mock>;
  let chatService: Record<string, jest.Mock>;
  let service: HsakaaActionService;
  let capturedConfirmationTokenHash: unknown;

  beforeEach(() => {
    actionDocument = {};
    capturedConfirmationTokenHash = undefined;

    actionModel = {
      create: jest.fn((input: Record<string, unknown>) => {
        capturedConfirmationTokenHash = input.confirmationTokenHash;
        actionDocument = {
          ...input,
          _id: actionId,
          save: jest.fn().mockResolvedValue(undefined),
        };
        return Promise.resolve(actionDocument);
      }),
      findById: jest.fn(() => ({
        select: jest
          .fn()
          .mockImplementation(() => Promise.resolve(actionDocument)),
      })),
      findOneAndUpdate: jest.fn(
        (
          _filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown> },
        ) => {
          Object.assign(actionDocument, update.$set ?? {});
          return Promise.resolve(actionDocument);
        },
      ),
    };

    tasksService = {
      findOne: jest.fn(),
      create: jest.fn((payload: Record<string, unknown>) => {
        const taskId = new Types.ObjectId();
        return Promise.resolve({
          _id: taskId,
          title: payload.title,
          status: payload.status ?? TaskStatus.TODO,
          priority: payload.priority ?? TaskPriority.MEDIUM,
          isArchived: false,
          toObject: () => ({
            _id: taskId,
            title: payload.title,
            status: payload.status ?? TaskStatus.TODO,
            priority: payload.priority ?? TaskPriority.MEDIUM,
            isArchived: false,
          }),
        });
      }),
      update: jest.fn(),
      updateStatus: jest.fn(),
      complete: jest.fn(),
      reopen: jest.fn(),
      archive: jest.fn(),
    };

    brainDumpService = {
      findOne: jest.fn((brainDumpId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(brainDumpId),
          title: 'Captured idea',
          content: 'Turn this idea into something useful.',
          status: BrainDumpStatus.INBOX,
          isArchived: false,
        }),
      ),
      create: jest.fn((payload: Record<string, unknown>) => {
        const brainDumpId = new Types.ObjectId();
        return Promise.resolve({
          _id: brainDumpId,
          title: payload.title,
          content: payload.content,
          status: BrainDumpStatus.INBOX,
          source: payload.source,
          isArchived: false,
          toObject: () => ({
            _id: brainDumpId,
            title: payload.title,
            content: payload.content,
            status: BrainDumpStatus.INBOX,
            source: payload.source,
            isArchived: false,
          }),
        });
      }),
      process: jest.fn(
        (brainDumpId: string, payload: Record<string, unknown>) => {
          const createdId = new Types.ObjectId();
          return Promise.resolve({
            brainDump: {
              _id: new Types.ObjectId(brainDumpId),
              title: 'Captured idea',
              content: 'Turn this idea into something useful.',
              status: BrainDumpStatus.PROCESSED,
              processedAs: payload.target,
              processedEntityId: createdId,
              isArchived: false,
            },
            created: {
              _id: createdId,
              title: payload.title ?? 'Captured idea',
              status: TaskStatus.TODO,
            },
          });
        },
      ),
      discard: jest.fn((brainDumpId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(brainDumpId),
          title: 'Captured idea',
          content: 'Turn this idea into something useful.',
          status: BrainDumpStatus.DISCARDED,
          isArchived: false,
        }),
      ),
      reopen: jest.fn((brainDumpId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(brainDumpId),
          title: 'Captured idea',
          content: 'Turn this idea into something useful.',
          status: BrainDumpStatus.INBOX,
          isArchived: false,
        }),
      ),
      archive: jest.fn((brainDumpId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(brainDumpId),
          title: 'Captured idea',
          content: 'Turn this idea into something useful.',
          status: BrainDumpStatus.INBOX,
          isArchived: true,
        }),
      ),
    };

    journalService = {
      findById: jest.fn((journalEntryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(journalEntryId),
          title: 'Existing journal',
          content: 'Existing reflection.',
          visibility: JournalVisibility.PRIVATE,
          isPublished: false,
          isArchived: false,
        }),
      ),
      create: jest.fn((payload: Record<string, unknown>) => {
        const journalEntryId = new Types.ObjectId();
        return Promise.resolve({
          _id: journalEntryId,
          title: payload.title,
          content: payload.content,
          type: payload.type ?? JournalEntryType.REFLECTION,
          visibility: payload.visibility,
          isPublished: payload.isPublished,
          source: payload.source,
          isArchived: false,
          toObject: () => ({
            _id: journalEntryId,
            title: payload.title,
            content: payload.content,
            type: payload.type ?? JournalEntryType.REFLECTION,
            visibility: payload.visibility,
            isPublished: payload.isPublished,
            source: payload.source,
            isArchived: false,
          }),
        });
      }),
      update: jest.fn(
        (journalEntryId: string, updates: Record<string, unknown>) =>
          Promise.resolve({
            _id: new Types.ObjectId(journalEntryId),
            title: updates.title ?? 'Existing journal',
            content: updates.content ?? 'Existing reflection.',
            visibility: JournalVisibility.PRIVATE,
            isPublished: false,
            isArchived: false,
          }),
      ),
      archive: jest.fn((journalEntryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(journalEntryId),
          title: 'Existing journal',
          content: 'Existing reflection.',
          isArchived: true,
        }),
      ),
      restore: jest.fn((journalEntryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(journalEntryId),
          title: 'Existing journal',
          content: 'Existing reflection.',
          isArchived: false,
        }),
      ),
    };

    memoryService = {
      findOne: jest.fn((memoryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(memoryId),
          content: 'Existing memory.',
          type: MemoryType.FACT,
          accessLevel: MemoryAccessLevel.OWNER_ONLY,
          sensitivity: MemorySensitivity.NORMAL,
          isArchived: false,
        }),
      ),
      create: jest.fn((payload: Record<string, unknown>) => {
        const memoryId = new Types.ObjectId();
        return Promise.resolve({
          _id: memoryId,
          content: payload.content,
          type: payload.type ?? MemoryType.FACT,
          source: payload.source,
          accessLevel: payload.accessLevel,
          sensitivity: payload.sensitivity,
          verificationStatus: payload.verificationStatus,
          isArchived: false,
          toObject: () => ({
            _id: memoryId,
            content: payload.content,
            type: payload.type ?? MemoryType.FACT,
            source: payload.source,
            accessLevel: payload.accessLevel,
            sensitivity: payload.sensitivity,
            verificationStatus: payload.verificationStatus,
            isArchived: false,
          }),
        });
      }),
      update: jest.fn((memoryId: string, updates: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(memoryId),
          content: updates.content ?? 'Existing memory.',
          type: updates.type ?? MemoryType.FACT,
          accessLevel: updates.accessLevel ?? MemoryAccessLevel.OWNER_ONLY,
          sensitivity: updates.sensitivity ?? MemorySensitivity.NORMAL,
          isArchived: false,
        }),
      ),
      archive: jest.fn((memoryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(memoryId),
          content: 'Existing memory.',
          isArchived: true,
        }),
      ),
      restore: jest.fn((memoryId: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(memoryId),
          content: 'Existing memory.',
          isArchived: false,
        }),
      ),
    };

    const reminderId = new Types.ObjectId();
    const originalScheduledFor = new Date(Date.now() + 60 * 60 * 1000);
    const reminderDocument = (overrides: Record<string, unknown> = {}) => {
      const document: Record<string, unknown> = {
        _id: reminderId,
        title: 'Test reminder',
        message: 'Remember this.',
        status: ReminderStatus.PENDING,
        sourceType: ReminderSourceType.TASK,
        sourceId: new Types.ObjectId(),
        scheduledFor: originalScheduledFor,
        originalScheduledFor,
        isActive: true,
        ...overrides,
      };

      document.toObject = () => ({ ...document, toObject: undefined });
      return document;
    };

    remindersService = {
      findOne: jest.fn(() => Promise.resolve(reminderDocument())),
      syncUpcoming: jest.fn((days: number) =>
        Promise.resolve({ days, created: 1, updated: 0, deactivated: 0 }),
      ),
      snooze: jest.fn((_id: string, dto: Record<string, unknown>) => {
        const scheduledFor =
          typeof dto.until === 'string'
            ? new Date(dto.until)
            : new Date(Date.now() + Number(dto.minutes ?? 15) * 60_000);
        return Promise.resolve(
          reminderDocument({
            status: ReminderStatus.SNOOZED,
            scheduledFor,
            snoozedUntil: scheduledFor,
          }),
        );
      }),
      acknowledge: jest.fn(() =>
        Promise.resolve(
          reminderDocument({ status: ReminderStatus.ACKNOWLEDGED }),
        ),
      ),
      dismiss: jest.fn(() =>
        Promise.resolve(reminderDocument({ status: ReminderStatus.DISMISSED })),
      ),
      reopen: jest.fn(() =>
        Promise.resolve(reminderDocument({ status: ReminderStatus.PENDING })),
      ),
    };

    chatService = {
      appendMessage: jest.fn().mockResolvedValue(undefined),
    };

    const configService = {
      get: jest.fn().mockReturnValue('30'),
    } as unknown as ConfigService;

    const decisionExperimentService = {
      getDecisionState: jest.fn().mockResolvedValue({
        decisionId: new Types.ObjectId().toHexString(),
        question: 'Should I test this path?',
        experiments: [],
        evidenceLog: [],
        reassessments: [],
      }),
      createExperiment: jest.fn(),
      addEvidence: jest.fn(),
      completeExperiment: jest.fn(),
      reassess: jest.fn(),
    };

    service = new HsakaaActionService(
      actionModel as never,
      tasksService as unknown as TasksService,
      brainDumpService as unknown as BrainDumpService,
      journalService as unknown as JournalService,
      memoryService as unknown as MemoryService,
      remindersService as unknown as RemindersService,
      decisionExperimentService as never,
      {} as never, // MediaContentDirectorService
      {} as never, // MediaProductionService
      {} as never, // MediaCalendarService
      {} as never, // MediaEngagementService
      chatService as unknown as ChatService,
      configService,
    );
  });

  it('creates a pending task proposal without executing the task', async () => {
    const proposal = await service.proposeTaskCreate(
      {
        conversationId,
        requestId: 'request-1',
      },
      {
        title: 'Call Rahul',
        priority: TaskPriority.HIGH,
      },
    );

    expect(proposal).toEqual(
      expect.objectContaining({
        id: actionId.toHexString(),
        type: HsakaaActionType.TASK_CREATE,
        status: HsakaaActionStatus.PENDING,
        risk: HsakaaActionRisk.LOW,
        summary: 'Create task “Call Rahul”',
      }),
    );
    expect(proposal.confirmationToken).toHaveLength(64);
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(typeof capturedConfirmationTokenHash).toBe('string');
    expect(capturedConfirmationTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('executes exactly after a valid confirmation token', async () => {
    const proposal = await service.proposeTaskCreate(
      {
        conversationId,
        requestId: 'request-2',
      },
      { title: 'Prepare AI roadmap' },
    );

    const result = await service.confirm(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(tasksService.create).toHaveBeenCalledTimes(1);
    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prepare AI roadmap',
        source: 'hsakaa',
        sourceExternalId: `hsakaa-action:${actionId.toHexString()}`,
      }),
    );
    expect(result.action.status).toBe(HsakaaActionStatus.EXECUTED);
    expect(result.message).toBe('Created task “Prepare AI roadmap”.');
    expect(chatService.appendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid confirmation token without executing', async () => {
    const proposal = await service.proposeTaskCreate(
      {
        conversationId,
        requestId: 'request-3',
      },
      { title: 'Should not execute' },
    );

    await expect(
      service.confirm(proposal.id, '0'.repeat(64)),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('rejects a pending proposal without mutating the task', async () => {
    const proposal = await service.proposeTaskCreate(
      {
        conversationId,
        requestId: 'request-4',
      },
      { title: 'Do not create me' },
    );

    const result = await service.reject(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(result.action.status).toBe(HsakaaActionStatus.REJECTED);
    expect(result.message).toBe('Cancelled: Create task “Do not create me”.');
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(chatService.appendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not execute the same confirmed action twice', async () => {
    const proposal = await service.proposeTaskCreate(
      {
        conversationId,
        requestId: 'request-5',
      },
      { title: 'Create once' },
    );

    const first = await service.confirm(
      proposal.id,
      proposal.confirmationToken,
    );
    const second = await service.confirm(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(first.alreadyExecuted).toBe(false);
    expect(second.alreadyExecuted).toBe(true);
    expect(tasksService.create).toHaveBeenCalledTimes(1);
    expect(chatService.appendMessage).toHaveBeenCalledTimes(1);
  });

  it('creates a pending Brain Dump capture proposal without writing', async () => {
    const proposal = await service.proposeBrainDumpCreate(
      {
        conversationId,
        requestId: 'brain-request-1',
      },
      {
        content: 'Capture this thought for later.',
        title: 'Later thought',
        tags: ['ai', 'idea'],
      },
    );

    expect(proposal).toEqual(
      expect.objectContaining({
        type: HsakaaActionType.BRAIN_DUMP_CREATE,
        status: HsakaaActionStatus.PENDING,
        risk: HsakaaActionRisk.LOW,
      }),
    );
    expect(brainDumpService.create).not.toHaveBeenCalled();
  });

  it('captures a Brain Dump item only after confirmation', async () => {
    const proposal = await service.proposeBrainDumpCreate(
      {
        conversationId,
        requestId: 'brain-request-2',
      },
      {
        content: 'Write this into my Brain Dump.',
      },
    );

    const result = await service.confirm(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(brainDumpService.create).toHaveBeenCalledTimes(1);
    expect(brainDumpService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Write this into my Brain Dump.',
        source: BrainDumpSource.HSAKAA,
      }),
    );
    expect(result.action.status).toBe(HsakaaActionStatus.EXECUTED);
    expect(result.message).toBe('Captured the Brain Dump item.');
  });

  it('processes a Brain Dump item into a Task only after confirmation', async () => {
    const brainDumpId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeBrainDumpProcess(
      {
        conversationId,
        requestId: 'brain-request-3',
      },
      {
        brainDumpId,
        target: BrainDumpTarget.TASK,
        title: 'Turn idea into task',
        priority: TaskPriority.HIGH,
      },
    );

    expect(brainDumpService.process).not.toHaveBeenCalled();

    const result = await service.confirm(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(brainDumpService.process).toHaveBeenCalledTimes(1);
    expect(brainDumpService.process).toHaveBeenCalledWith(
      brainDumpId,
      expect.objectContaining({
        target: BrainDumpTarget.TASK,
        title: 'Turn idea into task',
        priority: TaskPriority.HIGH,
      }),
    );
    expect(result.message).toBe('Processed the Brain Dump item into task.');
  });

  it('rejecting a Brain Dump discard proposal never discards the item', async () => {
    const brainDumpId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeBrainDumpDiscard(
      {
        conversationId,
        requestId: 'brain-request-4',
      },
      { brainDumpId },
    );

    const result = await service.reject(
      proposal.id,
      proposal.confirmationToken,
    );

    expect(result.action.status).toBe(HsakaaActionStatus.REJECTED);
    expect(brainDumpService.discard).not.toHaveBeenCalled();
  });

  it('archives a Brain Dump item after confirmation', async () => {
    const brainDumpId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeBrainDumpArchive(
      {
        conversationId,
        requestId: 'brain-request-5',
      },
      { brainDumpId },
    );

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(brainDumpService.archive).toHaveBeenCalledTimes(1);
    expect(brainDumpService.archive).toHaveBeenCalledWith(brainDumpId);
  });

  it('creates a private Journal proposal without writing before confirmation', async () => {
    const proposal = await service.proposeJournalCreate(
      {
        conversationId,
        requestId: 'journal-request-1',
      },
      {
        title: 'Phase 2C reflection',
        content: 'What I learned today.',
        type: JournalEntryType.REFLECTION,
      },
    );

    expect(proposal).toEqual(
      expect.objectContaining({
        type: HsakaaActionType.JOURNAL_CREATE,
        status: HsakaaActionStatus.PENDING,
        risk: HsakaaActionRisk.LOW,
      }),
    );
    expect(journalService.create).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(journalService.create).toHaveBeenCalledTimes(1);
    expect(journalService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Phase 2C reflection',
        content: 'What I learned today.',
        visibility: JournalVisibility.PRIVATE,
        isPublished: false,
        source: JournalSource.HSAKAA,
      }),
    );
  });

  it('appends to a Journal entry only after confirmation', async () => {
    const journalEntryId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeJournalAppend(
      {
        conversationId,
        requestId: 'journal-request-2',
      },
      {
        journalEntryId,
        content: 'A second reflection.',
      },
    );

    expect(journalService.update).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(journalService.update).toHaveBeenCalledWith(journalEntryId, {
      content: 'Existing reflection.\n\nA second reflection.',
    });
  });

  it('rejecting a Journal archive proposal never archives the entry', async () => {
    const journalEntryId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeJournalArchive(
      {
        conversationId,
        requestId: 'journal-request-3',
      },
      { journalEntryId },
    );

    await service.reject(proposal.id, proposal.confirmationToken);

    expect(journalService.archive).not.toHaveBeenCalled();
  });

  it('creates an owner-only confirmed Memory only after confirmation', async () => {
    const proposal = await service.proposeMemoryCreate(
      {
        conversationId,
        requestId: 'memory-request-1',
      },
      {
        content: 'Remember this Phase 2C preference.',
        type: MemoryType.PREFERENCE,
      },
    );

    expect(proposal).toEqual(
      expect.objectContaining({
        type: HsakaaActionType.MEMORY_CREATE,
        status: HsakaaActionStatus.PENDING,
        risk: HsakaaActionRisk.MEDIUM,
      }),
    );
    expect(memoryService.create).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(memoryService.create).toHaveBeenCalledTimes(1);
    expect(memoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Remember this Phase 2C preference.',
        type: MemoryType.PREFERENCE,
        source: MemorySource.CHAT,
        accessLevel: MemoryAccessLevel.OWNER_ONLY,
        sensitivity: MemorySensitivity.NORMAL,
        verificationStatus: MemoryVerificationStatus.CONFIRMED,
      }),
    );
  });

  it('updates Memory only after confirmation and never on rejection', async () => {
    const memoryId = new Types.ObjectId().toHexString();
    const updateProposal = await service.proposeMemoryUpdate(
      {
        conversationId,
        requestId: 'memory-request-2',
      },
      {
        memoryId,
        content: 'Updated explicit memory.',
      },
    );

    expect(memoryService.update).not.toHaveBeenCalled();

    await service.confirm(updateProposal.id, updateProposal.confirmationToken);

    expect(memoryService.update).toHaveBeenCalledTimes(1);
    expect(memoryService.update).toHaveBeenCalledWith(
      memoryId,
      expect.objectContaining({ content: 'Updated explicit memory.' }),
    );

    memoryService.archive.mockClear();
    const archiveProposal = await service.proposeMemoryArchive(
      {
        conversationId,
        requestId: 'memory-request-3',
      },
      { memoryId },
    );

    await service.reject(archiveProposal.id, archiveProposal.confirmationToken);

    expect(memoryService.archive).not.toHaveBeenCalled();
  });

  it('creates a pending task-backed Reminder proposal without writing', async () => {
    const reminderAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const proposal = await service.proposeReminderCreate(
      {
        conversationId,
        requestId: 'reminder-request-1',
      },
      {
        title: 'Call Rahul',
        reminderAt,
        priority: TaskPriority.HIGH,
      },
    );

    expect(proposal).toEqual(
      expect.objectContaining({
        type: HsakaaActionType.REMINDER_CREATE,
        status: HsakaaActionStatus.PENDING,
        risk: HsakaaActionRisk.LOW,
        summary: 'Create reminder “Call Rahul”',
      }),
    );
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(remindersService.syncUpcoming).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(tasksService.create).toHaveBeenCalledTimes(1);
    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Call Rahul',
        reminderAt,
        priority: TaskPriority.HIGH,
        source: 'hsakaa',
        sourceExternalId: `hsakaa-reminder-action:${actionId.toHexString()}`,
      }),
    );
    expect(remindersService.syncUpcoming).toHaveBeenCalledWith(14);
  });

  it('syncs Personal OS reminders only after confirmation', async () => {
    const proposal = await service.proposeReminderSync(
      {
        conversationId,
        requestId: 'reminder-request-2',
      },
      { days: 5 },
    );

    expect(remindersService.syncUpcoming).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(remindersService.syncUpcoming).toHaveBeenCalledTimes(1);
    expect(remindersService.syncUpcoming).toHaveBeenCalledWith(5);
  });

  it('snoozes a Reminder only after confirmation', async () => {
    const reminderId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeReminderSnooze(
      {
        conversationId,
        requestId: 'reminder-request-3',
      },
      { reminderId, minutes: 30 },
    );

    expect(remindersService.snooze).not.toHaveBeenCalled();

    await service.confirm(proposal.id, proposal.confirmationToken);

    expect(remindersService.snooze).toHaveBeenCalledTimes(1);
    expect(remindersService.snooze).toHaveBeenCalledWith(reminderId, {
      minutes: 30,
    });
  });

  it('acknowledges, dismisses and reopens Reminders only after confirmation', async () => {
    const reminderId = new Types.ObjectId().toHexString();

    const acknowledge = await service.proposeReminderAcknowledge(
      { conversationId, requestId: 'reminder-request-4' },
      { reminderId },
    );
    expect(remindersService.acknowledge).not.toHaveBeenCalled();
    await service.confirm(acknowledge.id, acknowledge.confirmationToken);
    expect(remindersService.acknowledge).toHaveBeenCalledWith(reminderId);

    const dismiss = await service.proposeReminderDismiss(
      { conversationId, requestId: 'reminder-request-5' },
      { reminderId },
    );
    expect(remindersService.dismiss).not.toHaveBeenCalled();
    await service.confirm(dismiss.id, dismiss.confirmationToken);
    expect(remindersService.dismiss).toHaveBeenCalledWith(reminderId);

    const reopen = await service.proposeReminderReopen(
      { conversationId, requestId: 'reminder-request-6' },
      { reminderId },
    );
    expect(remindersService.reopen).not.toHaveBeenCalled();
    await service.confirm(reopen.id, reopen.confirmationToken);
    expect(remindersService.reopen).toHaveBeenCalledWith(reminderId);
  });

  it('rejecting a Reminder action never mutates the Reminder', async () => {
    const reminderId = new Types.ObjectId().toHexString();
    const proposal = await service.proposeReminderDismiss(
      {
        conversationId,
        requestId: 'reminder-request-7',
      },
      { reminderId },
    );

    await service.reject(proposal.id, proposal.confirmationToken);

    expect(remindersService.dismiss).not.toHaveBeenCalled();
  });
});
