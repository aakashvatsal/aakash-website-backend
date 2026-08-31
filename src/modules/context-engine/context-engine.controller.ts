import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { ContextEngineService } from './context-engine.service';
import {
  AnswerWithContextDto,
  AssembleContextDto,
} from './dto/context-engine.dto';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/context')
export class ContextEngineController {
  constructor(private readonly contextEngine: ContextEngineService) {}

  @Get('policy')
  getPolicy() {
    return this.contextEngine.getPolicy();
  }

  @Post('assemble')
  assemble(@Body() dto: AssembleContextDto) {
    return this.contextEngine.assemble(dto);
  }

  @Post('answer')
  answer(@Body() dto: AnswerWithContextDto) {
    return this.contextEngine.answer(dto);
  }
}
