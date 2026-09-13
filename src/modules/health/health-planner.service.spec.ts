import {
  HEALTH_PLAN_SCHEMA,
  HEALTH_STRATEGY_SCHEMA,
  HealthPlannerService,
  isCurrentHealthPlanDayShape,
} from './health-planner.service';
import {
  HEALTH_PHOTO_ANALYSIS_SCHEMA,
  HEALTH_SOURCE_REPORT_ANALYSIS_SCHEMA,
} from './health-vision.service';

function assertStrictObjectSchemas(schema: unknown) {
  if (!schema || typeof schema !== 'object') return;

  const record = schema as Record<string, unknown>;
  if (record.type === 'object') {
    const properties =
      record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : {};
    const required = Array.isArray(record.required)
      ? new Set(
          record.required.filter(
            (value): value is string => typeof value === 'string',
          ),
        )
      : new Set<string>();

    expect(record.additionalProperties).toBe(false);
    expect([...Object.keys(properties)].sort()).toEqual([...required].sort());
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === 'required' || key === 'enum') continue;
    if (Array.isArray(child)) {
      child.forEach((item) => assertStrictObjectSchemas(item));
      continue;
    }
    assertStrictObjectSchemas(child);
  }
}

describe('Health OS v2 structured output schemas', () => {
  it('keeps every rolling-plan strict object property in required', () => {
    assertStrictObjectSchemas(HEALTH_PLAN_SCHEMA);
  });

  it('keeps every strategy strict object property in required', () => {
    assertStrictObjectSchemas(HEALTH_STRATEGY_SCHEMA);
  });

  it('keeps every photo-analysis strict object property in required', () => {
    assertStrictObjectSchemas(HEALTH_PHOTO_ANALYSIS_SCHEMA);
  });

  it('keeps every source-report-analysis strict object property in required', () => {
    assertStrictObjectSchemas(HEALTH_SOURCE_REPORT_ANALYSIS_SCHEMA);
  });

  it('requires at least one exact food item in every meal', () => {
    const root = HEALTH_PLAN_SCHEMA as {
      properties: {
        days: {
          items: {
            properties: {
              nutrition: {
                properties: {
                  meals: {
                    items: {
                      properties: {
                        items: { minItems?: number };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };

    const minItems =
      root.properties.days.items.properties.nutrition.properties.meals.items
        .properties.items.minItems;

    expect(minItems).toBe(1);
  });

  it('requires exact exercise prescription fields', () => {
    const root = HEALTH_PLAN_SCHEMA as {
      properties: {
        days: {
          items: {
            properties: {
              training: {
                properties: {
                  exercises: {
                    items: { required: string[] };
                  };
                };
              };
            };
          };
        };
      };
    };

    const required =
      root.properties.days.items.properties.training.properties.exercises.items
        .required;

    expect(required).toEqual(
      expect.arrayContaining([
        'name',
        'sets',
        'reps',
        'rir',
        'rpe',
        'restSeconds',
        'tempo',
      ]),
    );
  });
});

describe('HealthPlannerService V2.6 storage/legacy safeguards', () => {
  it('builds an exact seven-day rolling window including today', () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const internal = service as unknown as {
      buildDateKeys: (start: string, aheadDays: number) => string[];
    };

    expect(internal.buildDateKeys('2026-09-09', 7)).toEqual([
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  it('rolls coverage daily without regenerating existing planned days', async () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const ensureRollingWindow = jest.fn().mockResolvedValue({});
    Object.assign(service as unknown as Record<string, unknown>, {
      getSetup: jest.fn().mockResolvedValue({ readiness: { planReady: true } }),
      ensureRollingWindow,
    });

    await service.dailyRefreshCron();

    expect(ensureRollingWindow).toHaveBeenCalledWith({
      aheadDays: 7,
      forceRefresh: false,
      refreshStale: false,
      reason: 'daily_health_roll',
    });
  });

  it('treats a pre-V2.6 day without movement blocks as structurally stale', () => {
    expect(
      isCurrentHealthPlanDayShape({
        dateKey: '2026-09-02',
        training: {},
        nutrition: {},
      }),
    ).toBe(false);
    expect(
      isCurrentHealthPlanDayShape({
        morningConditioning: {
          type: 'walk',
          durationMinutes: 20,
          intensity: 'easy',
          when: '07:00',
        },
        training: { title: 'Strength', when: '19:00', durationMinutes: 45 },
        normalWalk: {
          type: 'walk',
          durationMinutes: 20,
          intensity: 'easy',
          when: '20:30',
        },
        nutrition: { focus: 'balanced', meals: [], performanceNutrition: [] },
        meditation: { type: 'breathing', durationMinutes: 10 },
        sleep: { targetHours: 8 },
        skincare: { morning: [], evening: [] },
        bodyCare: { morning: [], evening: [] },
        haircare: { routine: [] },
        intimateCare: { routine: [] },
        stepsTarget: 7000,
        checkIns: [],
        signals: [],
        guardrails: [],
      }),
    ).toBe(true);
  });

  it('deletes an uploaded S3 object if legacy Mongo migration metadata update fails', async () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const legacyPhoto = {
      _id: 'photo-1',
      originalName: 'legacy.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from('legacy-bytes'),
    };
    const findPhotos = {
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([legacyPhoto]),
    };
    const objectStorage = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildObjectKey: jest.fn().mockReturnValue('owner/photos/probe.jpg'),
      putObject: jest.fn().mockResolvedValue({
        provider: 's3',
        bucket: 'health-private',
        key: 'owner/photos/probe.jpg',
        etag: 'etag',
        uploadedAt: new Date(),
      }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    Object.assign(service as unknown as Record<string, unknown>, {
      objectStorage,
      runtimeLeases: {
        acquire: jest.fn().mockResolvedValue({ key: 'lease' }),
        release: jest.fn().mockResolvedValue(undefined),
      },
      photoModel: {
        find: jest.fn().mockReturnValue(findPhotos),
        updateOne: jest.fn().mockRejectedValue(new Error('mongo write failed')),
      },
      sourceReportModel: {
        find: jest.fn(),
      },
    });

    await expect(service.migrateLegacyStorage()).rejects.toThrow(
      'mongo write failed',
    );
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(
      'owner/photos/probe.jpg',
    );
  });
  it('requires a buyable candidate only for add/replace recommendations', () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const internal = service as unknown as {
      findRecommendationNamingIssues: (strategy: unknown) => string[];
    };

    expect(
      internal.findRecommendationNamingIssues({
        productRecommendations: [
          {
            action: 'keep',
            domain: 'skincare',
            slot: 'cleanser',
            suggestedProductName: '',
          },
          {
            action: 'review',
            domain: 'haircare',
            slot: 'shampoo',
            suggestedProductName: '',
          },
        ],
        supplementRecommendations: [
          {
            action: 'keep',
            category: 'Vitamin D3',
            suggestedProductName: '',
          },
          {
            action: 'review_stop',
            category: 'Omega-3',
            suggestedProductName: '',
          },
        ],
      }),
    ).toEqual([]);

    const issues = internal.findRecommendationNamingIssues({
      productRecommendations: [
        {
          action: 'replace',
          domain: 'skincare',
          slot: 'moisturizer',
          suggestedProductName: '',
        },
      ],
      supplementRecommendations: [
        {
          action: 'add',
          category: 'Creatine',
          suggestedProductName: '',
        },
      ],
    });

    expect(issues).toHaveLength(2);
    expect(issues.join(' ')).toContain('moisturizer');
    expect(issues.join(' ')).toContain('Creatine');
  });

  it('requires complete daily performance nutrition and tagged care routines', () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const internal = service as unknown as {
      findDailyRegimenCompletenessIssues: (plan: unknown) => string[];
    };

    const completeDay = {
      dateKey: '2026-09-02',
      nutrition: {
        performanceNutrition: [
          {
            category: 'creatine',
            action: 'review',
            status: 'review_required',
            item: 'Creatine monohydrate',
          },
          {
            category: 'protein_powder',
            action: 'not_needed',
            status: 'not_needed_today',
            item: 'Protein powder not needed today',
          },
        ],
      },
      skincare: {
        morning: [
          '[BUY] Gentle cleanser',
          '[REVIEW] Vitamin C treatment decision',
          '[BUY] Lightweight moisturiser',
          '[BUY] SPF 50 sunscreen',
        ],
        evening: [
          '[BUY] Gentle cleanser',
          '[REVIEW] Recovery night',
          '[BUY] Barrier moisturiser',
        ],
      },
      bodyCare: {
        morning: ['[BUY] Body moisturiser', '[BUY] Exposed-body SPF 50'],
        evening: ['[BUY] Gentle body cleanser', '[BUY] Body moisturiser'],
      },
      haircare: {
        routine: ['[BUY] Gentle shampoo', '[BUY] Conditioner'],
      },
    };

    expect(
      internal.findDailyRegimenCompletenessIssues({ days: [completeDay] }),
    ).toEqual([]);

    const issues = internal.findDailyRegimenCompletenessIssues({
      days: [
        {
          ...completeDay,
          nutrition: { performanceNutrition: [] },
          skincare: { morning: ['Cleanser'], evening: ['Moisturiser'] },
          bodyCare: { morning: [], evening: [] },
          haircare: { routine: ['Shampoo'] },
        },
      ],
    });

    expect(issues.join(' ')).toContain('creatine');
    expect(issues.join(' ')).toContain('protein_powder');
    expect(issues.join(' ')).toContain('sunscreen');
    expect(issues.join(' ')).toContain('[OWNED]');
    expect(issues.join(' ')).toContain('body care AM');
  });

  it('matches configured supplements by ingredient identity without requiring dosage text', () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    const internal = service as unknown as {
      findSupplementCoverageIssues: (
        strategy: unknown,
        configured: unknown,
      ) => string[];
    };

    const issues = internal.findSupplementCoverageIssues(
      {
        supplementRecommendations: [
          {
            action: 'keep',
            category: 'Vitamin D3',
            currentSupplement: 'Vitamin D3',
            suggestedProductName: '',
            suggestedBrand: '',
          },
          {
            action: 'keep',
            category: 'Vitamin B12',
            currentSupplement: 'B12',
            suggestedProductName: '',
            suggestedBrand: '',
          },
          {
            action: 'keep',
            category: 'Omega-3',
            currentSupplement: 'Fish oil EPA DHA',
            suggestedProductName: '',
            suggestedBrand: '',
          },
          {
            action: 'review',
            category: 'Creatine',
            currentSupplement: '',
            suggestedProductName: 'Creatine monohydrate',
            suggestedBrand: '',
          },
          {
            action: 'review',
            category: 'Protein powder',
            currentSupplement: '',
            suggestedProductName: 'Plant protein powder',
            suggestedBrand: '',
          },
        ],
      },
      [
        { name: 'Vitamin D3 60000 IU', category: 'Vitamin D' },
        { name: 'Methylcobalamin 1000 mcg', category: 'Vitamin B12' },
        { name: 'Omega 3 Fish Oil 1000 mg', category: 'Omega-3' },
      ],
    );

    expect(issues).toEqual([]);
  });

  it('splits an eight-day rolling generation into two-day AI batches', async () => {
    const service = Object.create(
      HealthPlannerService.prototype,
    ) as HealthPlannerService;
    let inFlight = 0;
    let maxInFlight = 0;
    const generatePlanDays = jest
      .fn()
      .mockImplementation(async (dateKeys: string[]) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          data: { days: dateKeys.map((dateKey) => ({ dateKey })) },
          model: 'test-model',
          responseId: `resp-${dateKeys[0]}`,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cachedInputTokens: 0,
            reasoningTokens: 0,
          },
        };
      });
    Object.assign(service as unknown as Record<string, unknown>, {
      generatePlanDays,
    });
    const internal = service as unknown as {
      generatePlanDayBatches: (
        dateKeys: string[],
        contextJson: string,
        strategy: unknown,
        reason: string,
      ) => Promise<Array<{ data: { days: Array<{ dateKey: string }> } }>>;
    };
    const dateKeys = [
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ];

    const batches = await internal.generatePlanDayBatches(
      dateKeys,
      '{}',
      {},
      'owner_refresh',
    );

    expect(generatePlanDays).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(2);
    expect(generatePlanDays).toHaveBeenNthCalledWith(
      1,
      dateKeys.slice(0, 2),
      '{}',
      {},
      'owner_refresh',
    );
    expect(generatePlanDays).toHaveBeenNthCalledWith(
      2,
      dateKeys.slice(2, 4),
      '{}',
      {},
      'owner_refresh',
    );
    expect(generatePlanDays).toHaveBeenNthCalledWith(
      3,
      dateKeys.slice(4, 6),
      '{}',
      {},
      'owner_refresh',
    );
    expect(generatePlanDays).toHaveBeenNthCalledWith(
      4,
      dateKeys.slice(6, 8),
      '{}',
      {},
      'owner_refresh',
    );
    expect(
      batches.flatMap((batch) => batch.data.days.map((day) => day.dateKey)),
    ).toEqual(dateKeys);
  });
});
