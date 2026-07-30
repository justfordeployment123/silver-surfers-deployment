import { CronExpressionParser } from 'cron-parser';

import { logger } from '../../config/logger.ts';
import type { MonitoringJobDocument, MonitoringSchedule } from './monitoring.dependencies.ts';

const scheduleLogger = logger.child('feature:monitoring:schedule');

// Named schedules map to fixed cron patterns per the M2.2 spec (2.2.6.2).
// 'custom' has no fixed pattern — it uses MonitoringJob.customCronExpression.
const NAMED_SCHEDULE_CRON: Record<Exclude<MonitoringSchedule, 'custom'>, string> = {
  weekly: '0 8 * * 1',       // Monday 08:00 UTC
  biweekly: '0 8 1,15 * *',  // 1st and 15th of month
  monthly: '0 8 1 * *',      // 1st of month
  trimonthly: '0 8 1 */3 *', // 1st of every 3rd month
  quarterly: '0 8 1 */4 *',
};

export class InvalidCronExpressionError extends Error {}

export function resolveCronExpression(job: Pick<MonitoringJobDocument, 'schedule' | 'customCronExpression'>): string {
  if (job.schedule === 'custom') {
    if (!job.customCronExpression) {
      scheduleLogger.error('Custom schedule selected but customCronExpression is missing.', { schedule: job.schedule });
      throw new InvalidCronExpressionError('customCronExpression is required when schedule is "custom".');
    }
    return job.customCronExpression;
  }

  const pattern = job.schedule ? NAMED_SCHEDULE_CRON[job.schedule] : undefined;
  if (!pattern) {
    scheduleLogger.error('Unknown/unmapped schedule value encountered.', { schedule: job.schedule });
    throw new InvalidCronExpressionError(`Unknown schedule "${String(job.schedule)}".`);
  }
  return pattern;
}

/**
 * Computes the next UTC run time strictly after `fromDate` for the given job's
 * schedule configuration. Throws InvalidCronExpressionError if the cron
 * expression (named or custom) can't be parsed.
 */
export function computeNextRunAt(
  job: Pick<MonitoringJobDocument, 'schedule' | 'customCronExpression'>,
  fromDate: Date = new Date(),
): Date {
  const cronExpression = resolveCronExpression(job);

  try {
    const interval = CronExpressionParser.parse(cronExpression, { currentDate: fromDate, tz: 'UTC' });
    const next = interval.next().toDate();
    scheduleLogger.debug('Computed next run time.', { schedule: job.schedule, cronExpression, fromDate: fromDate.toISOString(), nextRunAt: next.toISOString() });
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scheduleLogger.error('Failed to compute next run time from cron expression.', { schedule: job.schedule, cronExpression, error: message });
    throw new InvalidCronExpressionError(`Could not parse cron expression "${cronExpression}": ${message}`);
  }
}

/** Human-readable preview for the "Custom" schedule UI (2.2.6.6 step 2). */
export function describeCronExpression(cronExpression: string): string {
  try {
    const next = CronExpressionParser.parse(cronExpression, { tz: 'UTC' }).next().toDate();
    return `Next run: ${next.toISOString()} (UTC)`;
  } catch {
    return 'Invalid cron expression';
  }
}
