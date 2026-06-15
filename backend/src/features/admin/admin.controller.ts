import type { Request, Response } from 'express';

import { env } from '../../config/env.ts';
import AnalysisRecord from '../../models/analysis-record.model.ts';
import ContactMessage from '../../models/contact-message.model.ts';
import QuickScan from '../../models/quick-scan.model.ts';
import Subscription from '../../models/subscription.model.ts';
import User from '../../models/user.model.ts';
import { buildCandidateUrls, precheckCandidateUrl } from '../audits/precheck.service.ts';
import { getAuditQueues } from '../audits/audits.runtime.ts';
import { getPlanById } from '../billing/subscription-plans.ts';
import { getStripeClient } from '../billing/stripe-client.ts';

const MANAGEABLE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];
const TERMINAL_STRIPE_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);

function normalizeAdminManagedSubscriptionStatus(status: unknown): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'incomplete' || normalized === 'incomplete_expired') {
    return 'active';
  }

  return normalized || 'active';
}

function createTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveBulkQuickScanUrl(rawUrl: string): Promise<{
  input: string;
  normalizedUrl?: string;
  finalUrl?: string;
  status?: number;
  redirected?: boolean;
  checkStatus?: string;
  finalState?: string;
  health?: string;
  reason?: string;
  error?: string;
}> {
  const { candidateUrls, input } = buildCandidateUrls(rawUrl);
  if (!candidateUrls.length) {
    return { input, error: 'Invalid URL' };
  }

  if (env.skipUrlPrecheck) {
    return {
      input,
      normalizedUrl: candidateUrls[0],
      finalUrl: candidateUrls[0],
      redirected: false,
    };
  }

  let fallbackReachableUrl: {
    input: string;
    normalizedUrl?: string;
    finalUrl?: string;
    status?: number;
    redirected?: boolean;
    checkStatus?: string;
    finalState?: string;
    health?: string;
    reason?: string;
  } | undefined;

  for (const candidateUrl of candidateUrls) {
    const result = await precheckCandidateUrl(candidateUrl);
    if (result.ok && result.accessible) {
      return {
        input,
        normalizedUrl: candidateUrl,
        finalUrl: result.finalUrl,
        status: result.status,
        redirected: result.redirected,
        checkStatus: result.checkStatus,
        finalState: result.finalState,
        health: result.health,
        reason: result.reason,
      };
    }

    if (result.ok && !result.accessible) {
      fallbackReachableUrl ??= {
        input,
        normalizedUrl: candidateUrl,
        finalUrl: result.finalUrl,
        status: result.status,
        redirected: result.redirected,
        checkStatus: result.checkStatus,
        finalState: result.finalState,
        health: result.health,
        reason: result.reason,
      };
    }
  }

  if (fallbackReachableUrl?.finalUrl) {
    return fallbackReachableUrl;
  }

  return {
    input,
    error: 'URL not reachable. Please check the domain and try again.',
  };
}

function getStripePeriodDate(unixTimestamp: unknown, fallbackValue: Date | null = null): Date | null {
  const timestamp = Number(unixTimestamp);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000) : fallbackValue;
}

export async function rerunAnalysis(request: Request, response: Response): Promise<void> {
  try {
    const idOrTaskId = String(request.params.idOrTaskId || '');
    let record = null;

    try {
      record = await AnalysisRecord.findById(idOrTaskId);
    } catch {}

    if (!record) {
      record = await AnalysisRecord.findOne({ taskId: idOrTaskId });
    }

    if (!record) {
      response.status(404).json({ error: 'Record not found' });
      return;
    }

    if (!record.email || !record.url) {
      response.status(400).json({ error: 'Record missing email or url' });
      return;
    }

    record.status = 'queued';
    record.emailStatus = 'pending';
    record.emailError = undefined;
    record.failureReason = undefined;
    record.attachmentCount = 0;
    record.emailAccepted = [];
    record.emailRejected = [];
    record.autoRecoveryAttempts = 0;
    record.lastAutoRecoveryAt = undefined;
    await record.save().catch(() => undefined);

    const { fullAuditQueue } = getAuditQueues();
    await fullAuditQueue.addJob({
      email: record.email,
      url: record.url,
      userId: record.user || undefined,
      taskId: record.taskId,
      planId: record.planId,
      selectedDevice: record.device,
      firstName: record.firstName || '',
      lastName: record.lastName || '',
    });

    response.json({
      message: 'Re-run queued on existing record',
      taskId: record.taskId,
      id: record._id,
    });
  } catch (error) {
    console.error('Admin rerun error:', error);
    response.status(500).json({ error: 'Failed to queue re-run' });
  }
}

