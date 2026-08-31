import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  DraftMediaEngagementReplyDto,
  MediaEngagementListQueryDto,
  SendMediaEngagementReplyDto,
  SyncMediaEngagementDto,
  UpdateMediaEngagementStatusDto,
} from './dto/media-engagement.dto';
import { MediaEngagementService } from './media-engagement.service';

@Controller('media/core/engagement')
export class MediaEngagementController {
  constructor(private readonly engagementService: MediaEngagementService) {}

  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.engagementService.overview(days ? Number(days) : 30);
  }

  @Get('items')
  list(@Query() query: MediaEngagementListQueryDto) {
    return this.engagementService.list(query);
  }

  @Get('items/:itemId')
  getItem(@Param('itemId') itemId: string) {
    return this.engagementService.getItem(itemId);
  }

  @Post('sync')
  syncAll(@Body() dto: SyncMediaEngagementDto) {
    return this.engagementService.syncAll(dto.limitPerAccount ?? 100);
  }

  @Post('accounts/:accountId/sync')
  syncAccount(
    @Param('accountId') accountId: string,
    @Body() dto: SyncMediaEngagementDto,
  ) {
    return this.engagementService.syncAccount(
      accountId,
      dto.limitPerAccount ?? 100,
    );
  }

  @Post('items/:itemId/draft')
  draftReply(
    @Param('itemId') itemId: string,
    @Body() dto: DraftMediaEngagementReplyDto,
  ) {
    return this.engagementService.draftReply(itemId, dto);
  }

  @Post('items/:itemId/reply')
  sendReply(
    @Param('itemId') itemId: string,
    @Body() dto: SendMediaEngagementReplyDto,
  ) {
    return this.engagementService.sendReply(itemId, dto.text);
  }

  @Patch('items/:itemId/status')
  updateStatus(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMediaEngagementStatusDto,
  ) {
    return this.engagementService.updateStatus(itemId, dto.status);
  }
}
