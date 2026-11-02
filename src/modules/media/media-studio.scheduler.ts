import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaStudioService } from './media-studio.service';

@Injectable()
export class MediaStudioScheduler {
  private readonly logger=new Logger(MediaStudioScheduler.name);
  constructor(private readonly studio:MediaStudioService){}
  /** Always keep today plus seven complete future calendar dates in scope. */
  @Cron('0 5 5 * * *',{timeZone:'Asia/Kolkata'})
  async keepAhead() {
    try { await this.studio.generateRolling(); }
    catch(error) {this.logger.error(error instanceof Error?error.stack:String(error));}
  }
}
