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
} from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

import { BackfillMemoryEmbeddingsDto } from './dto/backfill-memory-embeddings.dto';
import {
  AcceptMemoryInboxItemDto,
  CaptureMemoryInboxItemDto,
  RejectMemoryInboxItemDto,
} from './dto/capture-memory-inbox-item.dto';
import { CreateManyMemoryDto } from './dto/create-many-memory.dto';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { DisputeMemoryDto } from './dto/dispute-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { MemoryRecallQueryDto } from './dto/memory-recall-query.dto';
import {
  ConfirmMemoryReviewDto,
  CreateMemoryMergeDraftDto,
  SnoozeMemoryReviewDto,
} from './dto/memory-review.dto';
import {
  ContradictMemoryDto,
  ResolveMemoryDisputeDto,
  SupersedeMemoryDto,
} from './dto/manage-memory-lifecycle.dto';
import { MemoryInboxQueryDto } from './dto/memory-inbox-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { UpdateMemoryScoreDto } from './dto/update-memory-score.dto';
import { UpdateMemoryTagsDto } from './dto/update-memory-tags.dto';
import { MemoryService } from './memory.service';
import { MemoryReviewService } from './memory-review.service';
import { MemoryInboxService } from './memory-inbox.service';

@Controller('memory')
export class MemoryController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly memoryInboxService: MemoryInboxService,
    private readonly memoryReviewService: MemoryReviewService,
  ) {}

  @Post('inbox')
  captureInboxItem(@Body() dto: CaptureMemoryInboxItemDto) {
    return this.memoryInboxService.capture(dto);
  }

  @Get('inbox')
  getInbox(@Query() query: MemoryInboxQueryDto) {
    return this.memoryInboxService.findAll(query);
  }

  @Post('inbox/:inboxItemId/accept')
  acceptInboxItem(
    @Param('inboxItemId') inboxItemId: string,
    @Body() dto: AcceptMemoryInboxItemDto,
  ) {
    return this.memoryInboxService.accept(inboxItemId, dto);
  }

  @Post('inbox/:inboxItemId/reject')
  rejectInboxItem(
    @Param('inboxItemId') inboxItemId: string,
    @Body() dto: RejectMemoryInboxItemDto,
  ) {
    return this.memoryInboxService.reject(inboxItemId, dto);
  }

  @Post()
  create(
    @Body()
    dto: CreateMemoryDto,
  ) {
    return this.memoryService.create(dto);
  }

  @Post('bulk')
  createMany(
    @Body()
    dto: CreateManyMemoryDto,
  ) {
    return this.memoryService.createMany(dto);
  }

  /**
   * Private Personal OS listing.
   */
  @Get()
  findAll(
    @Query()
    query: MemoryQueryDto,
  ) {
    return this.memoryService.findAll(query);
  }

  @Get('recall')
  recall(@Query() query: MemoryRecallQueryDto) {
    return this.memoryService.recall(query);
  }

  @Get('review-queue')
  getReviewQueue() {
    return this.memoryReviewService.getQueue();
  }

  @Post(':memoryId/review/confirm')
  confirmReview(
    @Param('memoryId') memoryId: string,
    @Body() dto: ConfirmMemoryReviewDto,
  ) {
    return this.memoryReviewService.confirmCurrent(memoryId, dto);
  }

  @Post(':memoryId/review/snooze')
  snoozeReview(
    @Param('memoryId') memoryId: string,
    @Body() dto: SnoozeMemoryReviewDto,
  ) {
    return this.memoryReviewService.snooze(memoryId, dto);
  }

  @Post(':memoryId/review/merge-draft')
  createMergeDraft(
    @Param('memoryId') memoryId: string,
    @Body() dto: CreateMemoryMergeDraftDto,
  ) {
    return this.memoryReviewService.createMergeDraft(memoryId, dto);
  }

  /**
   * Public-safe memories only.
   */
  @Get('public')
  @Public()
  findPublicmemory(
    @Query('search')
    search?: string,
  ) {
    return this.memoryService.findPublicmemory(search);
  }

  /**
   * Memories accessible to a
   * verified person.
   *
   * Uses x-memory-session.
   */
  @Get('person/me')
  @Public()
  findForVerifiedPerson(
    @Headers('x-memory-session')
    sessionToken: string,
  ) {
    return this.memoryService.findForVerifiedPerson(sessionToken);
  }

  @Get('embeddings/status')
  getEmbeddingStatus() {
    return this.memoryService.getEmbeddingStatus();
  }

  @Post('embeddings/backfill')
  backfillEmbeddings(
    @Body()
    dto: BackfillMemoryEmbeddingsDto,
  ) {
    return this.memoryService.backfillPublicEmbeddings(dto);
  }

  @Post(':memoryId/embedding')
  regenerateEmbedding(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.regenerateEmbedding(memoryId);
  }

  /**
   * Private Personal OS detail.
   */
  @Get(':memoryId')
  findOne(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.findOne(memoryId);
  }

  @Patch(':memoryId')
  update(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryDto,
  ) {
    return this.memoryService.update(memoryId, dto);
  }

  @Patch(':memoryId/score')
  updateScore(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryScoreDto,
  ) {
    return this.memoryService.updateScore(memoryId, dto);
  }

  @Patch(':memoryId/tags')
  replaceTags(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryTagsDto,
  ) {
    return this.memoryService.replaceTags(memoryId, dto);
  }

  @Post(':memoryId/tags')
  addTags(
    @Param('memoryId')
    memoryId: string,

    @Body()
    dto: UpdateMemoryTagsDto,
  ) {
    return this.memoryService.addTags(memoryId, dto);
  }

  @Delete(':memoryId/tags/:tag')
  removeTag(
    @Param('memoryId')
    memoryId: string,

    @Param('tag')
    tag: string,
  ) {
    return this.memoryService.removeTag(memoryId, tag);
  }

  /**
   * Person-authenticated action.
   *
   * Uses the person verification session rather than owner authentication.
   */
  @Patch(':memoryId/dispute')
  @Public()
  dispute(
    @Param('memoryId')
    memoryId: string,

    @Headers('x-memory-session')
    sessionToken: string,

    @Body()
    dto: DisputeMemoryDto,
  ) {
    return this.memoryService.dispute(memoryId, sessionToken, dto);
  }

  @Post(':memoryId/supersede')
  supersede(
    @Param('memoryId') memoryId: string,
    @Body() dto: SupersedeMemoryDto,
  ) {
    return this.memoryService.supersede(memoryId, dto);
  }

  @Post(':memoryId/contradict')
  contradict(
    @Param('memoryId') memoryId: string,
    @Body() dto: ContradictMemoryDto,
  ) {
    return this.memoryService.contradict(memoryId, dto);
  }

  @Post(':memoryId/dispute/resolve')
  resolveDispute(
    @Param('memoryId') memoryId: string,
    @Body() dto: ResolveMemoryDisputeDto,
  ) {
    return this.memoryService.resolveDispute(memoryId, dto);
  }

  @Patch(':memoryId/archive')
  archive(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.archive(memoryId);
  }

  @Patch(':memoryId/restore')
  restore(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.restore(memoryId);
  }

  @Delete(':memoryId')
  remove(
    @Param('memoryId')
    memoryId: string,
  ) {
    return this.memoryService.remove(memoryId);
  }
}
