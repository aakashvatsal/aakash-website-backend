import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { MediaStudioService } from './media-studio.service';
import { MediaStudioReleaseService } from './media-studio-release.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('media/studio')
export class MediaStudioController {
  constructor(private readonly studio: MediaStudioService, private readonly release: MediaStudioReleaseService) {}
  @Get() overview() { return this.studio.overview(); }
  @Get('release') releaseOverview() { return this.release.overview(); }
  @Get('release/analytics') releaseAnalytics() { return this.release.analytics(); }
  @Post('posts/:date/:id/handoff') handoff(@Param('date') date:string,@Param('id') id:string) {return this.release.handoff(date,id);}
  @Get('growth') growth() { return this.studio.growth(); }
  @Post('generate') generate(@Body() body: {date?:string;replace?:boolean}={}) {
    return body.date ? this.studio.generateDate(body.date,body.replace===true) : this.studio.generateRolling();
  }
  @Post('posts/:date/:id/improve')
  improve(@Param('date') date:string,@Param('id') id:string) {return this.studio.improvePost(date,id);}
  @Patch('posts/:date/:id') update(
    @Param('date') date:string,@Param('id') id:string,
    @Body() body:{status?:string;title?:string;hook?:string;script?:string;copy?:string;caption?:string},
  ){ return this.studio.updatePost(date,id,body); }
}
