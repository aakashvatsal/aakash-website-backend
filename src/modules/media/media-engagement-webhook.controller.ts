import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MediaEngagementService } from './media-engagement.service';
import { MediaPlatform } from './schemas/media-post.schema';

@Controller('media/engagement/webhooks')
export class MediaEngagementWebhookController {
  constructor(private readonly engagementService: MediaEngagementService) {}

  @Get(':platform')
  verify(
    @Param('platform') platform: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    if (
      ![MediaPlatform.INSTAGRAM, MediaPlatform.WHATSAPP].includes(
        platform as MediaPlatform,
      )
    ) {
      return response.status(404).send('Unsupported webhook platform.');
    }
    const value = this.engagementService.verifyWebhook(
      mode,
      verifyToken,
      challenge,
    );
    return response.status(200).send(value);
  }

  @Post(':platform')
  ingest(@Param('platform') platform: string, @Body() payload: unknown) {
    if (
      ![MediaPlatform.INSTAGRAM, MediaPlatform.WHATSAPP].includes(
        platform as MediaPlatform,
      )
    ) {
      return { processed: 0, ignored: true };
    }
    return this.engagementService.ingestWebhook(
      platform as MediaPlatform,
      payload,
    );
  }
}
