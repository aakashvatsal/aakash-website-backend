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

import { CreateDietEntryDto } from './dto/create-diet-entry.dto';
import { UpdateDietEntryDto } from './dto/update-diet-entry.dto';
import { DietService } from './diet.service';
import { MealStatus } from './schemas/diet-entry.schema';

@Controller('diet')
export class DietController {
  constructor(
    private readonly dietService: DietService,
  ) {}

  @Post()
  create(@Body() dto: CreateDietEntryDto) {
    return this.dietService.create(dto);
  }

  @Get()
  findAll(
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dietService.findAll(
      userId,
      startDate,
      endDate,
    );
  }

  @Get(':dietEntryId')
  findOne(
    @Param('dietEntryId') dietEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.dietService.findOne(
      dietEntryId,
      userId,
    );
  }

  @Patch(':dietEntryId')
  update(
    @Param('dietEntryId') dietEntryId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateDietEntryDto,
  ) {
    return this.dietService.update(
      dietEntryId,
      userId,
      dto,
    );
  }

  @Patch(':dietEntryId/meals/:mealIndex')
  updateMealStatus(
    @Param('dietEntryId') dietEntryId: string,
    @Param('mealIndex') mealIndex: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      status: MealStatus;
      consumedAt?: string;
      consumedItems?: any[];
      skipReason?: string;
      replacementReason?: string;
      notes?: string;
    },
  ) {
    return this.dietService.updateMealStatus(
      dietEntryId,
      userId,
      Number(mealIndex),
      body,
    );
  }

  @Delete(':dietEntryId')
  remove(
    @Param('dietEntryId') dietEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.dietService.remove(
      dietEntryId,
      userId,
    );
  }
}