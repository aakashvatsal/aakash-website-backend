import { Inject, Injectable } from '@nestjs/common';

import { PersonalOsClosedLoopService } from './personal-os-closed-loop.service';
import { PersonalOsSystemHealthService } from './personal-os-system-health.service';
import { ProductionOpsService } from './production-ops.service';

export const BASE_PRODUCTION_OPS_SERVICE = Symbol(
  'BASE_PRODUCTION_OPS_SERVICE',
);

@Injectable()
export class IntegratedProductionOpsService {
  constructor(
    @Inject(BASE_PRODUCTION_OPS_SERVICE)
    private readonly base: ProductionOpsService,
    private readonly systemHealth: PersonalOsSystemHealthService,
    private readonly closedLoops: PersonalOsClosedLoopService,
  ) {}

  getPolicy() {
    const base = this.base.getPolicy();
    return {
      ...base,
      version: 'personal-os-production-ops-v3-closed-loops',
      principles: [
        ...(base.principles ?? []),
        'System Health validates cross-module source-to-graph connectivity without calling the AI provider.',
        'A populated module with no graph representation is a release blocker; an empty but wired module is idle, not broken.',
        'Search semantic coverage may degrade to lexical fallback, but very low coverage is surfaced as a release blocker.',
        'Closed-loop inspection proves that evidence can move through intervention, task, execution, review, graph and future planning rather than only checking isolated module availability.',
        'Closed-loop validation is read-only and never fabricates or triggers Health, task or proactive actions.',
      ],
    };
  }

  async getDashboard(days = 30) {
    const [dashboard, systemHealth, closedLoops] = await Promise.all([
      this.base.getDashboard(days),
      this.systemHealth.snapshot(),
      this.closedLoops.snapshot(),
    ]);

    return {
      ...dashboard,
      systemHealth,
      closedLoops,
    };
  }

  async runRcSmoke(days = 7) {
    const [smoke, systemHealth, closedLoops] = await Promise.all([
      this.base.runRcSmoke(days),
      this.systemHealth.snapshot(),
      this.closedLoops.snapshot(),
    ]);
    const checks = [
      ...(smoke.checks ?? []),
      ...systemHealth.checks,
      ...closedLoops.checks,
    ];
    const failures = checks.filter((check) => check.level === 'fail').length;
    const warnings = checks.filter((check) => check.level === 'warning').length;

    return {
      ...smoke,
      readyForRc: failures === 0,
      score: Math.max(0, 100 - failures * 25 - warnings * 5),
      summary: {
        passed: checks.filter((check) => check.level === 'pass').length,
        warnings,
        failures,
      },
      checks,
      systemHealth,
      closedLoops,
    };
  }
}
