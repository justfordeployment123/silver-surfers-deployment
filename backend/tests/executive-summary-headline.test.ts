import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PDFDocument as PDFLib } from 'pdf-lib';

import {
  computeAggregatePlatformHeadline,
  generateAuditAiSummaryPdf,
  resolvePlatformScanTag,
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

// Phase 8.3 (F13/N11) — per-platform page-detail appendix.

test('generateAuditAiSummaryPdf appends a per-platform page-detail section when more than one platform is present', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-summary-appendix-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const singlePlatformPath = path.join(tmpDir, 'single.pdf');
  await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath: singlePlatformPath,
    scorecard: buildScorecardFixture({ overallScore: 71 }),
    platformSummary: [{ platform: 'Desktop', score: 71, pageCount: 2 }],
  });

  const multiPlatformPath = path.join(tmpDir, 'multi.pdf');
  await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath: multiPlatformPath,
    scorecard: buildScorecardFixture({ overallScore: 71 }),
    platformSummary: [
      { platform: 'Desktop', score: 71, pageCount: 2 },
      { platform: 'Mobile', score: 71, pageCount: 2 },
    ],
    platformPageDetail: [
      {
        platform: 'Desktop',
        pages: [
          { url: 'https://example.com/', score: 71 },
          { url: 'https://example.com/about', score: 71 },
        ],
      },
      {
        platform: 'Mobile',
        pages: [
          { url: 'https://example.com/', score: 71 },
          { url: 'https://example.com/about', score: 71 },
        ],
      },
    ],
  });

  const singlePdf = await PDFLib.load(await fs.readFile(singlePlatformPath));
  const multiPdf = await PDFLib.load(await fs.readFile(multiPlatformPath));

  assert.ok(
    multiPdf.getPageCount() > singlePdf.getPageCount(),
    `expected the appendix to add at least one page (single=${singlePdf.getPageCount()}, multi=${multiPdf.getPageCount()})`,
  );
});

test('generateAuditAiSummaryPdf skips the appendix when platformPageDetail has one platform or fewer', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-summary-no-appendix-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const withoutAppendixPath = path.join(tmpDir, 'without.pdf');
  await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath: withoutAppendixPath,
    scorecard: buildScorecardFixture({ overallScore: 71 }),
    platformSummary: [{ platform: 'Desktop', score: 71, pageCount: 2 }],
  });

  const withOnePlatformPath = path.join(tmpDir, 'one-platform.pdf');
  await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath: withOnePlatformPath,
    scorecard: buildScorecardFixture({ overallScore: 71 }),
    platformSummary: [{ platform: 'Desktop', score: 71, pageCount: 2 }],
    platformPageDetail: [
      {
        platform: 'Desktop',
        pages: [
          { url: 'https://example.com/', score: 71 },
          { url: 'https://example.com/about', score: 71 },
        ],
      },
    ],
  });

  const withoutPdf = await PDFLib.load(await fs.readFile(withoutAppendixPath));
  const onePlatformPdf = await PDFLib.load(await fs.readFile(withOnePlatformPath));

  assert.equal(onePlatformPdf.getPageCount(), withoutPdf.getPageCount());
});

// Phase 6.7c / N10c — device tag on highlighted issues. QA: "Where the source
// is mobile or tablet scan data the claims may even be true; the client just
// cannot verify a single one of them."

const ALL_DEVICES = ['Desktop', 'Mobile', 'Tablet'];

test('resolvePlatformScanTag names the scan behind an issue no desktop report can corroborate', () => {
  assert.equal(resolvePlatformScanTag(['mobile'], ALL_DEVICES), ' (Mobile scan)');
  assert.equal(resolvePlatformScanTag(['tablet'], ALL_DEVICES), ' (Tablet scan)');
  assert.equal(resolvePlatformScanTag(['mobile', 'tablet'], ALL_DEVICES), ' (Mobile & Tablet scan)');
});

test('resolvePlatformScanTag stays silent when the desktop report already backs the issue', () => {
  assert.equal(resolvePlatformScanTag(['desktop'], ALL_DEVICES), '');
  assert.equal(resolvePlatformScanTag(['desktop', 'mobile'], ALL_DEVICES), '');
  assert.equal(resolvePlatformScanTag(['desktop', 'mobile', 'tablet'], ALL_DEVICES), '');
});

test('resolvePlatformScanTag makes no device claim without device data', () => {
  assert.equal(resolvePlatformScanTag(undefined, ALL_DEVICES), '');
  assert.equal(resolvePlatformScanTag([], ALL_DEVICES), '');
  assert.equal(resolvePlatformScanTag(['  '], ALL_DEVICES), '');
});

test('resolvePlatformScanTag does not tag a single-device delivery', () => {
  // The one delivered report is the mobile report, so every issue in it is
  // already verifiable — tagging them all would be noise, not evidence.
  assert.equal(resolvePlatformScanTag(['mobile'], ['Mobile']), '');
  assert.equal(resolvePlatformScanTag(['mobile'], []), '');
});

test('resolvePlatformScanTag never points at a scan the appendix does not document', () => {
  // Tablet has no appendix section here, so a "(Tablet scan)" tag would send
  // the reader looking for backing evidence that was never delivered.
  assert.equal(resolvePlatformScanTag(['tablet'], ['Desktop', 'Mobile']), '');
  assert.equal(resolvePlatformScanTag(['mobile', 'tablet'], ['Desktop', 'Mobile']), '');
  assert.equal(resolvePlatformScanTag(['mobile'], ['Desktop', 'Mobile']), ' (Mobile scan)');
});

test('generateAuditAiSummaryPdf renders tagged mobile-only issues without failing', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-summary-n10c-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const outputPath = path.join(tmpDir, 'ai-executive-summary.pdf');
  const resolved = await generateAuditAiSummaryPdf(buildAiReportFixture(), {
    url: 'https://example.com',
    outputPath,
    scorecard: buildScorecardFixture({
      topIssues: [
        {
          auditId: 'target-size',
          title: 'Touch targets are too small or too close together',
          description: 'd',
          score: 20,
          weight: 10,
          severity: 'high',
          auditSourceType: 'wcag-aa',
          auditSourceLabel: 'WCAG AA',
          wcagCriteria: ['2.5.8'],
          wcagReferences: [],
          pagesAffected: 3,
          sourcePlatforms: ['mobile'],
        },
      ],
    }),
    platformSummary: [
      { platform: 'Desktop', score: 70, pageCount: 2 },
      { platform: 'Mobile', score: 70, pageCount: 2 },
    ],
    platformPageDetail: [
      { platform: 'Desktop', pages: [{ url: 'https://example.com/a', score: 70 }, { url: 'https://example.com/b', score: 70 }] },
      { platform: 'Mobile', pages: [{ url: 'https://example.com/a', score: 70 }, { url: 'https://example.com/b', score: 70 }] },
    ],
  });

  assert.equal(resolved, outputPath);
  const pdf = await PDFLib.load(await fs.readFile(outputPath));
  assert.ok(pdf.getPageCount() >= 1);
});