export async function getQuickScans(request: Request, response: Response): Promise<void> {
  try {
    const page = Number(request.query.page) || 1;
    const limit = Number(request.query.limit) || 50;
    const status = request.query.status;
    const search = request.query.search;
    const sortBy = typeof request.query.sortBy === 'string' ? request.query.sortBy : 'scanDate';
    const sortOrder = request.query.sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { url: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder };

    const [quickScans, total, stats] = await Promise.all([
      QuickScan.find(query).sort(sort).skip(skip).limit(limit),
      QuickScan.countDocuments(query),
      QuickScan.aggregate([
        {
          $group: {
            _id: null,
            totalScans: { $sum: 1 },
            completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            uniqueEmails: { $addToSet: '$email' },
            uniqueUrls: { $addToSet: '$url' },
          },
        },
        {
          $project: {
            totalScans: 1,
            completedScans: 1,
            failedScans: 1,
            uniqueEmails: { $size: '$uniqueEmails' },
            uniqueUrls: { $size: '$uniqueUrls' },
          },
        },
      ]),
    ]);

    response.json({
      success: true,
      items: quickScans,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      statistics: stats[0] || {
        totalScans: 0,
        completedScans: 0,
        failedScans: 0,
        uniqueEmails: 0,
        uniqueUrls: 0,
      },
    });
  } catch (error) {
    console.error('Error fetching quick scans:', error);
    response.status(500).json({ error: 'Failed to fetch quick scans' });
  }
}

