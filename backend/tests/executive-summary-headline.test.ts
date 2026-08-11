import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PDFDocument as PDFLib } from 'pdf-lib';

import {
  computeAggregatePlatformHeadline,
  generateAuditAiSummaryPdf,
  type PlatformSummaryEntry,
} from '../src/features/audits/report-generation.ts';
import type { AuditAiReport } from '../src/features/audits/ai-reporting.ts';

// Phase 6.1 / N1 — headline must reproduce the same platform table it sits above.

test('computeAggregatePlatformHeadline weights by page count and matches the simple mean when page counts are equal', () => {
  const rows: PlatformSummaryEntry[] = [
    { platform: 'Desktop', score: 71, pageCount: 25 },
    { platform: 'Mobile', score: 68, pageCount: 25 },
    { platform: 'Tablet', score: 71, pageCount: 25 },
  ];

  const result = computeAggregatePlatformHeadline(rows, 65);

  // (71 + 68 + 71) / 3 = 70 — matches the QA report's kristychettle exhibit.
  assert.equal(result.score, 70);
  assert.equal(Math.round(result.simpleMean * 10) / 10, 70);
});

test('computeAggregatePlatformHeadline weights platforms with fewer audited pages less heavily', () => {
  const rows: PlatformSummaryEntry[] = [
    { platform: 'Desktop', score: 90, pageCount: 20 },
    { platform: 'Mobile', score: 50, pageCount: 1 },
  ];

  const result = computeAggregatePlatformHeadline(rows, 0);

  // Weighted: (90*20 + 50*1) / 21 ≈ 88.1 — far closer to Desktop than the
  // unweighted mean (70) because Desktop covers far more pages.
  assert.ok(result.weightedMean > 85, `expected weighted mean near 88, got ${result.weightedMean}`);
  assert.equal(Math.round(result.simpleMean), 70);
});

test('computeAggregatePlatformHeadline falls back to the provided score when no platform rows have data', () => {
  const result = computeAggregatePlatformHeadline([], 57);
  assert.equal(result.score, 57);
  assert.equal(result.simpleMean, 57);
  assert.equal(result.weightedMean, 57);
});

test('computeAggregatePlatformHeadline ignores rows with a null/missing score', () => {
  const rows: PlatformSummaryEntry[] = [
    { platform: 'Desktop', score: 72, pageCount: 1 },
    { platform: 'Mobile', score: null, pageCount: 0 },
  ];
  const result = computeAggregatePlatformHeadline(rows, 0);
  assert.equal(result.score, 72);
});

function buildAiReportFixture(): AuditAiReport {
  return {
    status: 'fallback',
    provider: 'local',
    generatedAt: new Date('2026-07-30T00:00:00Z').toISOString(),
    headline: 'Usable foundation with meaningful remediation priorities',
    summary: 'This audit scored 70% and is currently classified as Medium risk.',
    businessImpact: 'Fixing the weakest areas should improve trust and task completion.',
    prioritySummary: 'Start with quick wins, then medium and high effort items.',
    topRecommendations: ['Increase contrast on primary text.'],
    perFindingGuidance: [],
    stakeholderNote: 'This summary supports prioritization; it is not a compliance certification.',
  };
}

function buildScorecardFixture(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 65,
    riskTier: 'high',
    scoreStatus: 'fail',
    pageCount: 25,
    dimensions: [
      { key: 'cognitiveLoad', label: 'Cognitive Load', score: 55, weight: 25, issueCount: 1, topIssues: [] },
    ],
    evaluationDimensions: [
      { key: 'trustSecuritySignals', label: 'Trust & Security Signals', score: 100, weight: 3.33, issueCount: 0, topIssues: [] },
      { key: 'mobileOptimization', label: 'Mobile & Cross-Platform Optimization', score: 62, weight: 15.5, issueCount: 2, topIssues: [] },
      // Excluded dimension (weight 0) must never be picked as weakest.
      { key: 'contentReadability', label: 'Content Readability & Plain Language', score: 0, weight: 0, issueCount: 0, topIssues: [] },
    ],
    topIssues: [],
    issues: [],
    platforms: [],
    wcagSummary: { criteriaCount: 99 },
    notApplicableAuditIds: [],
    manualReviewAuditIds: [],
    ...overrides,
  } as any;
}

test('generateAuditAiSummaryPdf computes the headline from the platform table and resolves for a consistent table', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-summary-ok-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const outputPath = path.join(tmpDir, 'ai-executive-summary.pdf');
  const platformSummary: PlatformSummaryEntry[] = [
    { platform: 'Desktop', score: 71, pageCount: 25 },
    { platform: 'Mobile', score: 68, pageCount: 25 },
    { platform: 'Tablet', score: 71, pageCount: 25 },
  ];

  const resolved = await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath,
    scorecard: buildScorecardFixture({ overallScore: 65 }), // deliberately wrong vs. the table
    platformSummary,
    wcagFlaggedCriteriaCount: 14,
  });

  assert.equal(resolved, outputPath);
  const pdf = await PDFLib.load(await fs.readFile(outputPath));
  assert.ok(pdf.getPageCount() >= 1);
});

test('generateAuditAiSummaryPdf rejects instead of shipping a headline that contradicts its own platform table', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-summary-bad-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const outputPath = path.join(tmpDir, 'ai-executive-summary.pdf');
  // One page on a 90%-scoring platform vastly outweighs 20 pages at 40% —
  // weighted mean (~42.4) diverges from the simple mean (65) by more than 1.
  const platformSummary: PlatformSummaryEntry[] = [
    { platform: 'Desktop', score: 90, pageCount: 1 },
    { platform: 'Mobile', score: 40, pageCount: 20 },
  ];

  await assert.rejects(
    generateAuditAiSummaryPdf(buildAiReportFixture(), {
      url: 'https://example.com',
      outputPath,
      scorecard: buildScorecardFixture(),
      platformSummary,
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /diverges from/);
      return true;
    },
  );

  await assert.rejects(fs.access(outputPath));
});
