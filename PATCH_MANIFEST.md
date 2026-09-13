# Health OS V2.6 — Specific Nutrition + Local Product Intelligence + Private S3 (Backend)

Apply after Health OS V2.5 Complete Daily Loop.

## Modified files
- `.env.example`
- `scripts/personal-os-contract-smoke.mjs`
- `src/modules/health/dto/health-planner-setup.dto.ts`
- `src/modules/health/health-planner.controller.ts`
- `src/modules/health/health-planner.service.ts`
- `src/modules/health/health.module.ts`
- `src/modules/health/schemas/health-baseline.schema.ts`
- `src/modules/health/schemas/health-plan-day.schema.ts`
- `src/modules/health/schemas/health-progress-photo.schema.ts`
- `src/modules/health/schemas/health-source-report.schema.ts`
- `src/modules/health/schemas/health-strategy.schema.ts`

## New files
- `src/modules/health/health-market-research.service.ts`
- `src/modules/health/health-object-storage.service.ts`

## Delete files
None.

## Behavior
- Baseline captures location for food practicality and public retail availability checks.
- Health planning requires exact meal ingredients and quantities: actual vegetables/fruits, flour/grain type, rice type, protein source, nuts/seeds when appropriate, preparation and alternatives.
- Health strategy supports supplement keep/add/replace/review/review_stop decisions, while existing supplement schedules remain authoritative and changes require owner approval.
- Medically prescribed items and review_stop recommendations require professional review; no supplement or medication is silently stopped or dose-changed.
- Specific skincare/haircare/supplement candidates may be checked for current local/India availability using public web search with only saved location + product name, not private Health evidence.
- New Health progress photos and uploaded source reports are stored as private S3 objects. MongoDB stores metadata/extracted evidence, not new binary content.
- S3 objects use `x-amz-server-side-encryption: AES256`.
- Existing Mongo-stored Health binaries can be migrated through `POST /hsakaa/private/health-planner/storage/migrate-legacy`.
- Storage status is exposed at `GET /hsakaa/private/health-planner/storage/status`.

## Environment
```env
HEALTH_STORAGE_S3_BUCKET=
HEALTH_STORAGE_S3_REGION=ap-south-1
HEALTH_STORAGE_S3_PREFIX=personal-os/health
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Optional when using temporary AWS credentials
AWS_SESSION_TOKEN=
```

The IAM principal should be limited to the configured Health prefix and allowed only the required S3 object actions.
