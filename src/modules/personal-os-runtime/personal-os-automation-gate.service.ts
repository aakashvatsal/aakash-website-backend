import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class PersonalOsAutomationGateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PersonalOsAutomationGateService.name);
  private disabledCronJobs: string[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => this.applyGate(), 0);
  }

  isAutomationEnabled() {
    return (
      this.config
        .get<string>('PERSONAL_OS_AUTOMATION_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  applyGate() {
    if (this.isAutomationEnabled()) {
      return {
        automationEnabled: true,
        disabledCronJobs: [],
      };
    }

    const jobs = this.schedulerRegistry.getCronJobs();
    const disabled: string[] = [];
    for (const name of jobs.keys()) {
      try {
        this.schedulerRegistry.deleteCronJob(name);
        disabled.push(name);
      } catch {
        continue;
      }
    }

    if (disabled.length) {
      this.disabledCronJobs = [
        ...new Set([...this.disabledCronJobs, ...disabled]),
      ].sort();
      this.logger.log(
        `Personal OS automatic schedules are OFF; disabled ${disabled.length} ` +
          'cron job(s).',
      );
    }

    return {
      automationEnabled: false,
      disabledCronJobs: this.disabledCronJobs,
    };
  }

  getStatus() {
    const gate = this.applyGate();
    return {
      ...gate,
      mode: gate.automationEnabled ? 'scheduled' : 'manual',
      timezone: 'Asia/Kolkata',
      enableInstruction:
        'Set PERSONAL_OS_AUTOMATION_ENABLED=true and restart only after ' +
        'activation testing is complete.',
    };
  }
}
