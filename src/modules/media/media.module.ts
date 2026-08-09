import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import {
  MediaMetricSnapshot,
  MediaMetricSnapshotSchema,
} from './schemas/media-metric-snapshot.schema';
import {
  MediaPost,
  MediaPostSchema,
} from './schemas/media-post.schema';
import { MediaAnalyticsService } from './services/media-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MediaPost.name,
        schema: MediaPostSchema,
      },
      {
        name: MediaMetricSnapshot.name,
        schema: MediaMetricSnapshotSchema,
      },
    ]),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaAnalyticsService,
  ],
  exports: [
    MediaService,
    MediaAnalyticsService,
  ],
})
export class MediaModule {}