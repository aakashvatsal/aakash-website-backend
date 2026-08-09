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
  constructor(
    private readonly libraryService:
      LibraryService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto: CreateLibraryItemDto,
  ) {
    return this.libraryService.create(
      dto,
    );
  }

  @Post('apple-books/sync')
  @UseGuards(AdminGuard)
  syncAppleBooks(
    @Body()
    dto: SyncAppleBooksDto,
  ) {
    return this.libraryService.syncAppleBooks(
      dto,
    );
  }

  @Get()
  findAll(
    @Query()
    query: LibraryQueryDto,
  ) {
    return this.libraryService.findAll(
      query,
    );
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
    return this.libraryService.getRecentActivity(
      limit
        ? Number(limit)
        : 10,
    );
  }

  @Get('slug/:slug')
  findOneViaSlug(
    @Param('slug')
    slug: string,
  ) {
    return this.libraryService.findOneViaSlug(
      slug,
    );
  }

  @Post(
    'apple-books/highlights/sync',
  )
  @UseGuards(AdminGuard)
  syncAppleBooksHighlights(
    @Body()
    dto: SyncAppleBooksHighlightsDto,
  ) {
    return this.libraryService.syncAppleBooksHighlights(
      dto,
    );
  }

  @Get(
    ':libraryItemId/highlights',
  )
  getHighlights(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.getHighlights(
      libraryItemId,
    );
  }

  @Get(':libraryItemId')
  findOne(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.findOne(
      libraryItemId,
    );
  }

  @Post('covers/update')
  @UseGuards(AdminGuard)
  updateMissingCoverImages() {
    return this.libraryService.updateMissingCoverImages();
  }

  @Patch(':libraryItemId')
  @UseGuards(AdminGuard)
  update(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryItemDto,
  ) {
    return this.libraryService.update(
      libraryItemId,
      dto,
    );
  }

  @Patch(
    ':libraryItemId/progress',
  )
  @UseGuards(AdminGuard)
  updateProgress(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryProgressDto,
  ) {
    return this.libraryService.updateProgress(
      libraryItemId,
      dto,
    );
  }

  @Patch(
    ':libraryItemId/status',
  )
  @UseGuards(AdminGuard)
  updateStatus(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: UpdateLibraryStatusDto,
  ) {
    return this.libraryService.updateStatus(
      libraryItemId,
      dto,
    );
  }

  @Patch(
    ':libraryItemId/rating',
  )
  @UseGuards(AdminGuard)
  rate(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: RateLibraryItemDto,
  ) {
    return this.libraryService.rate(
      libraryItemId,
      dto,
    );
  }

  @Patch(
    ':libraryItemId/favourite/toggle',
  )
  @UseGuards(AdminGuard)
  toggleFavourite(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.toggleFavourite(
      libraryItemId,
    );
  }

  @Patch(
    ':libraryItemId/favourite',
  )
  @UseGuards(AdminGuard)
  setFavourite(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      isFavourite: boolean;
    },
  ) {
    return this.libraryService.setFavourite(
      libraryItemId,
      body.isFavourite,
    );
  }

  @Post(
    ':libraryItemId/takeaways',
  )
  @UseGuards(AdminGuard)
  addTakeaway(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.addTakeaway(
      libraryItemId,
      dto.value,
    );
  }

  @Delete(
    ':libraryItemId/takeaways',
  )
  @UseGuards(AdminGuard)
  removeTakeaway(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.removeTakeaway(
      libraryItemId,
      dto.value,
    );
  }

  @Post(
    ':libraryItemId/quotes',
  )
  @UseGuards(AdminGuard)
  addQuote(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.addQuote(
      libraryItemId,
      dto.value,
    );
  }

  @Delete(
    ':libraryItemId/quotes',
  )
  @UseGuards(AdminGuard)
  removeQuote(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    dto: AddLibraryTextItemDto,
  ) {
    return this.libraryService.removeQuote(
      libraryItemId,
      dto.value,
    );
  }

  @Patch(
    ':libraryItemId/summary',
  )
  @UseGuards(AdminGuard)
  updateSummary(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      summary: string;
    },
  ) {
    return this.libraryService.updateSummary(
      libraryItemId,
      body.summary,
    );
  }

  @Patch(
    ':libraryItemId/notes',
  )
  @UseGuards(AdminGuard)
  updateNotes(
    @Param('libraryItemId')
    libraryItemId: string,

    @Body()
    body: {
      notes: string;
    },
  ) {
    return this.libraryService.updateNotes(
      libraryItemId,
      body.notes,
    );
  }

  @Patch(
    ':libraryItemId/archive',
  )
  @UseGuards(AdminGuard)
  archive(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.archive(
      libraryItemId,
    );
  }

  @Patch(
    ':libraryItemId/restore',
  )
  @UseGuards(AdminGuard)
  restore(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.restore(
      libraryItemId,
    );
  }

  @Delete(':libraryItemId')
  @UseGuards(AdminGuard)
  remove(
    @Param('libraryItemId')
    libraryItemId: string,
  ) {
    return this.libraryService.remove(
      libraryItemId,
    );
  }
}