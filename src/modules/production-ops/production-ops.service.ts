import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { ReleaseHardeningService } from '../release-hardening/release-hardening.service';

type OpsCheckLevel = 'pass' | 'warning' | 'fail';

type OpsCheck = {
  id: string;
  label: string;
  level: OpsCheckLevel;
  detail: string;
};

const FALLBACK_WARNING_RATE = 0.25;
const ERROR_FAIL_RATE = 0.1;
const BACKUP_WARNING_DAYS = 7;
const BACKUP_FAIL_DAYS = 30;

@Injectable()
export class ProductionOpsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly releaseHardening: ReleaseHardeningService,
    private readonly aiUsage: HsakaaAiUsageService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  getPolicy() {
    return {
      version: 'personal-os-production-ops-v1',
      principles: [
        'Operations inspection never invokes the AI provider.',
        'AI pricing is optional and configured through environment rates rather than hard-coded provider assumptions.',
        'Soft budgets warn only; hard budgets make HSAKAA use existing evidence or lexical fallbacks when available.',
        'Usage telemetry is best-effort and can never turn a successful Personal OS operation into a failure.',
        'Backup readiness records configuration/verification state only; this console never exports database credentials.',
      ],
      aiUsage: this.aiUsage.getPolicy(),
      smokeThresholds: {
        fallbackWarningRate: FALLBACK_WARNING_RATE,
        errorFailRate: ERROR_FAIL_RATE,
        backupWarningDays: BACKUP_WARNING_DAYS,
        backupFailDays: BACKUP_FAIL_DAYS,
      },
    };
  }

  async getDashboard(days = 30) {
    const safeDays = this.safeDays(days);
    const [release, usage, activeLeases] = await Promise.all([
      this.releaseHardening.runChecks(),
      this.aiUsage.getSummary(safeDays),
      this.runtimeLeases.getActiveLeases(),
    ]);

    return {
      environment: this.environmentSnapshot(),
      release,
      ai: usage,
      backup: this.backupSnapshot(),
      runtime: {
        activeLeases: activeLeases.map((lease) => ({
          key: lease.key,
          acquiredAt: lease.acquiredAt,
          expiresAt: lease.expiresAt,
          metadata: lease.metadata,
        })),
      },
      generatedAt: new Date(),
    };
  }

  async runRcSmoke(days = 7) {
    const safeDays = this.safeDays(days);
    const [release, usage, activeLeases] = await Promise.all([
      this.releaseHardening.runChecks(),
      this.aiUsage.getSummary(safeDays),
      this.runtimeLeases.getActiveLeases(),
    ]);
    const backup = this.backupSnapshot();
    const environment = this.environmentSnapshot();

    const checks: OpsCheck[] = [
      release.ready
        ? this.pass(
            'release-readiness',
            'Release readiness gate',
            `Release hardening reports ${release.score}/100 with no blockers.`,
          )
        : this.fail(
            'release-readiness',
            'Release readiness gate',
            `${release.summary.failures} release blocker(s) remain.`,
          ),
      Number(this.connection.readyState) === 1
        ? this.pass('database', 'MongoDB connection', 'Mongoose is connected.')
        : this.fail(
            'database',
            'MongoDB connection',
            `Mongoose readyState is ${this.connection.readyState}; expected 1.`,
          ),
      usage.budget.hardExceeded
        ? this.fail(
            'ai-hard-budget',
            'AI hard budget',
            'The configured daily hard AI budget is currently exceeded.',
          )
        : usage.budget.softExceeded
          ? this.warning(
              'ai-hard-budget',
              'AI budget',
              'The configured daily soft AI budget is currently exceeded.',
            )
          : this.pass(
              'ai-hard-budget',
              'AI budget',
              'Configured daily AI budget is within limits.',
            ),
      usage.totals.errorRate > ERROR_FAIL_RATE
        ? this.fail(
            'ai-error-rate',
            'AI error rate',
            `${(usage.totals.errorRate * 100).toFixed(1)}% error rate over the last ${safeDays} day(s).`,
          )
        : this.pass(
            'ai-error-rate',
            'AI error rate',
            `${(usage.totals.errorRate * 100).toFixed(1)}% over the last ${safeDays} day(s).`,
          ),
      usage.totals.fallbackRate > FALLBACK_WARNING_RATE
        ? this.warning(
            'ai-fallback-rate',
            'AI fallback rate',
            `${(usage.totals.fallbackRate * 100).toFixed(1)}% of recorded AI operations used fallbacks over the last ${safeDays} day(s).`,
          )
        : this.pass(
            'ai-fallback-rate',
            'AI fallback rate',
            `${(usage.totals.fallbackRate * 100).toFixed(1)}% over the last ${safeDays} day(s).`,
          ),
      activeLeases.length
        ? this.warning(
            'active-runtime-work',
            'Active runtime work',
            `${activeLeases.length} distributed runtime lease(s) are active. Rerun the smoke gate after expensive jobs finish for the cleanest release snapshot.`,
          )
        : this.pass(
            'active-runtime-work',
            'Active runtime work',
            'No expensive distributed job is currently active.',
          ),
      this.backupCheck(backup),
      environment.nodeEnv === 'production'
        ? this.pass(
            'node-environment',
            'Node environment',
            'NODE_ENV is production.',
          )
        : this.warning(
            'node-environment',
            'Node environment',
            `NODE_ENV is ${environment.nodeEnv ?? 'unset'}; this is expected locally but not for the production release process.`,
          ),
      environment.version || environment.gitSha
        ? this.pass(
            'release-identity',
            'Release identity',
            `Release identity is available${environment.version ? ` (version ${environment.version})` : ''}${environment.gitSha ? ` (git ${environment.gitSha})` : ''}.`,
          )
        : this.warning(
            'release-identity',
            'Release identity',
            'APP_VERSION and GIT_SHA are both unset, so deployed builds will be harder to identify from the operations console.',
          ),
    ];

    const failures = checks.filter((check) => check.level === 'fail').length;
    const warnings = checks.filter((check) => check.level === 'warning').length;

    return {
      readyForRc: failures === 0,
      score: Math.max(0, 100 - failures * 25 - warnings * 5),
      summary: {
        passed: checks.filter((check) => check.level === 'pass').length,
        warnings,
        failures,
      },
      checks,
      releaseScore: release.score,
      ai: {
        days: safeDays,
        totals: usage.totals,
        budget: usage.budget,
      },
      backup,
      environment,
      generatedAt: new Date(),
    };
  }

  private backupSnapshot() {
    const strategy =
      this.config.get<string>('PERSONAL_OS_BACKUP_STRATEGY')?.trim() || null;
    const rawVerifiedAt = this.config
      .get<string>('PERSONAL_OS_BACKUP_LAST_VERIFIED_AT')
      ?.trim();
    const lastVerifiedAt = rawVerifiedAt ? new Date(rawVerifiedAt) : null;
    const validVerifiedAt =
      lastVerifiedAt && Number.isFinite(lastVerifiedAt.getTime())
        ? lastVerifiedAt
        : null;
    const ageDays = validVerifiedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - validVerifiedAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

    return {
      strategy,
      lastVerifiedAt: validVerifiedAt,
      ageDays,
      configured: Boolean(strategy),
    };
  }

  private backupCheck(
    backup: ReturnType<ProductionOpsService['backupSnapshot']>,
  ): OpsCheck {
    if (!backup.configured) {
      return this.warning(
        'backup-readiness',
        'Backup readiness',
        'PERSONAL_OS_BACKUP_STRATEGY is not configured. Record the production backup approach before release.',
      );
    }
    if (backup.ageDays === null) {
      return this.warning(
        'backup-readiness',
        'Backup readiness',
        'Backup strategy exists, but PERSONAL_OS_BACKUP_LAST_VERIFIED_AT has not been recorded.',
      );
    }
    if (backup.ageDays > BACKUP_FAIL_DAYS) {
      return this.fail(
        'backup-readiness',
        'Backup readiness',
        `The last recorded backup verification is ${backup.ageDays} days old.`,
      );
    }
    if (backup.ageDays > BACKUP_WARNING_DAYS) {
      return this.warning(
        'backup-readiness',
        'Backup readiness',
        `The last recorded backup verification is ${backup.ageDays} days old.`,
      );
    }
    return this.pass(
      'backup-readiness',
      'Backup readiness',
      `Backup strategy ${backup.strategy} was verified ${backup.ageDays} day(s) ago.`,
    );
  }

  private environmentSnapshot() {
    return {
      nodeEnv: this.config.get<string>('NODE_ENV') ?? null,
      version: this.config.get<string>('APP_VERSION') ?? null,
      gitSha: this.config.get<string>('GIT_SHA') ?? null,
      timezone: 'Asia/Kolkata',
    };
  }

  private safeDays(days: number): number {
    return Math.min(90, Math.max(1, Math.round(days || 30)));
  }

  private pass(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'pass', detail };
  }

  private warning(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'warning', detail };
  }

  private fail(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'fail', detail };
  }
}
