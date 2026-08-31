import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

import { CreateMediaPostDto } from './dto/create-media-post.dto';

import { SyncMediaMetricsDto } from './dto/sync-media-metrics.dto';

import { UpdateMediaOutcomeDto } from './dto/update-media-outcome.dto';

import { UpdateMediaPostDto } from './dto/update-media-post.dto';

import { MediaService } from './media.service';
import { MediaAnalyticsService } from './services/media-analytics.service';

import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaAnalyticsService: MediaAnalyticsService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateMediaPostDto,
  ) {
    return this.mediaService.create(dto);
  }

  @Get('analytics/providers')
  getAnalyticsProviderStatus() {
    return this.mediaAnalyticsService.getProviderStatus();
  }

  @Get('public')
  @Public()
  findPublic(
    @Query('platform')
    platform?: MediaPlatform,

    @Query('postType')
    postType?: MediaPostType,

    @Query('contentPillar')
    contentPillar?: string,

    @Query('search')
    search?: string,

    @Query('page')
    page?: number,

    @Query('limit')
    limit?: number,
  ) {
    return this.mediaService.findAll(
      {
        platform,
        postType,
        contentPillar,
        search,
        page,
        limit,
      },
      true,
    );
  }

  @Get()
  findAll(
    @Query('platform')
    platform?: MediaPlatform,

    @Query('status')
    status?: MediaPostStatus,

    @Query('postType')
    postType?: MediaPostType,

    @Query('contentPillar')
    contentPillar?: string,

    @Query('companyId')
    companyId?: string,

    @Query('search')
    search?: string,

    @Query('page')
    page?: number,

    @Query('limit')
    limit?: number,
  ) {
    return this.mediaService.findAll({
      platform,
      status,
      postType,
      contentPillar,
      companyId,
      search,
      page,
      limit,
    });
  }

  @Get(':mediaPostId')
  findOne(
    @Param('mediaPostId')
    mediaPostId: string,
  ) {
    return this.mediaService.findOne(mediaPostId);
  }

  @Patch(':mediaPostId')
  update(
    @Param('mediaPostId')
    mediaPostId: string,

    @Body()
    dto: UpdateMediaPostDto,
  ) {
    return this.mediaService.update(mediaPostId, dto);
  }

  @Patch(':mediaPostId/outcome')
  updateOutcome(
    @Param('mediaPostId')
    mediaPostId: string,

    @Body()
    dto: UpdateMediaOutcomeDto,
  ) {
    return this.mediaService.updateOutcome(mediaPostId, dto);
  }

  @Post(':mediaPostId/sync-metrics')
  syncMetrics(
    @Param('mediaPostId')
    mediaPostId: string,

    @Body()
    dto: SyncMediaMetricsDto,
  ) {
    return this.mediaService.syncMetrics(mediaPostId, dto.period);
  }

  @Get(':mediaPostId/metrics')
  getMetricHistory(
    @Param('mediaPostId')
    mediaPostId: string,
  ) {
    return this.mediaService.getMetricHistory(mediaPostId);
  }

  @Patch(':mediaPostId/archive')
  archive(
    @Param('mediaPostId')
    mediaPostId: string,
  ) {
    return this.mediaService.archive(mediaPostId);
  }

  @Delete(':mediaPostId')
  remove(
    @Param('mediaPostId')
    mediaPostId: string,
  ) {
    return this.mediaService.remove(mediaPostId);
  }
}
