import { logger } from '../../config/logger.ts';
import { getSubscriptionModel, getUserModel } from '../audits/audits.dependencies.ts';
import { computeNextRunAt } from './monitoring.schedule.ts';
import type { MonitoringJobDocument, MonitoringScanType } from './monitoring.dependencies.ts';

const planLimitsLogger = logger.child('feature:monitoring:plan-limits');

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

// This codebase's real Subscription/User.subscription.planId enum is
// ['starter', 'pro', 'custom'] — there is no 'enterprise' or 'free' plan
// record. 'free' here means "no active subscription was found at all",
// and 'custom' is this codebase's stand-in for the M2.2 spec's
// "Enterprise" tier (unlimited jobs, all scan types, all intervals).
export type MonitoringPlanId = 'free' | 'starter' | 'pro' | 'custom';

export interface MonitoringPlanLimits {
  maxActiveJobs: number;
  allowedScanTypes: MonitoringScanType[];
  /** Minimum allowed gap between runs, in days. null = no minimum (any schedule allowed). */
  minScheduleIntervalDays: number | null;
}

export const MONITORING_PLAN_LIMITS: Record<MonitoringPlanId, MonitoringPlanLimits> = {
  free: { maxActiveJobs: 0, allowedScanTypes: [], minScheduleIntervalDays: null },
  starter: { maxActiveJobs: 1, allowedScanTypes: ['quick'], minScheduleIntervalDays: 28 },
  pro: { maxActiveJobs: 5, allowedScanTypes: ['quick', 'full'], minScheduleIntervalDays: 7 },
  custom: { maxActiveJobs: Infinity, allowedScanTypes: ['quick', 'full'], minScheduleIntervalDays: null },
};

// Approximate day-length for each named schedule, used only to compare
// against a plan's minScheduleIntervalDays. 'custom' is resolved dynamically
// by measuring two consecutive computed run times instead (see below).
const NAMED_SCHEDULE_INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  trimonthly: 90,
  quarterly: 120,
};

/**
 * Resolves a user's effective monitoring plan, mirroring the
 * Subscription-collection-first / embedded-User.subscription-fallback
 * pattern already used in audits.controller.ts's
 * resolveQuickAuditSubscriptionForUserLookup, so plan resolution stays
 * consistent across the codebase rather than inventing a second variant.
 */
