import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  HsakaaUniversalSearchDto,
  UniversalSearchIndexSyncDto,
  UniversalSearchQueryDto,
} from './dto/universal-search.dto';
import { UniversalSearchService } from './universal-search.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/search')
export class UniversalSearchController {
  constructor(private readonly searchService: UniversalSearchService) {}

  @Get()
  search(@Query() query: UniversalSearchQueryDto) {
    return this.searchService.search(query);
  }

  @Get('index-status')
  getIndexStatus() {
    return this.searchService.getIndexStatus();
  }

  @Post('sync')
  sync(@Body() dto: UniversalSearchIndexSyncDto) {
    return this.searchService.syncIndex(dto);
  }

  @Post('hsakaa')
  searchForHsakaa(@Body() dto: HsakaaUniversalSearchDto) {
    return this.searchService.searchForHsakaa(dto);
  }
}
