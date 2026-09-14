import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import { tokenizeUnicodeText } from '../common/utils/text-search.util';

import { CompaniesService } from '../modules/companies/companies.service';
import { HealthDashboardService } from '../modules/health/health-dashboard.service';
import { HealthService } from '../modules/health/health.service';
import { HobbiesService } from '../modules/hobbies/hobbies.service';
import { JournalService } from '../modules/journal/journal.service';
import { LibraryService } from '../modules/library/library.service';
import {
  LibraryItemStatus,
  LibraryItemType,
} from '../modules/library/schemas/library-item.schema';
import { MediaService } from '../modules/media/media.service';
import { MemoryService } from '../modules/memory/memory.service';
import { NowService } from '../modules/now/now.service';
import { TasksService } from '../modules/tasks/tasks.service';
import { MeditationService } from '../modules/meditation/meditation.service';
import { RemindersService } from '../modules/reminders/reminders.service';
import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import { BrainDumpStatus } from '../modules/brain-dump/schemas/brain-dump.schema';
import { HsakaaMode } from './dto/ask-hsakaa.dto';

export interface HsakaaContextBundle {
  sections: string[];
  memoryIds: Types.ObjectId[];
  retrievedMemoryCount: number;
}

@Injectable()
export class HsakaaContextService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly nowService: NowService,
    private readonly companiesService: CompaniesService,
    private readonly journalService: JournalService,
    private readonly libraryService: LibraryService,
    private readonly healthService: HealthService,
    private readonly healthDashboardService: HealthDashboardService,
    private readonly hobbiesService: HobbiesService,
    private readonly mediaService: MediaService,
    private readonly tasksService: TasksService,
    private readonly remindersService: RemindersService,
    private readonly meditationService: MeditationService,
    private readonly brainDumpService: BrainDumpService,
  ) {}

  async buildPublicContext(
    mode: HsakaaMode,
    message: string,
  ): Promise<HsakaaContextBundle> {
    const [memoryResult, nowResult] = await Promise.allSettled([
      this.memoryService.retrievePublicForHsakaa(message, 8, mode),
      this.nowService.getPublicCurrent(),
    ]);

    const sections: string[] = [
      this.formatSection(
        'CURRENT LOCAL TIME',
        this.nowService.getTemporalContext(),
        1200,
      ),
    ];
    const memoryIds: Types.ObjectId[] = [];

    if (memoryResult.status === 'fulfilled' && memoryResult.value.length > 0) {
      memoryIds.push(...memoryResult.value.map((memory) => memory._id));

      sections.push(this.formatMemorySection(memoryResult.value));
    }

    if (nowResult.status === 'fulfilled' && nowResult.value) {
      const safeNow = this.sanitizePublicNow(nowResult.value);

      if (safeNow) {
        sections.push(
          this.formatSection('CURRENT PUBLIC NOW STATUS', safeNow, 4500),
        );
      }
    }

    const modeSections = await this.getModeSections(mode, message);

    sections.push(...modeSections);

    return {
      sections,
      memoryIds,
      retrievedMemoryCount:
        memoryResult.status === 'fulfilled' ? memoryResult.value.length : 0,
    };
  }

  async buildVerifiedPersonContext(
    mode: HsakaaMode,
    message: string,
    sessionToken: string,
  ): Promise<
    HsakaaContextBundle & {
      personId: Types.ObjectId;
      personName: string;
      memoryAccessConsentGranted: boolean;
    }
  > {
    const [memoryResult, nowResult] = await Promise.allSettled([
      this.memoryService.retrieveForVerifiedPersonHsakaa(
        sessionToken,
        message,
        10,
        mode,
      ),
      this.nowService.getPublicCurrent(),
    ]);

    if (memoryResult.status !== 'fulfilled') {
      throw memoryResult.reason;
    }

    const sections: string[] = [
      this.formatSection(
        'CURRENT LOCAL TIME',
        this.nowService.getTemporalContext(),
        1200,
      ),
      this.formatSection(
        'VERIFIED VISITOR IDENTITY',
        {
          name: memoryResult.value.personName,
          personSpecificMemoryEnabled:
            memoryResult.value.memoryAccessConsentGranted,
        },
        1000,
      ),
    ];
    const memoryIds: Types.ObjectId[] = [];

    if (memoryResult.value.memories.length > 0) {
      memoryIds.push(
        ...memoryResult.value.memories.map((memory) => memory._id),
      );
      sections.push(
        this.formatMemorySection(
          memoryResult.value.memories,
          'PUBLIC + VERIFIED-PERSON MEMORY CONTEXT',
        ),
      );
    }

    if (nowResult.status === 'fulfilled' && nowResult.value) {
      const safeNow = this.sanitizePublicNow(nowResult.value);
      if (safeNow) {
        sections.push(
          this.formatSection('CURRENT PUBLIC NOW STATUS', safeNow, 4500),
        );
      }
    }

    sections.push(...(await this.getModeSections(mode, message)));

    return {
      sections,
      memoryIds,
      retrievedMemoryCount: memoryResult.value.memories.length,
      personId: memoryResult.value.personId,
      personName: memoryResult.value.personName,
      memoryAccessConsentGranted: memoryResult.value.memoryAccessConsentGranted,
    };
  }

  async buildPrivateContext(
    mode: HsakaaMode,
    message: string,
  ): Promise<HsakaaContextBundle> {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const [
      memoryResult,
      nowResult,
      taskSummaryResult,
      reminderSummaryResult,
      reminderTodayResult,
      meditationSummaryResult,
      brainDumpSummaryResult,
      brainDumpInboxResult,
      hobbiesOverviewResult,
    ] = await Promise.allSettled([
      this.memoryService.recall({
        query: message,
        limit: 10,
      }),
      this.nowService.getCurrent(),
      this.tasksService.getSummary(),
      this.remindersService.getSummary(),
      this.remindersService.getToday(),
      this.meditationService.getSummary(
        this.toDateKey(thirtyDaysAgo),
        this.toDateKey(today),
      ),
      this.brainDumpService.getSummary(),
      this.brainDumpService.findAll({
        status: BrainDumpStatus.INBOX,
        page: 1,
        limit: 8,
      }),
      this.hobbiesService.getOverview(),
    ]);

    const sections: string[] = [
      this.formatSection(
        'CURRENT LOCAL TIME',
        this.nowService.getTemporalContext(),
        1200,
      ),
    ];
    const memoryIds: Types.ObjectId[] = [];

    if (memoryResult.status === 'fulfilled') {
      const memories = memoryResult.value.current ?? [];
      memoryIds.push(...memories.map(({ memory }) => memory._id));

      if (memories.length > 0) {
        sections.push(
          this.formatSection(
            'DETERMINISTIC PRIVATE MEMORY RECALL',
            { plan: memoryResult.value.plan, results: memories },
            10000,
          ),
        );
      }
    }

    if (nowResult.status === 'fulfilled' && nowResult.value) {
      sections.push(
        this.formatSection('CURRENT PRIVATE NOW STATUS', nowResult.value, 5000),
      );
    }

    if (taskSummaryResult.status === 'fulfilled') {
      sections.push(
        this.formatSection('TASK PULSE', taskSummaryResult.value, 7000),
      );
    }

    if (reminderSummaryResult.status === 'fulfilled') {
      sections.push(
        this.formatSection('REMINDER PULSE', reminderSummaryResult.value, 5000),
      );
    }

    if (reminderTodayResult.status === 'fulfilled') {
      sections.push(
        this.formatSection('TODAY REMINDERS', reminderTodayResult.value, 8000),
      );
    }

    if (meditationSummaryResult.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'MEDITATION - LAST 30 DAYS',
          meditationSummaryResult.value,
          5000,
        ),
      );
    }

    if (brainDumpSummaryResult.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'BRAIN DUMP PULSE',
          brainDumpSummaryResult.value,
          5000,
        ),
      );
    }

    if (brainDumpInboxResult.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'BRAIN DUMP INBOX',
          brainDumpInboxResult.value,
          8000,
        ),
      );
    }

    if (hobbiesOverviewResult.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'HOBBIES / DELIBERATE PRACTICE',
          hobbiesOverviewResult.value,
          9000,
        ),
      );
    }

    sections.push(...(await this.getPrivateModeSections(mode, message)));

    return {
      sections,
      memoryIds,
      retrievedMemoryCount:
        memoryResult.status === 'fulfilled'
          ? memoryResult.value.current.length
          : 0,
    };
  }

  private async getPrivateModeSections(mode: HsakaaMode, message: string) {
    switch (mode) {
      case HsakaaMode.COMPANIES:
        return this.privateSection(
          'PRIVATE COMPANIES',
          () =>
            this.companiesService.findAll({
              search: this.getSearchTerms(message),
              page: 1,
              limit: 8,
            }),
          10000,
        );

      case HsakaaMode.JOURNAL:
        return this.privateSection(
          'PRIVATE JOURNAL',
          () =>
            this.journalService.findAll({
              search: this.getSearchTerms(message, 3),
              page: 1,
              limit: 8,
            }),
          12000,
        );

      case HsakaaMode.LIBRARY:
        return this.privateSection(
          'PRIVATE LIBRARY',
          () =>
            this.libraryService.findAll(
              {
                search: this.getSearchTerms(message),
                page: 1,
                limit: 8,
              },
              false,
            ),
          10000,
        );

      case HsakaaMode.HEALTH:
        return this.getPrivateHealthSections();

      case HsakaaMode.MEDIA:
        return this.privateSection(
          'PRIVATE MEDIA',
          () =>
            this.mediaService.findAll(
              {
                search: this.getSearchTerms(message),
                page: 1,
                limit: 8,
              },
              false,
            ),
          10000,
        );

      case HsakaaMode.MEMORY:
        return [];

      case HsakaaMode.CHAT:
      default:
        return this.getPrivateGeneralSections(message);
    }
  }

  private async getPrivateGeneralSections(message: string) {
    const search = this.getSearchTerms(message);
    const results = await Promise.allSettled([
      this.companiesService.findAll({ search, page: 1, limit: 4 }),
      this.journalService.findAll({
        search: this.getSearchTerms(message, 3),
        page: 1,
        limit: 4,
      }),
      this.libraryService.findAll({ search, page: 1, limit: 4 }, false),
      this.mediaService.findAll({ search, page: 1, limit: 3 }, false),
      this.healthDashboardService.getDashboard(),
      this.hobbiesService.getOverview(),
    ]);

    const labels = [
      'PRIVATE COMPANIES',
      'PRIVATE JOURNAL',
      'PRIVATE LIBRARY',
      'PRIVATE MEDIA',
      'PRIVATE HEALTH DASHBOARD',
      'HOBBIES / DELIBERATE PRACTICE',
    ];

    return results.flatMap((result, index) => {
      if (result.status !== 'fulfilled' || !this.hasUsefulData(result.value)) {
        return [];
      }

      return [this.formatSection(labels[index], result.value, 6500)];
    });
  }

  private async getPrivateHealthSections() {
    const [dashboard, entries] = await Promise.allSettled([
      this.healthDashboardService.getDashboard(),
      this.healthService.findAll({ page: 1, limit: 7 }),
    ]);

    const sections: string[] = [];

    if (dashboard.status === 'fulfilled') {
      sections.push(
        this.formatSection('PRIVATE HEALTH DASHBOARD', dashboard.value, 10000),
      );
    }

    if (entries.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'RECENT PRIVATE HEALTH ENTRIES',
          entries.value,
          10000,
        ),
      );
    }

    return sections;
  }

  private async privateSection(
    label: string,
    resolver: () => Promise<unknown>,
    maximumCharacters: number,
  ) {
    const data = await this.safeResolve(resolver);
    return this.sectionIfUseful(label, data, maximumCharacters);
  }

  private toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getModeSections(mode: HsakaaMode, message: string) {
    switch (mode) {
      case HsakaaMode.COMPANIES:
        return this.getCompaniesSections(message);

      case HsakaaMode.JOURNAL:
        return this.getJournalSections(message);

      case HsakaaMode.LIBRARY:
        return this.getLibrarySections(message);

      case HsakaaMode.HEALTH:
      case HsakaaMode.MEDIA:
        return [];

      case HsakaaMode.MEMORY:
        return [];

      case HsakaaMode.CHAT:
      default:
        return this.getGeneralSections(message);
    }
  }

  private async getGeneralSections(message: string) {
    const results = await Promise.allSettled([
      this.getCompaniesData(message, 3),
      this.getJournalData(message, 2),
      this.getLibraryData(message, 3),
    ]);

    const labels = [
      'PUBLIC COMPANIES',
      'PUBLIC JOURNAL',
      'PUBLIC READ BOOK EVIDENCE',
    ];

    return results.flatMap((result, index) => {
      if (result.status !== 'fulfilled' || !this.hasUsefulData(result.value)) {
        return [];
      }

      return [this.formatSection(labels[index], result.value, 5000)];
    });
  }

  private async getCompaniesSections(message: string) {
    const data = await this.safeResolve(() =>
      this.getCompaniesData(message, 6),
    );

    return this.sectionIfUseful('PUBLIC COMPANIES', data, 8000);
  }

  private async getJournalSections(message: string) {
    const data = await this.safeResolve(() => this.getJournalData(message, 6));

    return this.sectionIfUseful('PUBLIC JOURNAL', data, 9000);
  }

  private async getLibrarySections(message: string) {
    const data = await this.safeResolve(() => this.getLibraryData(message, 6));

    return this.sectionIfUseful('PUBLIC READ BOOK EVIDENCE', data, 10000);
  }

  private async getMediaSections(message: string) {
    const data = await this.safeResolve(() => this.getMediaData(message, 6));

    return this.sectionIfUseful('PUBLIC MEDIA', data, 8000);
  }

  private async getHealthSections() {
    const [latest, dashboard] = await Promise.allSettled([
      this.healthService.findLatestForPublic(),
      this.healthDashboardService.getDashboard(),
    ]);

    const sections: string[] = [];

    if (latest.status === 'fulfilled' && latest.value) {
      sections.push(
        this.formatSection('LATEST PUBLIC HEALTH', latest.value, 6000),
      );
    }

    if (dashboard.status === 'fulfilled' && dashboard.value) {
      sections.push(
        this.formatSection('PUBLIC HEALTH DASHBOARD', dashboard.value, 8000),
      );
    }

    return sections;
  }

  private async getCompaniesData(message: string, limit: number) {
    const search = this.getSearchTerms(message);

    if (search) {
      const searched = await this.companiesService.findPublic({
        search,
        page: 1,
        limit,
      });

      if (searched.data.length > 0) {
        return searched.data;
      }
    }

    const latest = await this.companiesService.findPublic({
      page: 1,
      limit,
    });

    return latest.data;
  }

  private async getJournalData(
    message: string,
    limit: number,
  ): Promise<unknown[]> {
    const search = this.getSearchTerms(message, 1);

    if (search) {
      const searched = await this.journalService.findPublic({
        search,
        page: 1,
        limit,
      });

      if (searched.data.length > 0) {
        return searched.data;
      }
    }

    const latest = await this.journalService.findPublic({
      page: 1,
      limit,
    });

    return latest.data;
  }

  private async getLibraryData(message: string, limit: number) {
    const search = this.getSearchTerms(message);

    const loadEligibleBooks = async (withSearch: boolean) => {
      const [reading, completed] = await Promise.all([
        this.libraryService.findAll(
          {
            type: LibraryItemType.BOOK,
            status: LibraryItemStatus.READING,
            ...(withSearch && search ? { search } : {}),
            page: 1,
            limit,
          },
          true,
        ),
        this.libraryService.findAll(
          {
            type: LibraryItemType.BOOK,
            status: LibraryItemStatus.COMPLETED,
            ...(withSearch && search ? { search } : {}),
            page: 1,
            limit,
          },
          true,
        ),
      ]);

      const deduplicated = new Map<string, Record<string, unknown>>();

      for (const item of [...reading.data, ...completed.data]) {
        const record = item as unknown as Record<string, unknown>;
        const id = record._id?.toString();

        if (id && !deduplicated.has(id)) {
          deduplicated.set(id, record);
        }
      }

      return [...deduplicated.values()].slice(0, limit);
    };

    let books: Record<string, unknown>[] = [];

    if (search) {
      try {
        books = await loadEligibleBooks(true);
      } catch {
        books = [];
      }
    }

    if (books.length === 0) {
      books = await loadEligibleBooks(false);
    }

    const enriched = await Promise.all(
      books.map(async (book) => {
        const id = book._id?.toString();

        if (!id) {
          return { ...book, publicReferences: [] };
        }

        const [detailsResult, highlightsResult] = await Promise.allSettled([
          this.libraryService.findOne(id, true),
          this.libraryService.getHighlights(id, true),
        ]);

        const details =
          detailsResult.status === 'fulfilled'
            ? (detailsResult.value as unknown as Record<string, unknown>)
            : book;
        const publicReferences =
          highlightsResult.status === 'fulfilled'
            ? highlightsResult.value.slice(0, 8)
            : [];

        return {
          ...details,
          publicReferences,
        };
      }),
    );

    return enriched;
  }

  private async getMediaData(message: string, limit: number) {
    const search = this.getSearchTerms(message);

    if (search) {
      try {
        const searched = await this.mediaService.findAll(
          {
            search,
            page: 1,
            limit,
          },
          true,
        );

        if (searched.data.length > 0) {
          return searched.data;
        }
      } catch {
        // Fall through to latest posted media.
      }
    }

    const latest = await this.mediaService.findAll(
      {
        page: 1,
        limit,
      },
      true,
    );

    return latest.data;
  }

  private sanitizePublicNow(value: unknown) {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const safe = { ...(value as Record<string, unknown>) };
    const source = typeof safe.source === 'string' ? safe.source : '';

    if (source === 'health' || source === 'whoop') {
      return null;
    }

    delete safe.health;
    delete safe.energyScore;

    return safe;
  }

  private async safeResolve<T>(resolver: () => Promise<T>): Promise<T | null> {
    try {
      return await resolver();
    } catch {
      return null;
    }
  }

  private sectionIfUseful(
    label: string,
    data: unknown,
    maximumCharacters: number,
  ) {
    if (!this.hasUsefulData(data)) {
      return [];
    }

    return [this.formatSection(label, data, maximumCharacters)];
  }

  private hasUsefulData(data: unknown) {
    if (Array.isArray(data)) {
      return data.length > 0;
    }

    return data !== null && data !== undefined;
  }

  private formatMemorySection(
    memories: Array<{
      _id: Types.ObjectId;
      content: string;
      type: string;
      source: string;
      tags?: string[];
      importance?: number;
      confidence?: number;
      retrievalScore: number;
    }>,
    label = 'PUBLIC MEMORY CONTEXT',
  ) {
    const lines = memories.map((memory, index) =>
      [
        `${index + 1}. ${memory.content}`,
        `type=${memory.type}`,
        `source=${memory.source}`,
        memory.tags?.length ? `tags=${memory.tags.join(',')}` : null,
        `importance=${memory.importance ?? 0.5}`,
        `confidence=${memory.confidence ?? 0.5}`,
        `retrievalScore=${memory.retrievalScore}`,
      ]
        .filter(Boolean)
        .join(' | '),
    );

    return [label, ...lines].join('\n');
  }

  private formatSection(
    label: string,
    data: unknown,
    maximumCharacters: number,
  ) {
    const serialized = JSON.stringify(data, null, 2);

    const clipped =
      serialized.length > maximumCharacters
        ? `${serialized.slice(0, maximumCharacters)}\n...[truncated]`
        : serialized;

    return `${label}\n${clipped}`;
  }

  private getSearchTerms(message: string, maximumTerms = 6) {
    const stopWords = new Set([
      'aakash',
      'about',
      'anything',
      'does',
      'from',
      'have',
      'hsakaa',
      'into',
      'most',
      'right',
      'that',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'would',
    ]);

    return tokenizeUnicodeText(message, {
      stopWords,
      minimumLength: 2,
    })
      .slice(0, maximumTerms)
      .join(' ');
  }
}