export async function resolveMonitoringPlanId(userId: string): Promise<MonitoringPlanId> {
  planLimitsLogger.debug('Resolving monitoring plan for user.', { userId });

  const [Subscription, User] = await Promise.all([getSubscriptionModel(), getUserModel()]);
  const user = await User.findById(userId).lean() as {
    subscription?: { status?: string; planId?: string; isTeamMember?: boolean; teamOwner?: string };
  } | null;

  if (!user) {
    planLimitsLogger.warn('Could not resolve monitoring plan — user not found.', { userId });
    return 'free';
  }

  let subscription = await Subscription.findOne({
    user: userId,
    status: { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
  }).lean() as { planId?: string } | null;

  if (!subscription && user.subscription?.planId && ACTIVE_SUBSCRIPTION_STATUSES.has(String(user.subscription.status))) {
    subscription = { planId: user.subscription.planId };
    planLimitsLogger.debug('Resolved plan from embedded User.subscription (no standalone Subscription doc).', {
      userId, planId: subscription.planId,
    });
  }

  if (!subscription && user.subscription?.isTeamMember && user.subscription?.teamOwner) {
    subscription = await Subscription.findOne({
      user: user.subscription.teamOwner,
      status: { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    }).lean() as { planId?: string } | null;
    if (subscription) {
      planLimitsLogger.debug('Resolved plan via team owner subscription.', {
        userId, teamOwner: user.subscription.teamOwner, planId: subscription.planId,
      });
    }
  }

  const planId = subscription?.planId;
  if (planId === 'starter' || planId === 'pro' || planId === 'custom') {
    planLimitsLogger.debug('Resolved monitoring plan.', { userId, planId });
    return planId;
  }

  planLimitsLogger.debug('No active subscription found — defaulting to free (no monitoring allowed).', { userId });
  return 'free';
}

function resolveScheduleIntervalDays(job: Pick<MonitoringJobDocument, 'schedule' | 'customCronExpression'>): number | null {
  if (job.schedule && job.schedule !== 'custom') {
    return NAMED_SCHEDULE_INTERVAL_DAYS[job.schedule] ?? null;
  }

  // For custom cron, measure the gap between two consecutive computed
  // occurrences as a stand-in for "how often does this actually fire".
  try {
    const first = computeNextRunAt(job, new Date());
    const second = computeNextRunAt(job, first);
    return (second.getTime() - first.getTime()) / (24 * 60 * 60 * 1000);
  } catch (error) {
    // Swallowing this returns null, which the caller treats as "no minimum
    // interval enforced" — silently bypassing the plan's rate limit for a
    // broken custom cron. Log it so that isn't invisible in production.
    planLimitsLogger.warn('Could not resolve custom cron interval for plan-limit check — interval enforcement skipped.', {
      customCronExpression: job.customCronExpression, error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface MonitoringJobLimitCheckInput {
  scanType: MonitoringScanType;
  schedule: MonitoringJobDocument['schedule'];
  customCronExpression?: string;
}

export interface MonitoringJobLimitCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates a (proposed or existing) monitoring job against its owner's
 * current plan limits (2.2.6.3). Intended for reuse both at job-creation
 * time (once the POST /jobs endpoint from 2.2.6.5 exists) and defensively
 * inside the schedule engine itself, since a user's plan can change (e.g.
 * downgrade) after a job was already created.
 */
export async function validateMonitoringJobAgainstPlanLimits(
  userId: string,
  input: MonitoringJobLimitCheckInput,
  activeJobCountExcludingThisOne: number,
): Promise<MonitoringJobLimitCheckResult> {
  const planId = await resolveMonitoringPlanId(userId);
  const limits = MONITORING_PLAN_LIMITS[planId];

  planLimitsLogger.debug('Validating monitoring job against plan limits.', {
    userId, planId, limits, input, activeJobCountExcludingThisOne,
  });

  if (limits.maxActiveJobs <= 0) {
    const reason = `Your plan (${planId}) does not include monitoring. Upgrade to Starter or above to schedule recurring audits.`;
    planLimitsLogger.info('Monitoring job rejected — plan has no monitoring allowance.', { userId, planId, reason });
    return { allowed: false, reason };
  }

  if (activeJobCountExcludingThisOne >= limits.maxActiveJobs) {
    const reason = `Your plan (${planId}) allows up to ${limits.maxActiveJobs} active monitoring job(s); you already have ${activeJobCountExcludingThisOne}.`;
    planLimitsLogger.info('Monitoring job rejected — active job count limit reached.', {
      userId, planId, maxActiveJobs: limits.maxActiveJobs, activeJobCountExcludingThisOne, reason,
    });
    return { allowed: false, reason };
  }

  if (!limits.allowedScanTypes.includes(input.scanType)) {
    const reason = `Your plan (${planId}) does not allow "${input.scanType}" scans for monitoring jobs. Allowed: ${limits.allowedScanTypes.join(', ') || 'none'}.`;
    planLimitsLogger.info('Monitoring job rejected — scan type not allowed on this plan.', {
      userId, planId, requestedScanType: input.scanType, allowedScanTypes: limits.allowedScanTypes, reason,
    });
    return { allowed: false, reason };
  }

  if (limits.minScheduleIntervalDays !== null) {
    const intervalDays = resolveScheduleIntervalDays({ schedule: input.schedule, customCronExpression: input.customCronExpression });
    if (intervalDays !== null && intervalDays < limits.minScheduleIntervalDays) {
      const reason = `Your plan (${planId}) requires monitoring runs at least every ${limits.minScheduleIntervalDays} day(s); the selected schedule runs roughly every ${intervalDays.toFixed(1)} day(s).`;
      planLimitsLogger.info('Monitoring job rejected — schedule frequency exceeds plan minimum interval.', {
        userId, planId, minScheduleIntervalDays: limits.minScheduleIntervalDays, resolvedIntervalDays: intervalDays, reason,
      });
      return { allowed: false, reason };
    }
  }

  planLimitsLogger.debug('Monitoring job passed plan limit validation.', { userId, planId });
  return { allowed: true };
}
