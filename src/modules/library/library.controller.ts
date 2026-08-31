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

import { AddLibraryTextItemDto } from './dto/add-library-text-item.dto';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { LibraryQueryDto } from './dto/library-query.dto';
import { RateLibraryItemDto } from './dto/rate-library-item.dto';
import { SyncAppleBooksDto } from './dto/sync-apple-books.dto';
import { SyncAppleBooksHighlightsDto } from './dto/sync-apple-books-highlights.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { UpdateLibraryProgressDto } from './dto/update-library-progress.dto';
import { UpdateLibraryStatusDto } from './dto/update-library-status.dto';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post()
  create(
    @Body()
    dto: CreateLibraryItemDto,
  ) {
    return this.libraryService.create(dto);
  }

  @Post('apple-books/sync')
  syncAppleBooks(
    @Body()
    dto: SyncAppleBooksDto,
  ) {
    return this.libraryService.syncAppleBooks(dto);
  }

  @Get('public')
  @Public()
  findPublic(
    @Query()
    query: LibraryQueryDto,
  ) {
    return this.libraryService.findAll(query, true);
  }

  @Get('public/slug/:slug')
  @Public()
  findPublicViaSlug(
    @Param('slug')
    slug: string,
  ) {
    return this.libraryService.findOneViaSlug(slug, true);
  }

  @Get('public/:libraryItemId/highlights')
  @Public()
  getPublicHighlights(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.getHighlights(libraryItemId, true);
  }

  @Get()
  findAll(
    @Query()
    query: LibraryQueryDto,
  ) {
    return this.libraryService.findAll(query);
  }

  @Get('summary')
  getSummary() {
    return this.libraryService.getSummary();
  }

  @Get('recent-activity')
  getRecentActivity(
    @Query('limit')
    limit?: string,
  ) {
    return this.libraryService.getRecentActivity(limit ? Number(limit) : 10);
  }

  @Get('slug/:slug')
  findOneViaSlug(
    @Param('slug')
    slug: string,
  ) {
    return this.libraryService.findOneViaSlug(slug);
  }

  @Post('apple-books/highlights/sync')
  syncAppleBooksHighlights(
    @Body()
    dto: SyncAppleBooksHighlightsDto,
  ) {
    return this.libraryService.syncAppleBooksHighlights(dto);
  }

  @Get(':libraryItemId/highlights')
  getHighlights(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.getHighlights(libraryItemId);
  }

  @Get(':libraryItemId')
  findOne(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.findOne(libraryItemId);
  }

  @Post('covers/update')
  updateMissingCoverImages() {
    return this.libraryService.updateMissingCoverImages();
  }

  @Patch(':libraryItemId')
  update(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryItemDto,
  ) {
    return this.libraryService.update(libraryItemId, dto);
  }

  @Patch(':libraryItemId/progress')
  updateProgress(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryProgressDto,
  ) {
    return this.libraryService.updateProgress(libraryItemId, dto);
  }

  @Patch(':libraryItemId/status')
  updateStatus(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryStatusDto,
  ) {
    return this.libraryService.updateStatus(libraryItemId, dto);
  }

  @Patch(':libraryItemId/rating')
  rate(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: RateLibraryItemDto,
  ) {
    return this.libraryService.rate(libraryItemId, dto);
  }

  @Patch(':libraryItemId/favourite/toggle')
  toggleFavourite(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.toggleFavourite(libraryItemId);
  }

  @Patch(':libraryItemId/favourite')
  setFavourite(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      isFavourite: boolean;
    },
  ) {
    return this.libraryService.setFavourite(libraryItemId, body.isFavourite);
  }

  @Post(':libraryItemId/takeaways')
  addTakeaway(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.addTakeaway(libraryItemId, dto.value);
  }

  @Delete(':libraryItemId/takeaways')
  removeTakeaway(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.removeTakeaway(libraryItemId, dto.value);
  }

  @Post(':libraryItemId/quotes')
  addQuote(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.addQuote(libraryItemId, dto.value);
  }

  @Delete(':libraryItemId/quotes')
  removeQuote(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.removeQuote(libraryItemId, dto.value);
  }

  @Patch(':libraryItemId/summary')
  updateSummary(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      summary: string;
    },
  ) {
    return this.libraryService.updateSummary(libraryItemId, body.summary);
  }

  @Patch(':libraryItemId/notes')
  updateNotes(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      notes: string;
    },
  ) {
    return this.libraryService.updateNotes(libraryItemId, body.notes);
  }

  @Patch(':libraryItemId/archive')
  archive(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.archive(libraryItemId);
  }

  @Patch(':libraryItemId/restore')
  restore(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.restore(libraryItemId);
  }

  @Delete(':libraryItemId')
  remove(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.remove(libraryItemId);
  }
}