export async function bulkQuickScans(request: Request, response: Response): Promise<void> {
  try {
    const { urls, email, firstName, lastName } = request.body ?? {};

    if (!Array.isArray(urls) || urls.length === 0) {
      response.status(400).json({ error: 'URLs array is required and must not be empty.' });
      return;
    }

    if (!email) {
      response.status(400).json({ error: 'Email is required.' });
      return;
    }

    const { quickScanQueue } = getAuditQueues();
    const results: Array<Record<string, unknown>> = [];
    const normalizedEmail = String(email).trim().toLowerCase();

    for (const rawUrl of urls) {
      try {
        const reachableUrl = await resolveBulkQuickScanUrl(String(rawUrl));
        if (!reachableUrl.finalUrl) {
          results.push({
            url: rawUrl,
            success: false,
            error: reachableUrl.error || 'URL not reachable. Please check the domain and try again.',
            checkStatus: reachableUrl.checkStatus,
            finalState: reachableUrl.finalState,
            health: reachableUrl.health,
            reason: reachableUrl.reason,
          });
          continue;
        }

        const quickScanRecord = await QuickScan.create({
          url: reachableUrl.finalUrl,
          email: normalizedEmail,
          firstName: firstName || '',
          lastName: lastName || '',
          device: 'desktop',
          status: 'queued',
          emailStatus: 'pending',
          scanDate: new Date(),
        });

        const taskId = createTaskId();
        await quickScanQueue.addJob({
          email: normalizedEmail,
          url: reachableUrl.finalUrl,
          firstName: firstName || '',
          lastName: lastName || '',
          userId: null,
          taskId,
          jobType: 'quick-scan',
          subscriptionId: null,
          priority: 2,
          quickScanId: quickScanRecord._id,
          selectedDevice: 'desktop',
        });

        results.push({
          url: rawUrl,
          normalizedUrl: reachableUrl.normalizedUrl,
          finalUrl: reachableUrl.finalUrl,
          success: true,
          taskId,
          quickScanId: quickScanRecord._id,
          checkStatus: reachableUrl.checkStatus,
          finalState: reachableUrl.finalState,
          health: reachableUrl.health,
        });
      } catch (error) {
        console.error(`Failed to queue quick scan for ${rawUrl}:`, error);
        results.push({
          url: rawUrl,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    response.json({
      success: true,
      message: `Queued ${results.filter((item) => item.success).length} of ${urls.length} quick scans.`,
      results,
    });
  } catch (error) {
    console.error('Bulk quick scans error:', error);
    response.status(500).json({ error: 'Failed to queue bulk quick scans' });
  }
}

export async function getSubscriptionScans(request: Request, response: Response): Promise<void> {
  try {
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 100, 500);
    const search = request.query.search;
    const planId = request.query.planId;
    const sortBy = typeof request.query.sortBy === 'string' ? request.query.sortBy : 'createdAt';
    const sortOrder = request.query.sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { planId: { $ne: null } };
    if (planId && planId !== 'all') {
      query.planId = planId;
    }
    if (search) {
      const regex = { $regex: search, $options: 'i' };
      query.$or = [{ url: regex }, { email: regex }];
    }

    const allowedSorts = new Set(['createdAt', 'email', 'url', 'score', 'status']);
    const sortField = allowedSorts.has(sortBy) ? sortBy : 'createdAt';
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    const [items, total, stats] = await Promise.all([
      AnalysisRecord.find(query).sort(sort).skip(skip).limit(limit).lean(),
      AnalysisRecord.countDocuments(query),
      AnalysisRecord.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalScans: { $sum: 1 },
            completedScans: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            failedScans: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            uniqueEmails: { $addToSet: '$email' },
            uniqueUrls: { $addToSet: '$url' },
          },
        },
        {
          $project: {
            totalScans: 1,
            completedScans: 1,
            failedScans: 1,
            uniqueEmails: { $size: '$uniqueEmails' },
            uniqueUrls: { $size: '$uniqueUrls' },
          },
        },
      ]),
    ]);

    response.json({
      success: true,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      statistics: stats[0] || {
        totalScans: 0,
        completedScans: 0,
        failedScans: 0,
        uniqueEmails: 0,
        uniqueUrls: 0,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription scans:', error);
    response.status(500).json({ error: 'Failed to fetch subscription scans' });
  }
}

export async function getUsers(request: Request, response: Response): Promise<void> {
  try {
    const search = request.query.search;
    const role = request.query.role;
    const subscriptionStatus = request.query.subscriptionStatus;
    const page = Number(request.query.page) || 1;
    const limit = Number(request.query.limit) || 50;

    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    if (role && role !== 'all') {
      query.role = role;
    }

    const accountStatus = String(request.query.accountStatus || 'all').toLowerCase();
    if (accountStatus !== 'all') {
      query.accountStatus = accountStatus;
    }

    const users = await User.find(query).select('-password -passwordHash').sort({ createdAt: -1 }).lean();

    const usersWithSubscriptions = await Promise.all(users.map(async (user) => {
      const userObj = { ...user } as Record<string, unknown>;

      if (!userObj.name && (userObj.firstName || userObj.lastName)) {
        userObj.name = [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || userObj.email;
      }

      userObj.accountStatus = String(userObj.accountStatus || 'active').toLowerCase();

      if (
        user.subscription
        && typeof user.subscription === 'object'
        && (user.subscription as { status?: string }).status
        && (user.subscription as { status?: string }).status !== 'none'
      ) {
        const embedded = user.subscription as {
          planId?: string;
          status?: string;
          usage?: { scansThisMonth?: number };
          currentPeriodEnd?: Date;
          isTeamMember?: boolean;
          billingCycle?: string;
        };

        userObj.subscription = {
          planName: embedded.planId,
          planId: embedded.planId,
          status: embedded.status,
          scansPerMonth: 0,
          usage: embedded.usage?.scansThisMonth || 0,
          limit: 0,
          currentPeriodEnd: embedded.currentPeriodEnd,
          periodEnd: embedded.currentPeriodEnd,
          isTeamMember: embedded.isTeamMember || false,
          billingCycle: embedded.billingCycle || 'yearly',
        };
      } else {
        const subscription = await Subscription.findOne({
          user: user._id,
          status: { $in: ['active', 'trialing', 'past_due', 'canceled'] },
        }).sort({ createdAt: -1 }).lean();

        userObj.subscription = subscription ? {
          planName: subscription.planId,
          planId: subscription.planId,
          status: subscription.status,
          scansPerMonth: subscription.limits?.scansPerMonth || 0,
          usage: subscription.usage?.scansThisMonth || 0,
          limit: subscription.limits?.scansPerMonth || 0,
          currentPeriodEnd: subscription.currentPeriodEnd,
          periodEnd: subscription.currentPeriodEnd,
          isTeamMember: (subscription.teamMembers?.length || 0) > 0,
          billingCycle: 'yearly',
        } : null;
      }

      return userObj;
    }));

    let filteredUsers = usersWithSubscriptions;
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      filteredUsers = usersWithSubscriptions.filter((user) => {
        const sub = user.subscription as { status?: string; isTeamMember?: boolean } | null;
        if (!sub) {
          return subscriptionStatus === 'none';
        }
        if (subscriptionStatus === 'active') {
          return sub.status === 'active' || sub.status === 'trialing';
        }
        if (subscriptionStatus === 'inactive') {
          return sub.status === 'canceled' || sub.status === 'past_due';
        }
        if (subscriptionStatus === 'team_member') {
          return sub.isTeamMember === true;
        }
        return true;
      });
    }

    const skip = (page - 1) * limit;
    const paginatedUsers = filteredUsers.slice(skip, skip + limit);

    response.json({
      success: true,
      users: paginatedUsers,
      total: filteredUsers.length,
      page,
      limit,
      pages: Math.ceil(filteredUsers.length / limit),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    response.status(500).json({ error: 'Failed to fetch users' });
  }
}

export async function getUser(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const user = await User.findById(id).select('-password -passwordHash').lean();

    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    const subscription = await Subscription.findOne({
      user: id,
      status: { $in: ['active', 'trialing', 'past_due', 'canceled'] },
    }).sort({ createdAt: -1 }).lean();

    response.json({
      success: true,
      user: {
        ...user,
        accountStatus: String((user as { accountStatus?: string }).accountStatus || 'active').toLowerCase(),
        subscription,
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    response.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function resetUserUsage(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const user = await User.findById(id);

    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    const subscription = await Subscription.findOne({
      user: id,
      status: { $in: ['active', 'trialing'] },
    });

    if (subscription) {
      await Subscription.findByIdAndUpdate(subscription._id, {
        $set: { 'usage.scansThisMonth': 0 },
      });
    }

    await User.findByIdAndUpdate(id, {
      $set: { 'subscription.usage.scansThisMonth': 0 },
    });

    response.json({
      success: true,
      message: 'User usage reset successfully',
    });
  } catch (error) {
    console.error('Error resetting user usage:', error);
    response.status(500).json({ error: 'Failed to reset user usage' });
  }
}

export async function updateUserRole(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const role = request.body?.role;

    if (!role || !['user', 'admin'].includes(String(role))) {
      response.status(400).json({ error: 'Valid role (user or admin) is required' });
      return;
    }

    if (request.user?.id === id && role !== 'admin') {
      response.status(400).json({ error: 'You cannot demote yourself from admin role' });
      return;
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select('-password -passwordHash');

    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    response.status(500).json({ error: 'Failed to update user role' });
  }
}

export async function updateUserStatus(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const status = String(request.body?.status || '').trim().toLowerCase();
    const reason = String(request.body?.reason || '').trim();

    if (!['active', 'suspended'].includes(status)) {
      response.status(400).json({ error: 'Valid status (active or suspended) is required' });
      return;
    }

    if (request.user?.id === id && status === 'suspended') {
      response.status(400).json({ error: 'You cannot suspend your own account' });
      return;
    }

    const update: Record<string, unknown> = {
      accountStatus: status,
    };
    const unset: Record<string, unknown> = {};

    if (status === 'suspended') {
      update.suspendedAt = new Date();
      update.suspendedBy = request.user?.id;
      update.suspensionReason = reason || 'Suspended by admin';
    } else {
      unset.suspendedAt = 1;
      unset.suspendedBy = 1;
      unset.suspensionReason = 1;
    }

    const user = await User.findByIdAndUpdate(
      id,
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update },
      { new: true },
    ).select('-password -passwordHash');

    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.json({ success: true, user });
  } catch (error) {
    console.error('Error updating user status:', error);
    response.status(500).json({ error: 'Failed to update user status' });
  }
}

export async function updateUserSubscription(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.body?.userId;
    const planId = request.body?.planId;

    if (!userId || !planId) {
      response.status(400).json({ error: 'User ID and Plan ID are required.' });
      return;
    }

    const plan = getPlanById(String(planId));
    if (!plan) {
      response.status(400).json({ error: 'Invalid plan ID.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      response.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!plan.yearlyPriceId) {
      response.status(400).json({ error: 'Price ID not configured for this plan.' });
      return;
    }

    const stripe = getStripeClient();
    let currentSubscription = await Subscription.findOne({
      user: userId,
      status: { $in: MANAGEABLE_SUBSCRIPTION_STATUSES },
    });
    let stripeSub: Record<string, unknown> | null = null;

    if (currentSubscription) {
      try {
        stripeSub = await stripe.subscriptions.retrieve(currentSubscription.stripeSubscriptionId) as unknown as Record<string, unknown>;
      } catch (error) {
        const stripeError = error as { statusCode?: number; code?: string };
        if (stripeError.statusCode !== 404 && stripeError.code !== 'resource_missing') {
          throw error;
        }

        await Subscription.findByIdAndUpdate(currentSubscription._id, {
          status: 'canceled',
          canceledAt: new Date(),
          cancelAtPeriodEnd: false,
        });

        await User.findByIdAndUpdate(userId, {
          'subscription.stripeSubscriptionId': currentSubscription.stripeSubscriptionId,
          'subscription.status': 'canceled',
          'subscription.cancelAtPeriodEnd': false,
        });

        currentSubscription = null;
      }
    }

    if (currentSubscription && stripeSub && TERMINAL_STRIPE_SUBSCRIPTION_STATUSES.has(String(stripeSub.status))) {
      const canceledPeriodStart = getStripePeriodDate(
        stripeSub.current_period_start,
        currentSubscription.currentPeriodStart || null,
      );
      const canceledPeriodEnd = getStripePeriodDate(
        stripeSub.current_period_end,
        currentSubscription.currentPeriodEnd || null,
      );
      const canceledAt = getStripePeriodDate(stripeSub.canceled_at, new Date());

      const canceledSubscriptionUpdate: Record<string, unknown> = {
        status: 'canceled',
        canceledAt,
        cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
      };

      if (canceledPeriodStart) {
        canceledSubscriptionUpdate.currentPeriodStart = canceledPeriodStart;
      }
      if (canceledPeriodEnd) {
        canceledSubscriptionUpdate.currentPeriodEnd = canceledPeriodEnd;
      }

      await Subscription.findByIdAndUpdate(currentSubscription._id, canceledSubscriptionUpdate);

      const canceledUserUpdate: Record<string, unknown> = {
        'subscription.stripeSubscriptionId': currentSubscription.stripeSubscriptionId,
        'subscription.status': 'canceled',
        'subscription.cancelAtPeriodEnd': Boolean(stripeSub.cancel_at_period_end),
      };

      if (canceledPeriodStart) {
        canceledUserUpdate['subscription.currentPeriodStart'] = canceledPeriodStart;
      }
      if (canceledPeriodEnd) {
        canceledUserUpdate['subscription.currentPeriodEnd'] = canceledPeriodEnd;
      }

      await User.findByIdAndUpdate(userId, canceledUserUpdate);
      currentSubscription = null;
      stripeSub = null;
    }

    if (!currentSubscription) {
      if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.email,
          metadata: {
            userId: String(userId),
            createdBy: 'admin',
          },
        });
        user.stripeCustomerId = customer.id;
        await user.save();
      }

      const stripeSubscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{ price: plan.yearlyPriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId: String(userId),
          planId: String(planId),
          createdBy: 'admin',
        },
      }) as unknown as Record<string, unknown>;

      const currentPeriodStart = getStripePeriodDate(stripeSubscription.current_period_start, new Date()) || new Date();
      const currentPeriodEnd = getStripePeriodDate(
        stripeSubscription.current_period_end,
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const newSubscription = new Subscription({
        user: userId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: user.stripeCustomerId,
        planId: plan.id,
        priceId: plan.yearlyPriceId,
        status: normalizeAdminManagedSubscriptionStatus(stripeSubscription.status),
        limits: plan.limits,
        usage: {
          scansThisMonth: 0,
          totalScans: 0,
        },
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        metadata: {
          createdBy: 'admin',
        },
      });

      await newSubscription.save();

      await User.findByIdAndUpdate(userId, {
        'subscription.stripeSubscriptionId': stripeSubscription.id,
        'subscription.status': normalizeAdminManagedSubscriptionStatus(stripeSubscription.status),
        'subscription.planId': plan.id,
        'subscription.priceId': plan.yearlyPriceId,
        'subscription.usage.scansThisMonth': 0,
        'subscription.currentPeriodStart': currentPeriodStart,
        'subscription.currentPeriodEnd': currentPeriodEnd,
        'subscription.cancelAtPeriodEnd': Boolean(stripeSubscription.cancel_at_period_end),
      });

      response.json({
        message: 'New subscription created successfully',
        subscription: newSubscription,
        created: true,
      });
      return;
    }

    const subscriptionItemId = (stripeSub?.items as { data?: Array<{ id?: string }> } | undefined)?.data?.[0]?.id;
    if (!subscriptionItemId) {
      response.status(500).json({ error: 'Could not determine subscription item to update.' });
      return;
    }

    const updatedSubscription = await stripe.subscriptions.update(
      currentSubscription.stripeSubscriptionId,
      {
        items: [{ id: subscriptionItemId, price: plan.yearlyPriceId }],
        proration_behavior: 'create_prorations',
        metadata: {
          planId: String(planId),
          billingCycle: 'yearly',
          adminUpdated: 'true',
        },
      },
    ) as unknown as Record<string, unknown>;

    const updatedPeriodStart = getStripePeriodDate(
      updatedSubscription.current_period_start,
      currentSubscription.currentPeriodStart || null,
    );
    const updatedPeriodEnd = getStripePeriodDate(
      updatedSubscription.current_period_end,
      currentSubscription.currentPeriodEnd || null,
    );

    const subscriptionUpdate: Record<string, unknown> = {
      planId: plan.id,
      priceId: plan.yearlyPriceId,
      limits: plan.limits,
      status: normalizeAdminManagedSubscriptionStatus(updatedSubscription.status),
      cancelAtPeriodEnd: Boolean(updatedSubscription.cancel_at_period_end),
      metadata: {
        ...(currentSubscription.metadata || {}),
        createdBy: 'admin',
      },
    };
    if (updatedPeriodStart) {
      subscriptionUpdate.currentPeriodStart = updatedPeriodStart;
    }
    if (updatedPeriodEnd) {
      subscriptionUpdate.currentPeriodEnd = updatedPeriodEnd;
    }
    await Subscription.findByIdAndUpdate(currentSubscription._id, subscriptionUpdate);

    const userSubscriptionUpdate: Record<string, unknown> = {
      'subscription.stripeSubscriptionId': updatedSubscription.id,
      'subscription.status': normalizeAdminManagedSubscriptionStatus(updatedSubscription.status),
      'subscription.planId': plan.id,
      'subscription.priceId': plan.yearlyPriceId,
      'subscription.cancelAtPeriodEnd': Boolean(updatedSubscription.cancel_at_period_end),
    };
    if (updatedPeriodStart) {
      userSubscriptionUpdate['subscription.currentPeriodStart'] = updatedPeriodStart;
    }
    if (updatedPeriodEnd) {
      userSubscriptionUpdate['subscription.currentPeriodEnd'] = updatedPeriodEnd;
    }
    await User.findByIdAndUpdate(userId, userSubscriptionUpdate);

    response.json({
      message: 'Subscription updated successfully by admin.',
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error('Admin update subscription error:', error);
    response.status(500).json({ error: 'Failed to update subscription.' });
  }
}
