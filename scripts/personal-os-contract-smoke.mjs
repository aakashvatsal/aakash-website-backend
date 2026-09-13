import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function text(path) {
  const absolute = resolve(root, path);
  check(
    `file:${path}`,
    existsSync(absolute),
    'required integration file is missing',
  );
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function compactSource(value) {
  return value.replace(/\s+/g, '');
}

function missingSourceTokens(value, tokens) {
  const compact = compactSource(value);
  return tokens.filter((token) => !compact.includes(compactSource(token)));
}

const appModule = text('src/app.module.ts');
const productionModule = text(
  'src/modules/production-ops/production-ops.module.ts',
);
const integratedOps = text(
  'src/modules/production-ops/integrated-production-ops.service.ts',
);
const systemHealth = text(
  'src/modules/production-ops/personal-os-system-health.service.ts',
);
const closedLoops = text(
  'src/modules/production-ops/personal-os-closed-loop.service.ts',
);
const graphModule = text(
  'src/modules/knowledge-graph/knowledge-graph.module.ts',
);
const healthGraph = text(
  'src/modules/knowledge-graph/health-knowledge-graph-integration.service.ts',
);
const releaseHealth = text(
  'src/modules/release-hardening/release-hardening-health.service.ts',
);

check(
  'ProductionOpsModule registered',
  appModule.includes('ProductionOpsModule'),
);
check(
  'Integrated Production Ops provider active',
  productionModule.includes('useExisting: IntegratedProductionOpsService'),
);
check(
  'System Health included in dashboard',
  integratedOps.includes('systemHealth') &&
    integratedOps.includes('getDashboard'),
);
check(
  'System Health included in RC smoke',
  integratedOps.includes('runRcSmoke') &&
    integratedOps.includes('systemHealth.checks'),
);
check(
  'Closed-loop service registered',
  productionModule.includes(
    'PersonalOsClosedLoopService,\n    IntegratedProductionOpsService',
  ),
);
check(
  'Closed loops included in dashboard and RC smoke',
  integratedOps.includes('closedLoops') &&
    integratedOps.includes('closedLoops.checks') &&
    integratedOps.includes('getDashboard'),
);
check(
  'Core Personal OS modules audited',
  [
    'memory_people',
    'companies',
    'journal_entries',
    'memory',
    'library_items',
    'health_entries',
    'media_posts',
    'tasks',
    'reminders',
  ].every((token) => systemHealth.includes(token)),
);
check(
  'Search coverage audited',
  systemHealth.includes('universal_search_embeddings') &&
    systemHealth.includes('searchCoverage'),
);
check(
  'Advanced Health bridge registered',
  graphModule.includes('HealthKnowledgeGraphIntegrationService'),
);
check(
  'Advanced Health collections wired',
  [
    'health_baselines',
    'health_goals',
    'health_plan_days',
    'health_attention_items',
    'health_progress_photos',
    'health_source_reports',
  ].every((token) => healthGraph.includes(token)),
);
check(
  'Health graph privacy remains owner-only',
  healthGraph.includes('KnowledgeGraphPrivacy.OWNER_ONLY'),
);
check(
  'Closed-loop Health graph edges wired',
  [
    'connected-device evidence',
    'operational Health tasks',
    'latest completed execution review',
    'matching HSAKAA task/reminder',
  ].every((token) => healthGraph.includes(token)),
);
check(
  'Health recovery adaptation loop audited',
  [
    'health_interventions',
    'health_plan_days',
    'health_plan_executions',
    'followUpDueAt',
  ].every((token) => closedLoops.includes(token)),
);
check(
  'Execution review feeds future planning',
  closedLoops.includes('health-execution-learning') &&
    closedLoops.includes('derived_from'),
);
check(
  'Health Attention task lifecycle audited',
  closedLoops.includes('health-attention-resolution') &&
    closedLoops.includes('health:attention:'),
);
check(
  'Proactive evidence confirmation firewall audited',
  closedLoops.includes('proactive-evidence-action') &&
    closedLoops.includes('requiresConfirmation'),
);
check(
  'Medication autonomy safety remains enforced',
  releaseHealth.includes("medication: 'never'"),
);
check(
  'Professional instructions remain locked',
  releaseHealth.includes("professionalInstructions: 'locked'"),
);

const runtimeModule = text(
  'src/modules/personal-os-runtime/personal-os-runtime.module.ts',
);
const runtimeService = text(
  'src/modules/personal-os-runtime/personal-os-runtime.service.ts',
);
const automationGate = text(
  'src/modules/personal-os-runtime/personal-os-automation-gate.service.ts',
);
const morningService = text(
  'src/modules/personal-os-runtime/personal-os-morning.service.ts',
);
const runtimeController = text(
  'src/modules/personal-os-runtime/personal-os-runtime.controller.ts',
);
const hsakaaModule = text('src/hsakaa/hsakaa.module.ts');

check(
  'Runtime Activation module registered',
  appModule.includes('PersonalOsRuntimeModule'),
);
check(
  'Manual runtime pipeline wired',
  [
    'connected-data',
    'current-truth',
    'health-intelligence',
    'allowed-adaptations',
    'tasks-reminders',
    'knowledge-graph',
    'search-context',
    'proactive',
  ].every((token) => runtimeService.includes(token)),
);
check(
  'Runtime Activation defaults keep AI and Health adaptation opt-in',
  runtimeService.includes('allowHealthAdaptation: false') &&
    runtimeService.includes('allowAi: false'),
);
check(
  'Runtime Activation avoids unnecessary Proactive AI',
  runtimeService.includes('meaningfulChanges === 0') &&
    runtimeService.includes('not spend an AI request on a proactive scan'),
);
check(
  'Automatic scheduler gate defaults to manual mode',
  automationGate.includes('PERSONAL_OS_AUTOMATION_ENABLED') &&
    automationGate.includes('deleteCronJob'),
);
check(
  'Runtime Activation imports existing OS engines instead of duplicating them',
  [
    'HealthModule',
    'IntegrationsModule',
    'RemindersModule',
    'KnowledgeGraphModule',
    'UniversalSearchModule',
    'ContextEngineModule',
    'ProactiveModule',
  ].every((token) => runtimeModule.includes(token)),
);

check(
  'Runtime trace serializer guards Mongoose/circular results',
  runtimeService.includes('seen: WeakSet<object> = new WeakSet<object>()') &&
    runtimeService.includes("return '[circular]'") &&
    runtimeService.includes('const mongooseDocument = record._doc;'),
);

check(
  'Morning Operating Loop service registered',
  runtimeModule.includes(
    'PersonalOsRuntimeService,\n    PersonalOsMorningService,',
  ) && runtimeController.includes('morning/run'),
);
check(
  'Morning Operating Loop reuses Runtime Activation',
  morningService.includes('this.runtime.run({') &&
    morningService.includes("'runtime-refresh'"),
);
check(
  'Morning Operating Loop assembles Health, reminders and proactive attention',
  morningService.includes('this.healthProactive.getMorningBrief()') &&
    morningService.includes('this.reminders.getToday()') &&
    morningService.includes('this.proactive.getDashboard()'),
);
check(
  'Morning brief generation reuses existing HSAKAA brief engine',
  morningService.includes('this.brief.getToday()') &&
    morningService.includes('this.brief.refreshToday()') &&
    hsakaaModule.includes('exports: [HsakaaBriefService]'),
);
check(
  'Morning brief avoids unnecessary regeneration',
  morningService.includes('meaningfulChanges > 0') &&
    morningService.includes('initial.cached === true') &&
    morningService.includes('options.forceBrief'),
);
check(
  'Morning loop remains manual-only in Step 2',
  morningService.includes("mode: 'morning_manual'") &&
    !morningService.includes('@Cron('),
);

const healthModuleV25 = text('src/modules/health/health.module.ts');
const healthPlannerV25 = text('src/modules/health/health-planner.service.ts');
const healthProgressV25 = text('src/modules/health/health-progress.service.ts');
const healthPlanSchemaV25 = text(
  'src/modules/health/schemas/health-plan-day.schema.ts',
);
const healthStrategySchemaV25 = text(
  'src/modules/health/schemas/health-strategy.schema.ts',
);
const healthSourceReportV25 = text(
  'src/modules/health/schemas/health-source-report.schema.ts',
);
const healthVisionV25 = text('src/modules/health/health-vision.service.ts');

check(
  'Health V2.5 uses Products OS as inventory source',
  healthModuleV25.includes('ProductsModule') &&
    healthPlannerV25.includes('ProductsService') &&
    healthPlannerV25.includes('findCurrentProducts()') &&
    healthPlannerV25.includes('getWhatToBuyNext()'),
);
check(
  'Health V2.5 keeps three distinct movement blocks',
  ['morningConditioning', 'normalWalk', 'training'].every((token) =>
    healthPlanSchemaV25.includes(token),
  ) &&
    healthPlannerV25.includes('three distinct daily movement blocks') &&
    healthProgressV25.includes("'morning-conditioning'") &&
    healthProgressV25.includes("'normal-walk'"),
);
check(
  'Health V2.5 supports product-level skin/hair suggestions without silent mutation',
  healthStrategySchemaV25.includes('HealthProductRecommendation') &&
    healthPlannerV25.includes('productRecommendations') &&
    healthPlannerV25.includes('requires owner approval') &&
    healthPlannerV25.includes(
      'never silently adds, replaces or purchases products',
    ),
);
check(
  'Health V2.5 lab follow-up extraction never invents retest timing',
  healthVisionV25.includes('followUpTests') &&
    healthVisionV25.includes('Never infer a retest interval') &&
    healthSourceReportV25.includes('NEEDS_CONFIRMATION'),
);
check(
  'Health V2.5 lab dates become Health tasks and reminders',
  healthPlannerV25.includes('refreshLabFollowUpsForPlannedWindow') &&
    healthProgressV25.includes("'lab'") &&
    healthProgressV25.includes('importantAlertsEnabled'),
);

const healthBaselineV26 = text(
  'src/modules/health/schemas/health-baseline.schema.ts',
);
const healthSetupDtoV26 = text(
  'src/modules/health/dto/health-planner-setup.dto.ts',
);
const healthPlanV26 = text(
  'src/modules/health/schemas/health-plan-day.schema.ts',
);
const healthStrategyV26 = text(
  'src/modules/health/schemas/health-strategy.schema.ts',
);
const healthControllerV26 = text(
  'src/modules/health/health-planner.controller.ts',
);
const healthStorageV26 = text(
  'src/modules/health/health-object-storage.service.ts',
);
const healthMarketV26 = text(
  'src/modules/health/health-market-research.service.ts',
);
const healthModuleV26 = text('src/modules/health/health.module.ts');
const envExampleV26 = text('.env.example');

check(
  'Health V2.6 captures location for practical planning',
  healthBaselineV26.includes('location: Record<string, unknown>') &&
    healthSetupDtoV26.includes('location?: Record<string, unknown>') &&
    healthPlannerV25.includes(
      'Location is planning context for food practicality',
    ),
);
check(
  'Health V2.6 requires specific meal ingredients',
  healthPlanV26.includes("'vegetable'") &&
    healthPlanV26.includes("'grain_flour'") &&
    healthPlanV26.includes("'rice'") &&
    healthPlanV26.includes("'nuts_seeds'") &&
    healthPlannerV25.includes('FOOD SPECIFICITY') &&
    healthPlannerV25.includes('findNutritionSpecificityIssues') &&
    healthPlannerV25.includes(
      'previous plan failed Health-plan completeness validation',
    ) &&
    healthPlannerV25.includes('must state the rice type/variety') &&
    healthPlannerV25.includes('minItems: 1'),
);
check(
  'Health V2.6 supports supplement keep/add/replace/review/review_stop',
  healthStrategyV26.includes("'review_stop'") &&
    healthPlannerV25.includes('review_stop never executes a stop') &&
    healthPlannerV25.includes(
      'Existing supplement schedules are authoritative',
    ),
);
check(
  'Health V2.6 verifies public local product availability without private health context',
  healthMarketV26.includes("type: 'web_search'") &&
    healthMarketV26.includes('Do not use private health context') &&
    healthMarketV26.includes('user_location') &&
    healthModuleV26.includes('HealthMarketResearchService'),
);
const healthStorageRequiredTokens = [
  "provider: 's3'",
  'x-amz-server-side-encryption',
  'AES256',
  'serverFilesystemStorage: false',
  'HEALTH_STORAGE_S3_BUCKET',
];
const missingHealthStorageTokens = missingSourceTokens(
  healthStorageV26,
  healthStorageRequiredTokens,
);
const missingHealthStorageEnvTokens = missingSourceTokens(envExampleV26, [
  'HEALTH_STORAGE_S3_BUCKET=',
  'HEALTH_STORAGE_S3_REGION=',
]);
check(
  'Health V2.6 stores new Health binaries in private S3',
  missingHealthStorageTokens.length === 0 &&
    missingHealthStorageEnvTokens.length === 0,
  [
    missingHealthStorageTokens.length
      ? `storage missing: ${missingHealthStorageTokens.join(', ')}`
      : '',
    missingHealthStorageEnvTokens.length
      ? `env missing: ${missingHealthStorageEnvTokens.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('; '),
);
check(
  'Health V2.6 exposes S3 status and legacy migration',
  healthControllerV26.includes("@Get('storage/status')") &&
    healthControllerV26.includes("@Post('storage/migrate-legacy')") &&
    healthPlannerV25.includes('migrateLegacyStorage()'),
);
check(
  'Health V2.6 does not silently stop supplements',
  healthPlannerV25.includes('review_stop never executes a stop') &&
    healthPlannerV25.includes('requires owner approval') &&
    healthPlannerV25.includes(
      'medically prescribed items and review_stop recommendations require professional review',
    ),
);

const mediaModuleV34 = text('src/modules/media/media.module.ts');
const mediaPlanningV34 = text('src/modules/media/media-planning.service.ts');
const mediaPresenceReviewV34 = text(
  'src/modules/media/schemas/media-presence-review.schema.ts',
);
const mediaAdaptationV34 = text(
  'src/modules/media/media-strategy-adaptation.service.ts',
);
const mediaTodayV34 = text('src/modules/media/media-today.service.ts');
const mediaPresenceSchedulerV34 = text(
  'src/modules/media/media-presence-os.scheduler.ts',
);

check(
  'Media V3.4 keeps permanent Presence strategy changes approval-only',
  mediaPresenceReviewV34.includes('strategyChangeCandidates') &&
    mediaPresenceReviewV34.includes('requiresApproval') &&
    mediaAdaptationV34.includes(
      'Do NOT rewrite the permanent 30/90-day identity strategy',
    ) &&
    mediaAdaptationV34.includes('requiresApproval=true'),
);
check(
  'Media V3.4 feeds weekly adaptation into seven-day planning',
  mediaPlanningV34.includes('adaptationService.planningContext()') &&
    mediaPlanningV34.includes('weeklyPresenceAdaptation') &&
    mediaModuleV34.includes('MediaStrategyAdaptationService'),
);
check(
  'Media V3.4 exposes a unified Today operating view',
  mediaTodayV34.includes('presenceScore') &&
    mediaTodayV34.includes('posts: postExecutions') &&
    mediaTodayV34.includes('skips: skipExecutions') &&
    mediaTodayV34.includes('production') &&
    mediaTodayV34.includes('engagement: day?.engagement') &&
    mediaTodayV34.includes('manualPublishing') &&
    mediaTodayV34.includes('analyticsDue'),
);
check(
  'Media V3.4 keeps publishing and replies approval-controlled',
  mediaTodayV34.includes('inboundRepliesStillRequireApproval: true') &&
    mediaTodayV34.includes('publishingStillRequiresExistingApprovalFlow: true'),
);
check(
  'Media V3.4 automatically rolls daily plans and weekly adaptations',
  mediaPresenceSchedulerV34.includes("@Cron('0 25 6 * * *'") &&
    mediaPresenceSchedulerV34.includes("@Cron('0 50 6 * * 0'") &&
    mediaPresenceSchedulerV34.includes(
      'adaptationService.generate({ force: true })',
    ) &&
    mediaPresenceSchedulerV34.includes(
      'planningService.generate({ force: true })',
    ),
);

const mediaCalendarV35 = text('src/modules/media/media-calendar.service.ts');
const mediaOperationsV35 = text(
  'src/modules/media/media-operations.service.ts',
);
const mediaCoreControllerV35 = text(
  'src/modules/media/media-core.controller.ts',
);

check(
  'Media V3.5 keeps retryable publish failures eligible for bounded retry',
  mediaCalendarV35.includes('publishAttempts: { $lt: MAX_PUBLISH_ATTEMPTS }') &&
    mediaCalendarV35.includes('deliveryStatus: {') &&
    mediaCalendarV35.includes('MediaDeliveryStatus.FAILED') &&
    mediaCalendarV35.includes('MediaPostStatus.SCHEDULED') &&
    mediaCalendarV35.includes('RETRY_DELAY_MINUTES'),
);
check(
  'Media V3.5 never blindly retries ambiguous interrupted direct publishes',
  mediaCalendarV35.includes('async recoverStuckPublishing()') &&
    mediaCalendarV35.includes('MediaDeliveryStatus.MANUAL_REQUIRED') &&
    mediaCalendarV35.includes(
      'Verify the platform for a possible existing post before retrying to avoid a duplicate',
    ) &&
    mediaCalendarV35.includes(
      'bufferHandoffsUseAuthoritativeReconciliation: true',
    ),
);
check(
  'Media V3.5 exposes credential-safe platform operations health',
  mediaOperationsV35.includes('automaticDeliveryReady') &&
    mediaOperationsV35.includes('manualFallbackReady') &&
    mediaOperationsV35.includes(
      'operationsHealthNeverExposesCredentialValues: true',
    ) &&
    mediaOperationsV35.includes('doesNotPublishNewContent: true') &&
    mediaOperationsV35.includes('doesNotSendEngagementReplies: true'),
);
check(
  'Media V3.5 exposes Operations overview and safe repair endpoints',
  mediaCoreControllerV35.includes("@Get('operations/overview')") &&
    mediaCoreControllerV35.includes("@Post('operations/repair-safe')"),
);

const mediaLaunchV36 = text('src/modules/media/media-launch.service.ts');
const mediaLaunchSchemaV36 = text(
  'src/modules/media/schemas/media-launch-state.schema.ts',
);
const mediaPlanningV36 = text('src/modules/media/media-planning.service.ts');
const mediaControllerV36 = text('src/modules/media/media-core.controller.ts');

check(
  'Media V3.6 protects Day-1 exploration from premature optimization',
  mediaLaunchV36.includes('DAYS_1_30_EXPLORATION') &&
    mediaLaunchV36.includes('experimentSharePercent: 35') &&
    mediaLaunchV36.includes('minimumSamplesBeforeConclusion: 5') &&
    mediaLaunchV36.includes('avoidEarlyWinnerLockIn: true') &&
    mediaLaunchV36.includes('preserveVoiceOverOptimization: true'),
);
check(
  'Media V3.6 generates launch profiles for all five primary growth platforms',
  mediaLaunchV36.includes('MediaPlatform.LINKEDIN') &&
    mediaLaunchV36.includes('MediaPlatform.INSTAGRAM') &&
    mediaLaunchV36.includes('MediaPlatform.YOUTUBE') &&
    mediaLaunchV36.includes('MediaPlatform.X') &&
    mediaLaunchV36.includes('MediaPlatform.WHATSAPP') &&
    mediaLaunchSchemaV36.includes('profilePlans'),
);
check(
  'Media V3.6 feeds the real launch phase and calibration policy into weekly planning',
  mediaPlanningV36.includes('launchService.planningContext()') &&
    mediaPlanningV36.includes('learningStage: launchContext.phase') &&
    mediaPlanningV36.includes('launchCalibration: launchContext'),
);
check(
  'Media V3.6 bootstrap builds launch calibration and the first seven-day plan without autonomous publishing',
  mediaControllerV36.includes("@Post('launch/bootstrap')") &&
    mediaControllerV36.includes('planningService.generate({') &&
    mediaLaunchV36.includes(
      'publishingStillRequiresExistingApprovalFlow: true',
    ),
);

const mediaExecutionV37 = text('src/modules/media/media-execution.service.ts');
const mediaExecutionSchemaV37 = text(
  'src/modules/media/schemas/media-daily-execution.schema.ts',
);
const mediaTodayV37 = text('src/modules/media/media-today.service.ts');
const mediaControllerV37 = text('src/modules/media/media-core.controller.ts');

check(
  'Media V3.7 persists daily execution progress instead of losing it on refresh',
  mediaExecutionSchemaV37.includes("collection: 'media_daily_executions'") &&
    mediaExecutionV37.includes('$setOnInsert') &&
    mediaExecutionV37.includes('MediaExecutionStatus.PENDING') &&
    mediaTodayV37.includes('executionProgressIsPersisted: true'),
);
check(
  'Media V3.7 carries unresolved recent work forward without auto-publishing it',
  mediaExecutionV37.includes('carryForward') &&
    mediaExecutionV37.includes('MediaExecutionStatus.MISSED') &&
    mediaExecutionV37.includes('MediaExecutionStatus.BLOCKED') &&
    mediaTodayV37.includes('unfinishedRecentWorkIsCarriedForward: true') &&
    mediaTodayV37.includes('publishingStillRequiresExistingApprovalFlow: true'),
);
check(
  'Media V3.7 exposes explicit done missed blocked and rescheduled execution feedback',
  mediaExecutionSchemaV37.includes("DONE = 'done'") &&
    mediaExecutionSchemaV37.includes("MISSED = 'missed'") &&
    mediaExecutionSchemaV37.includes("BLOCKED = 'blocked'") &&
    mediaExecutionSchemaV37.includes("RESCHEDULED = 'rescheduled'") &&
    mediaControllerV37.includes("@Patch('presence-os/executions/:key')"),
);

const mediaAssetStorageV38 = text(
  'src/modules/media/media-asset-storage.service.ts',
);
const mediaAssetLibraryV38 = text(
  'src/modules/media/media-asset-library.service.ts',
);
const mediaProductionV38 = text(
  'src/modules/media/media-production.service.ts',
);
const mediaPublishingV38 = text(
  'src/modules/media/media-publishing.service.ts',
);
const mediaBufferV38 = text('src/modules/media/media-buffer.service.ts');
const mediaControllerV38 = text('src/modules/media/media-core.controller.ts');

check(
  'Media V3.8 stores reusable production inputs in private S3 without server filesystem storage',
  mediaAssetStorageV38.includes('privateObjects: true') &&
    mediaAssetStorageV38.includes('browserDirectUploads: true') &&
    mediaAssetStorageV38.includes('serverFilesystemStorage: false') &&
    mediaAssetStorageV38.includes("'x-amz-server-side-encryption': 'AES256'"),
);
check(
  'Media V3.8 verifies uploads before reusable assets become ready',
  mediaAssetLibraryV38.includes('headObject(asset.storageKey)') &&
    mediaAssetLibraryV38.includes('MediaAssetStatus.READY') &&
    mediaAssetLibraryV38.includes('libraryReusable: true'),
);
check(
  'Media V3.8 can match and attach existing Library assets to Production requirements',
  mediaProductionV38.includes('assetSuggestions(publicationId: string)') &&
    mediaProductionV38.includes(
      'attachLibraryAsset(requirementAssetId: string, libraryAssetId: string)',
    ) &&
    mediaControllerV38.includes(
      "@Get('production/publications/:publicationId/asset-suggestions')",
    ) &&
    mediaControllerV38.includes(
      "@Post('production/assets/:assetId/attach-library')",
    ),
);
check(
  'Media V3.8 resolves private S3 assets only when publishing providers need them',
  mediaPublishingV38.includes('assetStorage.resolveAssetUrl(asset)') &&
    mediaBufferV38.includes('assetStorage.resolveAssetUrl(asset)') &&
    mediaAssetStorageV38.includes(
      'createReadUrl(key: string, expiresSeconds = 21600)',
    ),
);

const mediaPreflightV39 = text('src/modules/media/media-preflight.service.ts');
const mediaReviewSchemaV39 = text(
  'src/modules/media/schemas/media-publication-review.schema.ts',
);
const mediaCalendarV39 = text('src/modules/media/media-calendar.service.ts');
const mediaControllerV39 = text('src/modules/media/media-core.controller.ts');

check(
  'Media V3.9 requires owner-approved final preflight before schedule or publish',
  mediaPreflightV39.includes(
    'ownerApprovalRequiredBeforeScheduleOrPublish: true',
  ) &&
    mediaPreflightV39.includes('MediaPublicationReviewStatus.APPROVED') &&
    mediaCalendarV39.includes(
      'preflightService.assertApproved(publicationId)',
    ) &&
    mediaControllerV39.includes(
      "@Patch('review/publications/:publicationId/decision')",
    ),
);
check(
  'Media V3.9 invalidates approval when final content production or assets change',
  mediaReviewSchemaV39.includes('sourceFingerprint') &&
    mediaPreflightV39.includes('MediaPublicationReviewStatus.STALE') &&
    mediaPreflightV39.includes('currentFingerprint(publicationId)') &&
    mediaPreflightV39.includes('content, production, or asset changes'),
);
check(
  'Media V3.9 keeps blocking privacy evidence novelty and completeness checks non-bypassable',
  mediaPreflightV39.includes(
    'blockingPrivacyEvidenceNoveltyOrCompletenessChecksCannotBeOverriddenByScheduling: true',
  ) &&
    mediaPreflightV39.includes(
      'Resolve blocking preflight checks before approval',
    ) &&
    mediaPreflightV39.includes('MediaPreflightCheckStatus.BLOCK'),
);


const mediaReleaseV310 = text('src/modules/media/media-release.service.ts');
const mediaPlanningV310 = text('src/modules/media/media-planning.service.ts');
const mediaControllerV310 = text('src/modules/media/media-core.controller.ts');
check(
  'Media V3.10 exposes one end-to-end release candidate audit without publishing or replying',
  mediaReleaseV310.includes('thisAuditNeverPublishesContent: true') &&
    mediaReleaseV310.includes('thisAuditNeverSendsEngagementReplies: true') &&
    mediaReleaseV310.includes('releaseCandidateReady') &&
    mediaControllerV310.includes("@Get('release/overview')") &&
    mediaControllerV310.includes("@Post('release/repair-safe')"),
);
check(
  'Media V3.10 requires an explicit POST or SKIP decision for all five primary platforms every plan day',
  mediaPlanningV310.includes('minItems: 5') &&
    mediaPlanningV310.includes('maxItems: 5') &&
    mediaPlanningV310.includes('every primary platform needs an explicit POST or SKIP decision') &&
    mediaReleaseV310.includes('everyPlanningDayMustExplicitlyPostOrSkipAllFivePrimaryPlatforms: true'),
);
check(
  'Media V3.10 release audit blocks unsafe scheduled content and unresolved data integrity',
  mediaReleaseV310.includes('scheduledWithoutFreshApproval') &&
    mediaReleaseV310.includes('scheduledWithPendingRequiredAssets') &&
    mediaReleaseV310.includes('orphanedPublications') &&
    mediaReleaseV310.includes('releaseReadinessDoesNotOverridePrivacyOrEvidenceBlocks: true'),
);

if (failures) {
  console.error(`\nPersonal OS contract smoke failed: ${failures} check(s).`);
  process.exit(1);
}

console.log(
  '\nPersonal OS contract smoke passed. Runtime DB/graph and autonomous feedback loops should also be verified from HSAKAA → Operations → Run RC smoke.',
);
