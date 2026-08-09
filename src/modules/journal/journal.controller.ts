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
  CreateJournalEntryDto,
} from './dto/create-journal-entry.dto';

import {
  JournalQueryDto,
} from './dto/journal-query.dto';

import {
  UpdateJournalEntryDto,
} from './dto/update-journal-entry.dto';

import {
  JournalEnrichmentService,
} from './journal-enrichment.service';

import {
  JournalService,
} from './journal.service';

@Controller('journal')
export class JournalController {
  constructor(
    private readonly journalService:
      JournalService,

    private readonly journalEnrichmentService:
      JournalEnrichmentService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto:
      CreateJournalEntryDto,
  ) {
    return this.journalService.create(
      dto,
    );
  }

  @Post('today/enrich')
  @UseGuards(AdminGuard)
  enrichToday() {
    return this.journalEnrichmentService.enrichToday();
  }

  /**
   * Public journal listing.
   *
   * Keep above
   * /:journalEntryId.
   */
  @Get('public')
  findPublic(
    @Query()
    query:
      JournalQueryDto,
  ) {
    return this.journalService.findPublic(
      query,
    );
  }

  /**
   * Public journal detail
   * by slug.
   */
  @Get('public/:slug')
  findPublicBySlug(
    @Param('slug')
    slug:
      string,
  ) {
    return this.journalService.findPublicBySlug(
      slug,
    );
  }

  /**
   * Internal journal listing.
   */
  @Get()
  findAll(
    @Query()
    query:
      JournalQueryDto,
  ) {
    return this.journalService.findAll(
      query,
    );
  }

  /**
   * Internal lookup by slug.
   *
   * Useful for admin/HSAKAA.
   */
  @Get('slug/:slug')
  findBySlug(
    @Param('slug')
    slug:
      string,
  ) {
    return this.journalService.findBySlug(
      slug,
    );
  }

  @Patch(
    ':journalEntryId/publish',
  )
  @UseGuards(AdminGuard)
  publish(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.publish(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId/unpublish',
  )
  @UseGuards(AdminGuard)
  unpublish(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.unpublish(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId/favourite',
  )
  @UseGuards(AdminGuard)
  favourite(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.favourite(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId/unfavourite',
  )
  @UseGuards(AdminGuard)
  unfavourite(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.unfavourite(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId/archive',
  )
  @UseGuards(AdminGuard)
  archive(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.archive(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId/restore',
  )
  @UseGuards(AdminGuard)
  restore(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.restore(
      journalEntryId,
    );
  }

  @Patch(
    ':journalEntryId',
  )
  @UseGuards(AdminGuard)
  update(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,

    @Body()
    dto:
      UpdateJournalEntryDto,
  ) {
    return this.journalService.update(
      journalEntryId,
      dto,
    );
  }

  @Get(
    ':journalEntryId',
  )
  findById(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.findById(
      journalEntryId,
    );
  }

  @Delete(
    ':journalEntryId',
  )
  @UseGuards(AdminGuard)
  remove(
    @Param(
      'journalEntryId',
    )
    journalEntryId:
      string,
  ) {
    return this.journalService.remove(
      journalEntryId,
    );
  }
}