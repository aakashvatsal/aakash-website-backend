import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AdminGuard,
} from '../../common/guards/admin.guard';

import {
  CreateMediaPostDto,
} from './dto/create-media-post.dto';

import {
  SyncMediaMetricsDto,
} from './dto/sync-media-metrics.dto';

import {
  UpdateMediaOutcomeDto,
} from './dto/update-media-outcome.dto';

import {
  UpdateMediaPostDto,
} from './dto/update-media-post.dto';

import {
  MediaService,
} from './media.service';

import {
  MediaPlatform,
  MediaPostStatus,
} from './schemas/media-post.schema';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService:
      MediaService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto: CreateMediaPostDto,
  ) {
    return this.mediaService.create(
      dto,
    );
  }

  @Get()
  findAll(
    @Query('platform')
    platform?: MediaPlatform,

    @Query('status')
    status?: MediaPostStatus,

    @Query('companyId')
    companyId?: string,

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
        status,
        companyId,
        search,
        page,
        limit,
      },
    );
  }

  @Get(':mediaPostId')
  findOne(
    @Param('mediaPostId')
    mediaPostId: string,
  ) {
    return this.mediaService.findOne(
      mediaPostId,
    );
  }

  @Patch(':mediaPostId')
  @UseGuards(AdminGuard)
  update(
    @Param('mediaPostId')
    mediaPostId: string,

    @Body()
    dto: UpdateMediaPostDto,
  ) {
    return this.mediaService.update(
      mediaPostId,
      dto,
    );
  }

  @Patch(
    ':mediaPostId/outcome',
  )
  @UseGuards(AdminGuard)
  updateOutcome(
    @Param('mediaPostId')
    mediaPostId: string,

    @Query('userId')
    userId: string,

    @Body()
    dto: UpdateMediaOutcomeDto,
  ) {
    return this.mediaService.updateOutcome(
      mediaPostId,
      userId,
      dto,
    );
  }

  @Post(
    ':mediaPostId/sync-metrics',
  )
  @UseGuards(AdminGuard)
  syncMetrics(
    @Param('mediaPostId')
    mediaPostId: string,

    @Query('userId')
    userId: string,

    @Body()
    dto: SyncMediaMetricsDto,
  ) {
    return this.mediaService.syncMetrics(
      mediaPostId,
      userId,
      dto.period,
    );
  }

  @Get(
    ':mediaPostId/metrics',
  )
  getMetricHistory(
    @Param('mediaPostId')
    mediaPostId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.mediaService.getMetricHistory(
      mediaPostId,
      userId,
    );
  }

  @Patch(
    ':mediaPostId/archive',
  )
  @UseGuards(AdminGuard)
  archive(
    @Param('mediaPostId')
    mediaPostId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.mediaService.archive(
      mediaPostId,
      userId,
    );
  }

  @Delete(':mediaPostId')
  @UseGuards(AdminGuard)
  remove(
    @Param('mediaPostId')
    mediaPostId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.mediaService.remove(
      mediaPostId,
      userId,
    );
  }
}