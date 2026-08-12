import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverAuditRecords } from '../src/features/audits/audit-recovery.ts';

function buildFindResult<T>(items: T[]) {
  return {
    sort() {
      return {
        limit() {
          return Promise.resolve(items);
        },
      };
    },
  };
}

test('recoverAuditRecords requeues stale full audits and quick scans when no active queue job exists', async () => {
  const savedRecords: string[] = [];
  const fullQueuePayloads: Array<Record<string, unknown>> = [];
  const quickQueuePayloads: Array<Record<string, unknown>> = [];
  const now = new Date('2026-04-06T03:00:00.000Z');

  const fullRecord = {
    _id: 'analysis-1',
    email: 'full@example.com',
    url: 'https://example.com',
    user: 'user-1',
    taskId: 'task-1',
    planId: 'pro',
    device: 'desktop',
    firstName: 'Full',
    lastName: 'Audit',
    status: 'failed',
    emailStatus: 'failed',
    emailError: 'boom',
    failureReason: 'Queued watchdog timeout exceeded.',
    attachmentCount: 2,
    emailAccepted: ['old@example.com'],
    emailRejected: ['bounce@example.com'],
    reportDirectory: '/tmp/reports-full',
    reportStorage: { provider: 's3' },
    reportFiles: [{ filename: 'old.pdf' }],
    score: 41,
    scoreCard: { overallScore: 41 },
    aiReport: { summary: 'old' },
    autoRecoveryAttempts: 0,
    lastAutoRecoveryAt: undefined,
    save: async function (this: any) {
      savedRecords.push(`full:${this.taskId}`);
      return this;
    },
  } as any;

  const quickRecord = {
    _id: 'quick-1',
    email: 'quick@example.com',
    url: 'https://example.org',
    firstName: 'Quick',
    lastName: 'Scan',
    device: 'mobile',
    status: 'queued',
    emailStatus: 'pending',
    emailError: 'stale',
    errorMessage: 'stale',
    reportGenerated: true,
    reportPath: '/tmp/quick/report.pdf',
    reportDirectory: '/tmp/reports-lite',
    reportStorage: { provider: 's3' },
    reportFiles: [{ filename: 'old.pdf' }],
    scanScore: 72,
    scoreCard: { overallScore: 72 },
    aiReport: { summary: 'old' },
    autoRecoveryAttempts: 1,
    scanDate: new Date('2026-04-06T01:00:00.000Z'),
    save: async function (this: any) {
      savedRecords.push(`quick:${this._id}`);
      return this;
    },
  } as any;

  const summary = await recoverAuditRecords({
    AnalysisRecord: {
      find() {
        return buildFindResult([fullRecord]);
      },
    } as any,
    QuickScan: {
      find() {
        return buildFindResult([quickRecord]);
      },
      // Quick-scan recovery claims the record atomically (findOneAndUpdate
      // with a compare-and-swap filter) instead of fetch-then-save, so a
      // second recovery sweep can never double-process the same stale
      // record. Simulate that by applying $set/$inc/$push to the matched
      // record and returning it, mirroring Mongoose's { new: true }.
      async findOneAndUpdate(_filter: Record<string, unknown>, update: Record<string, unknown>) {
        const target = quickRecord as Record<string, unknown>;
        const set = (update.$set || {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(set)) {
          target[key] = value;
        }
        const inc = (update.$inc || {}) as Record<string, number>;
        for (const [key, value] of Object.entries(inc)) {
          target[key] = (Number(target[key]) || 0) + value;
        }
        const push = (update.$push || {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(push)) {
          target[key] = Array.isArray(target[key]) ? [...(target[key] as unknown[]), value] : [value];
        }
        return target;
      },
    } as any,
    AuditJobModel: {
      async findOne() {
        return null;
      },
    },
    fullAuditQueue: {
      async addJob(payload: Record<string, unknown>) {
        fullQueuePayloads.push(payload);
        return {} as any;
      },
    } as any,
    quickScanQueue: {
      async addJob(payload: Record<string, unknown>) {
        quickQueuePayloads.push(payload);
        return {} as any;
      },
    } as any,
    now,
    retryDelayMs: 1_000,
    batchSize: 10,
    maxAttempts: 3,
  });

  // Only the full-audit path still uses fetch-then-save; quick-scan recovery
  // claims its record via the atomic findOneAndUpdate above and never calls
  // .save() on the success path.
  assert.deepEqual(savedRecords.sort(), ['full:task-1']);
  assert.equal(summary.fullAuditsRecovered, 1);
  assert.equal(summary.quickScansRecovered, 1);
  assert.equal(summary.skippedActiveJobs, 0);
  assert.equal(summary.skippedMaxAttempts, 0);
  assert.equal(summary.errors, 0);

  assert.equal(fullRecord.status, 'queued');
  assert.equal(fullRecord.emailStatus, 'pending');
  assert.equal(fullRecord.attachmentCount, 0);
  assert.deepEqual(fullRecord.reportFiles, []);
  assert.equal(fullRecord.autoRecoveryAttempts, 1);
  assert.equal(fullQueuePayloads[0]?.taskId, 'task-1');
  assert.equal(fullQueuePayloads[0]?.recordId, 'analysis-1');

  assert.equal(quickRecord.status, 'queued');
  assert.equal(quickRecord.emailStatus, 'pending');
  assert.equal(quickRecord.reportGenerated, false);
  assert.deepEqual(quickRecord.reportFiles, []);
  assert.equal(quickRecord.autoRecoveryAttempts, 2);
  assert.equal(quickQueuePayloads[0]?.quickScanId, 'quick-1');
  assert.equal(quickQueuePayloads[0]?.selectedDevice, 'mobile');
  assert.ok(typeof quickQueuePayloads[0]?.taskId === 'string' && String(quickQueuePayloads[0]?.taskId).length > 0);
});

test('recoverAuditRecords skips items with active queue jobs or exhausted auto-recovery attempts', async () => {
  const fullRecord = {
    _id: 'analysis-2',
    email: 'skip@example.com',
    url: 'https://skip.example.com',
    taskId: 'task-2',
    status: 'failed',
    emailStatus: 'failed',
    autoRecoveryAttempts: 3,
    save: async function (this: any) {
      return this;
    },
  } as any;

  const quickRecord = {
    _id: 'quick-2',
    email: 'active@example.com',
    url: 'https://active.example.com',
    status: 'processing',
    emailStatus: 'sending',
    autoRecoveryAttempts: 0,
    save: async function (this: any) {
      return this;
    },
  } as any;

  const summary = await recoverAuditRecords({
    AnalysisRecord: {
      find() {
        return buildFindResult([fullRecord]);
      },
    } as any,
    QuickScan: {
      find() {
        return buildFindResult([quickRecord]);
      },
    } as any,
    AuditJobModel: {
      async findOne(query: Record<string, unknown>) {
        return query.quickScanId ? { status: 'processing' } : null;
      },
    },
    fullAuditQueue: {
      async addJob() {
        throw new Error('should not enqueue full audit');
      },
    } as any,
    quickScanQueue: {
      async addJob() {
        throw new Error('should not enqueue quick scan');
      },
    } as any,
    now: new Date('2026-04-06T03:00:00.000Z'),
    retryDelayMs: 1_000,
    batchSize: 10,
    maxAttempts: 3,
  });

  assert.equal(summary.fullAuditsRecovered, 0);
  assert.equal(summary.quickScansRecovered, 0);
  assert.equal(summary.skippedMaxAttempts, 1);
  assert.equal(summary.skippedActiveJobs, 1);
  assert.equal(summary.errors, 0);
});
