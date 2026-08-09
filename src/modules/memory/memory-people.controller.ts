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

import { CreateMemoryPersonDto } from './dto/create-memory-person.dto';
import { MemoryPersonQueryDto } from './dto/memory-person-query.dto';
import { UpdateMemoryPersonDto } from './dto/update-memory-person.dto';
import { MemoryPeopleService } from './memory-people.service';

@Controller('memory-people')
@UseGuards(AdminGuard)
export class MemoryPeopleController {
  constructor(
    private readonly memoryPeopleService:
      MemoryPeopleService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateMemoryPersonDto,
  ) {
    return this.memoryPeopleService.create(
      dto,
    );
  }

  @Get()
  findAll(
    @Query()
    query: MemoryPersonQueryDto,
  ) {
    return this.memoryPeopleService.findAll(
      query,
    );
  }

  @Get(':personId')
  findOne(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.findOne(
      personId,
    );
  }

  @Patch(':personId')
  update(
    @Param('personId')
    personId: string,

    @Body()
    dto: UpdateMemoryPersonDto,
  ) {
    return this.memoryPeopleService.update(
      personId,
      dto,
    );
  }

  @Patch(
    ':personId/consent/grant',
  )
  grantConsent(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.grantConsent(
      personId,
    );
  }

  @Patch(
    ':personId/consent/revoke',
  )
  revokeConsent(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.revokeConsent(
      personId,
    );
  }

  @Patch(':personId/block')
  block(
    @Param('personId')
    personId: string,

    @Body()
    body: {
      reason?: string;
    },
  ) {
    return this.memoryPeopleService.block(
      personId,
      body.reason,
    );
  }

  @Patch(':personId/unblock')
  unblock(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.unblock(
      personId,
    );
  }

  @Patch(':personId/archive')
  archive(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.archive(
      personId,
    );
  }

  @Patch(':personId/restore')
  restore(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.restore(
      personId,
    );
  }

  @Delete(':personId')
  remove(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.remove(
      personId,
    );
  }
}