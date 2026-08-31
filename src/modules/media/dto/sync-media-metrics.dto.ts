import { IsEnum, IsOptional } from 'class-validator';

import { MetricSnapshotPeriod } from '../schemas/media-metric-snapshot.schema';

export class SyncMediaMetricsDto {
  @IsOptional()
  @IsEnum(MetricSnapshotPeriod)
  period?: MetricSnapshotPeriod;
}
