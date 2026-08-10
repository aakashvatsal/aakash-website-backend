import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { HsakaaService } from './hsakaa.service';

@Controller('hsakaa')
export class HsakaaController {
  constructor(private readonly hsakaaService: HsakaaService) {}

  @Post('ask')
  ask(
    @Body()
    body: {
      mode: string;
      message: string;
    },
  ) {
    return this.hsakaaService.ask(body);
  }
}
