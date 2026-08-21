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
    const maxBulkQuickScanUrls = Math.max(1, Number(process.env.ADMIN_BULK_QUICK_SCAN_MAX_URLS) || 200);

    if (!Array.isArray(urls) || urls.length === 0) {
      response.status(400).json({ error: 'URLs array is required and must not be empty.' });
      return;
    }

    if (urls.length > maxBulkQuickScanUrls) {
      response.status(400).json({
        error: `Maximum ${maxBulkQuickScanUrls} URLs allowed per bulk submission. You provided ${urls.length}.`,
      });
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

// Standalone Subscription docs count for a user only when the embedded
// User.subscription is absent/'none' — same fallback rule getUser() below
// uses. Kept as a constant so the aggregation pipeline and any future
// single-user lookups can't drift apart.
const STANDALONE_SUBSCRIPTION_FALLBACK_STATUSES = ['active', 'trialing', 'past_due', 'canceled'];

export async function getUsers(request: Request, response: Response): Promise<void> {
  try {
    const search = String(request.query.search || '').trim();
    const role = request.query.role;
    const subscriptionStatus = String(request.query.subscriptionStatus || 'all').toLowerCase();
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(request.query.limit) || 50), 200);
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = {};

    if (search) {
      match.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    if (role && role !== 'all') {
      match.role = role;
    }

    const accountStatus = String(request.query.accountStatus || 'all').toLowerCase();
    if (accountStatus !== 'all') {
      match.accountStatus = accountStatus;
    }

    // subscriptionStatus needs a computed value (embedded-vs-standalone
    // subscription, plus a derived active/inactive/none/team_member
    // category) that isn't a plain indexable field, so it's resolved here
    // via aggregation instead of a second in-memory pass over every user.
    // Everything through the $facet below happens inside MongoDB — no
    // unpaginated collection is ever pulled into Node.
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      {
        $lookup: {
          from: 'subscriptions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$user', '$$userId'] },
                    { $in: ['$status', STANDALONE_SUBSCRIPTION_FALLBACK_STATUSES] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'standaloneSubscription',
        },
      },
      { $addFields: { standaloneSubscription: { $arrayElemAt: ['$standaloneSubscription', 0] } } },
      {
        $addFields: {
          hasEmbeddedSubscription: {
            $and: [
              { $ne: ['$subscription', null] },
              { $ne: ['$subscription.status', null] },
              { $ne: ['$subscription.status', 'none'] },
            ],
          },
        },
      },
      {
        $addFields: {
          effectiveSubStatus: {
            $cond: ['$hasEmbeddedSubscription', '$subscription.status', '$standaloneSubscription.status'],
          },
          effectiveIsTeamMember: {
            $cond: [
              '$hasEmbeddedSubscription',
              { $ifNull: ['$subscription.isTeamMember', false] },
              { $gt: [{ $size: { $ifNull: ['$standaloneSubscription.teamMembers', []] } }, 0] },
            ],
          },
        },
      },
    ];

    if (subscriptionStatus !== 'all') {
      if (subscriptionStatus === 'team_member') {
        pipeline.push({ $match: { effectiveIsTeamMember: true } });
      } else if (subscriptionStatus === 'none') {
        pipeline.push({ $match: { effectiveSubStatus: { $in: [null, undefined] } } });
      } else if (subscriptionStatus === 'active') {
        pipeline.push({ $match: { effectiveSubStatus: { $in: ['active', 'trialing'] } } });
      } else if (subscriptionStatus === 'inactive') {
        pipeline.push({ $match: { effectiveSubStatus: { $in: ['canceled', 'past_due'] } } });
      }
    }

    pipeline.push({
      $facet: {
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { password: 0, passwordHash: 0, hasEmbeddedSubscription: 0, effectiveSubStatus: 0, effectiveIsTeamMember: 0 } },
        ],
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await User.aggregate(pipeline);
    const rawUsers = (result?.data || []) as Record<string, unknown>[];
    const total = result?.totalCount?.[0]?.count || 0;

    // Shaping runs only over this page's rows (<= limit), not the full
    // collection — the N+1-shaped work the old implementation did for
    // every user in the database now happens for at most `limit` of them.
    const users = rawUsers.map((user) => {
      const userObj = { ...user };
      delete userObj.standaloneSubscription;

      if (!userObj.name && (userObj.firstName || userObj.lastName)) {
        userObj.name = [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || userObj.email;
      }

      userObj.accountStatus = String(userObj.accountStatus || 'active').toLowerCase();

      const embedded = user.subscription as {
        planId?: string;
        status?: string;
        usage?: { scansThisMonth?: number };
        currentPeriodEnd?: Date;
        isTeamMember?: boolean;
        billingCycle?: string;
      } | undefined;

      if (embedded && embedded.status && embedded.status !== 'none') {
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
        const subscription = user.standaloneSubscription as {
          planId?: string;
          status?: string;
          usage?: { scansThisMonth?: number };
          currentPeriodEnd?: Date;
          teamMembers?: unknown[];
          limits?: { scansPerMonth?: number };
        } | undefined;

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
    });

    response.json({
      success: true,
      users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
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

export async function toggleInternalFlag(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');

    if (request.user?.id === id) {
      response.status(400).json({ error: 'You cannot change your own internal flag' });
      return;
    }

    const user = await User.findById(id).select('-password -passwordHash');
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    const currentValue = (user as unknown as Record<string, unknown>).isInternal as boolean ?? false;
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: { isInternal: !currentValue } },
      { new: true },
    ).select('-password -passwordHash');

    response.json({ success: true, user: updated, isInternal: !currentValue });
  } catch (error) {
    console.error('Error toggling internal flag:', error);
    response.status(500).json({ error: 'Failed to update internal flag' });
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

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Cancel any existing active subscription in the database
    const existing = await Subscription.findOne({
      user: userId,
      status: { $in: MANAGEABLE_SUBSCRIPTION_STATUSES },
    });

    if (existing) {
      await Subscription.findByIdAndUpdate(existing._id, {
        status: 'canceled',
        canceledAt: now,
        cancelAtPeriodEnd: false,
      });
    }

    // Create new subscription record directly — no Stripe required for admin assignments
    const newSubscription = new Subscription({
      user: userId,
      stripeSubscriptionId: `admin-${Date.now()}`,
      stripeCustomerId: user.stripeCustomerId || `admin-customer-${String(userId)}`,
      planId: plan.id,
      priceId: plan.yearlyPriceId || `admin-price-${plan.id}`,
      status: 'active',
      limits: plan.limits,
      usage: {
        scansThisMonth: existing?.usage?.scansThisMonth ?? 0,
        totalScans: existing?.usage?.totalScans ?? 0,
      },
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      metadata: {
        createdBy: 'admin',
        adminAssigned: true,
      },
    });

    await newSubscription.save();

    await User.findByIdAndUpdate(userId, {
      'subscription.stripeSubscriptionId': newSubscription.stripeSubscriptionId,
      'subscription.status': 'active',
      'subscription.planId': plan.id,
      'subscription.priceId': newSubscription.priceId,
      'subscription.currentPeriodStart': now,
      'subscription.currentPeriodEnd': periodEnd,
      'subscription.cancelAtPeriodEnd': false,
    });

    response.json({
      message: `Subscription updated to ${plan.name} plan successfully.`,
      subscription: newSubscription,
      created: true,
    });
  } catch (error) {
    console.error('Admin update subscription error:', error);
    response.status(500).json({ error: 'Failed to update subscription.' });
  }
}
