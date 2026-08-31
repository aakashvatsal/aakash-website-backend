import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  @Public()
  getHealth() {
    return this.systemService.getHealth();
  }

  @Get('readiness')
  @Public()
  getReadiness() {
    return this.systemService.getReadiness();
  }
}
