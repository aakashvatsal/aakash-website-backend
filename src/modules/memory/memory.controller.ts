import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AdminGuard,
} from '../../common/guards/admin.guard';

import { CreateManyMemoryDto } from './dto/create-many-memory.dto';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { DisputeMemoryDto } from './dto/dispute-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { UpdateMemoryScoreDto } from './dto/update-memory-score.dto';
import { UpdateMemoryTagsDto } from './dto/update-memory-tags.dto';
import { MemoryService } from './memory.service';

@Controller('memory')
export class MemoryController {
  constructor(
    private readonly memoryService:
      MemoryService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto: CreateMemoryDto,
  ) {
    return this.memoryService.create(
      dto,
    );
  }

  @Post('bulk')
  @UseGuards(AdminGuard)
  createMany(
    @Body()
    dto: CreateManyMemoryDto,
  ) {
    return this.memoryService.createMany(
      dto,
    );
  }

  /**
   * Private admin listing.
   */
  @Get()
  @UseGuards(AdminGuard)
  findAll(
    @Query()
    query: MemoryQueryDto,
  ) {
    return this.memoryService.findAll(
      query,
    );
  }

  /**
   * Public-safe memories only.
   */
  @Get('public')
  findPublicmemory(
    @Query('search')
    search?: string,
  ) {
    return this.memoryService.findPublicmemory(
      search,
    );
  }

  /**
   * Memories accessible to a
   * verified person.
   *
   * Uses x-memory-session,
   * not AdminGuard.
   */
  @Get('person/me')
  findForVerifiedPerson(
    @Headers('x-memory-session')
    sessionToken: string,
  ) {
    return this.memoryService.findForVerifiedPerson(
      sessionToken,
    );
  }

  /**
   * Private admin detail.
   */
  @Get(':memoryId')
  @UseGuards(AdminGuard)
  findOne(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.findOne(
      memoryId,
    );
  }

  @Patch(':memoryId')
  @UseGuards(AdminGuard)
  update(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryDto,
  ) {
    return this.memoryService.update(
      memoryId,
      dto,
    );
  }

  @Patch(':memoryId/score')
  @UseGuards(AdminGuard)
  updateScore(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryScoreDto,
  ) {
    return this.memoryService.updateScore(
      memoryId,
      dto,
    );
  }

  @Patch(':memoryId/tags')
  @UseGuards(AdminGuard)
  replaceTags(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryTagsDto,
  ) {
    return this.memoryService.replaceTags(
      memoryId,
      dto,
    );
  }

  @Post(':memoryId/tags')
  @UseGuards(AdminGuard)
  addTags(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryTagsDto,
  ) {
    return this.memoryService.addTags(
      memoryId,
      dto,
    );
  }

  @Delete(
    ':memoryId/tags/:tag',
  )
  @UseGuards(AdminGuard)
  removeTag(
    @Param('memoryId')
    memoryId: string,

    @Param('tag')
    tag: string,
  ) {
    return this.memoryService.removeTag(
      memoryId,
      tag,
    );
  }

  /**
   * Person-authenticated action.
   *
   * Do NOT use AdminGuard here.
   */
  @Patch(':memoryId/dispute')
  dispute(
    @Param('memoryId')
    memoryId: string,

    @Headers('x-memory-session')
    sessionToken: string,

    @Body()
    dto: DisputeMemoryDto,
  ) {
    return this.memoryService.dispute(
      memoryId,
      sessionToken,
      dto,
    );
  }

  @Patch(':memoryId/archive')
  @UseGuards(AdminGuard)
  archive(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.archive(
      memoryId,
    );
  }

  @Patch(':memoryId/restore')
  @UseGuards(AdminGuard)
  restore(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.restore(
      memoryId,
    );
  }

  @Delete(':memoryId')
  @UseGuards(AdminGuard)
  remove(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.remove(
      memoryId,
    );
  }
}