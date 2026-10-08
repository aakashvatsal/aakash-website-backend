import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { MediaSeriesService } from './media-series.service';
import type { SeriesPitch, SeriesDesignReview } from './media-series-design';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('media/core/series')
export class MediaSeriesController {
  constructor(private readonly service: MediaSeriesService) {}
  @Get() overview(@Query('days') days?: string) { return this.service.overview(Number(days) || 90); }
  @Post('suggest') suggest(@Body() body: { direction?: string } = {}) { return this.service.suggestSeries(body.direction); }
  @Post('design') design(@Body() pitch: SeriesPitch) { return this.service.designSeries(pitch); }
  @Post('create') create(@Body() pitch: SeriesPitch & { design?: SeriesDesignReview }) { return this.service.createSeries(pitch); }
  @Patch(':key/status') status(@Param('key') key: string, @Body() body: { status: string; rationale?: string }) {
    return this.service.setStatus(key, body.status, body.rationale);
  }
  @Get('recommendations') recommendations(@Query('days') days?: string) { return this.service.recommendations(Number(days) || 90); }
  @Get('trends') trends() { return this.service.trendSignals(); }
  @Post('review') review(@Body() body: { apply?: boolean } = {}) {
    return this.service.reviewPortfolio(body.apply === true);
  }
  @Post('assign') assign(@Body() body: { contentId: string; seriesKey: string }) {
    return this.service.assign(body.contentId, body.seriesKey);
  }
}
