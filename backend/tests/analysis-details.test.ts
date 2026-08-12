import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAggregateRemediationRoadmap, buildAnalysisDetail, buildRemediationRoadmap } from '../src/features/audits/analysis-details.ts';
import type { AuditAiReport } from '../src/features/audits/ai-reporting.ts';

const sampleScorecard = {
  methodologyVersion: 'silver-score-v1',
  categoryId: 'senior-friendly',
  overallScore: 67.4,
  riskTier: 'high',
  scoreStatus: 'fail',
  pageCount: 4,
  evaluatedAt: '2026-03-16T12:00:00.000Z',
  dimensions: [
    {
      key: 'visualClarity',
      label: 'Visual Clarity',
      score: 58,
      weight: 30,
      issueCount: 2,
      topIssues: [
        {
          auditId: 'color-contrast',
          title: 'Color contrast is too low',
          description: 'Text contrast falls below the recommended threshold.',
          score: 52,
          weight: 9,
          severity: 'high',
          auditSourceType: 'wcag-aa',
          auditSourceLabel: 'WCAG AA',
          wcagCriteria: ['1.4.3'],
          displayValue: '4.1:1',
          sourceUrl: 'https://example.com/home',
        },
      ],
    },
    {
      key: 'motorAccessibility',
      label: 'Motor Accessibility',
      score: 61,
      weight: 25,
      issueCount: 1,
      topIssues: [
        {
          auditId: 'target-size',
          title: 'Tap targets are too small',
          description: 'Interactive controls are difficult to hit accurately.',
          score: 61,
          weight: 6,
          severity: 'high',
          auditSourceType: 'wcag-aa',
          auditSourceLabel: 'WCAG AA',
          wcagCriteria: ['2.5.8'],
          sourceUrl: 'https://example.com/checkout',
        },
      ],
    },
    {
      key: 'contentTrust',
      label: 'Content & Trust',
      score: 74,
      weight: 20,
      issueCount: 1,
      topIssues: [
        {
          auditId: 'total-blocking-time',
          title: 'Main thread is blocked too long',
          description: 'The page remains unresponsive during key interactions.',
          score: 74,
          weight: 3,
          severity: 'medium',
          auditSourceType: 'supporting-signal',
          auditSourceLabel: 'Supporting Signal',
        },
      ],
    },
    {
      key: 'cognitiveLoad',
      label: 'Cognitive Load',
      score: 77,
      weight: 25,
      issueCount: 0,
      topIssues: [],
    },
  ],
  evaluationDimensions: [
    { key: 'technicalAccessibility', label: 'Technical Accessibility', score: 79, weight: 12, issueCount: 0, topIssues: [] },
    {
      key: 'visualClarityDesign',
      label: 'Visual Clarity & Design',
      score: 58,
      weight: 40,
      issueCount: 2,
      topIssues: [
        {
          auditId: 'color-contrast',
          title: 'Color contrast is too low',
          description: 'Text contrast falls below the recommended threshold.',
          score: 52,
          weight: 9,
          severity: 'high',
          auditSourceType: 'wcag-aa',
          auditSourceLabel: 'WCAG AA',
          wcagCriteria: ['1.4.3'],
          displayValue: '4.1:1',
          sourceUrl: 'https://example.com/home',
        },
      ],
    },
    { key: 'cognitiveLoadComplexity', label: 'Cognitive Load & Complexity', score: 71, weight: 7, issueCount: 0, topIssues: [] },
    { key: 'navigationArchitecture', label: 'Navigation & Information Architecture', score: 76, weight: 7, issueCount: 0, topIssues: [] },
    { key: 'contentReadability', label: 'Content Readability & Plain Language', score: 77, weight: 15, issueCount: 0, topIssues: [] },
    {
      key: 'interactionForms',
      label: 'Interaction & Forms',
      score: 61,
      weight: 12,
      issueCount: 1,
      topIssues: [
        {
          auditId: 'target-size',
          title: 'Tap targets are too small',
          description: 'Interactive controls are difficult to hit accurately.',
          score: 61,
          weight: 6,
          severity: 'high',
          auditSourceType: 'wcag-aa',
          auditSourceLabel: 'WCAG AA',
          wcagCriteria: ['2.5.8'],
          sourceUrl: 'https://example.com/checkout',
        },
      ],
    },
    {
      key: 'trustSecuritySignals',
      label: 'Trust & Security Signals',
      score: 74,
      weight: 4,
      issueCount: 1,
      topIssues: [
        {
          auditId: 'total-blocking-time',
          title: 'Main thread is blocked too long',
          description: 'The page remains unresponsive during key interactions.',
          score: 74,
          weight: 3,
          severity: 'medium',
          auditSourceType: 'supporting-signal',
          auditSourceLabel: 'Supporting Signal',
        },
      ],
    },
    { key: 'mobileOptimization', label: 'Mobile & Cross-Platform Optimization', score: 69, weight: 15, issueCount: 0, topIssues: [] },
  ],
  topIssues: [
    {
      auditId: 'color-contrast',
      title: 'Color contrast is too low',
      description: 'Text contrast falls below the recommended threshold.',
      score: 52,
      weight: 9,
      severity: 'high',
      auditSourceType: 'wcag-aa',
      auditSourceLabel: 'WCAG AA',
      wcagCriteria: ['1.4.3'],
      displayValue: '4.1:1',
      sourceUrl: 'https://example.com/home',
    },
    {
      auditId: 'target-size',
      title: 'Tap targets are too small',
      description: 'Interactive controls are difficult to hit accurately.',
      score: 61,
      weight: 6,
      severity: 'high',
      auditSourceType: 'wcag-aa',
      auditSourceLabel: 'WCAG AA',
      wcagCriteria: ['2.5.8'],
      sourceUrl: 'https://example.com/checkout',
    },
  ],
  platforms: [
    {
      key: 'desktop',
      label: 'Desktop',
      score: 69,
      pageCount: 2,
    },
    {
      key: 'mobile',
      label: 'Mobile',
      score: 64,
      pageCount: 2,
    },
  ],
} as const;

const sampleAiReport: AuditAiReport = {
  status: 'generated',
  provider: 'anthropic',
  model: 'claude-test-sonnet',
  generatedAt: '2026-03-16T12:05:00.000Z',
  headline: 'Meaningful friction remains in key older-adult journeys',
  summary: 'The site shows a workable base, but readability and interaction friction are still likely reducing confidence and task completion.',
  businessImpact: 'These issues can increase abandonment and reduce trust in important user journeys.',
  prioritySummary: 'Start with medium-effort fixes that remove the most visible reading and interaction barriers.',
  topRecommendations: [
    'Improve contrast and typography hierarchy across critical pages.',
    'Increase tap target sizing in core task flows.',
  ],
  stakeholderNote: 'Use this narrative to support prioritization, not as a compliance claim.',
};

test('buildRemediationRoadmap turns stored scorecard issues into prioritized Phase 1 roadmap items', () => {
  const roadmap = buildRemediationRoadmap(sampleScorecard);

  assert.equal(roadmap.length, 3);
  assert.equal(roadmap[0].auditId, 'color-contrast');
  assert.equal(roadmap[0].impact, 'high');
  assert.equal(roadmap[0].effort, 'medium');
  assert.equal(roadmap[0].bucketKey, 'medium-effort');
  assert.equal(roadmap[0].bucketLabel, 'Medium Effort');
  assert.equal(roadmap[0].evaluationDimensionKey, 'visualClarityDesign');
  assert.equal(roadmap[0].evaluationDimensionLabel, 'Visual Clarity & Design');
  assert.equal(roadmap[0].auditSourceType, 'wcag-aa');
  assert.equal(roadmap[0].auditSourceLabel, 'WCAG AA');
  assert.deepEqual(roadmap[0].wcagCriteria, ['1.4.3']);
  assert.match(roadmap[0].action, /contrast/i);

  assert.equal(roadmap[1].auditId, 'target-size');
  assert.equal(roadmap[1].dimensionKey, 'motorAccessibility');
  assert.equal(roadmap[1].evaluationDimensionKey, 'interactionForms');
  assert.equal(roadmap[1].auditSourceLabel, 'WCAG AA');

  assert.equal(roadmap[2].auditId, 'total-blocking-time');
  assert.equal(roadmap[2].bucketKey, 'high-effort');
  assert.equal(roadmap[2].auditSourceType, 'supporting-signal');
});

// Phase 6.5 / N8 — the exec summary's roadmap must union each page's own
// recommendation objects deduped by rule id, not by rule id *and* page, so
// the same failing audit recurring on multiple pages counts once.
test('buildAggregateRemediationRoadmap unions per-page roadmaps deduped by rule id, keeping the worst occurrence', () => {
  const secondPageScorecard = {
    dimensions: [
      {
        key: 'visualClarity',
        label: 'Visual Clarity',
        score: 40,
        weight: 30,
        issueCount: 1,
        topIssues: [
          {
            auditId: 'color-contrast',
            title: 'Color contrast is too low',
            description: 'Text contrast falls below the recommended threshold.',
            score: 35, // worse than sampleScorecard's 52 for the same audit
            weight: 9,
            severity: 'high',
            auditSourceType: 'wcag-aa',
            auditSourceLabel: 'WCAG AA',
            wcagCriteria: ['1.4.3'],
            sourceUrl: 'https://example.com/about',
          },
        ],
      },
    ],
    evaluationDimensions: [],
  } as any;

  const roadmap = buildAggregateRemediationRoadmap([sampleScorecard, secondPageScorecard]);

  const colorContrastItems = roadmap.filter((item) => item.auditId === 'color-contrast');
  assert.equal(colorContrastItems.length, 1, 'color-contrast must appear once across the site, not once per page');
  assert.equal(colorContrastItems[0].currentScore, 35, 'the worse of the two per-page occurrences represents the audit');
  assert.equal(colorContrastItems[0].sourceUrl, 'https://example.com/about');

  // sampleScorecard alone yields 3 distinct audits; the second page repeats
  // one of them (color-contrast) and adds none new, so the union is still 3.
  assert.equal(roadmap.length, 3);
});

test('buildAnalysisDetail returns normalized scorecard-backed detail payload for account views', () => {
  const detail = buildAnalysisDetail({
    _id: 'rec-1',
    taskId: 'task-123',
    email: 'owner@example.com',
    firstName: 'Ulya',
    lastName: 'Khan',
    url: 'https://example.com',
    planId: 'pro',
    device: 'desktop',
    score: 67.4,
    scoreCard: sampleScorecard,
    aiReport: sampleAiReport,
    status: 'completed',
    emailStatus: 'sent',
    attachmentCount: 3,
    reportDirectory: 'reports-full/example',
    reportFiles: [
      {
        id: 'file-1',
        filename: 'audit-summary.pdf',
        relativePath: 'audit-summary.pdf',
        contentType: 'application/pdf',
      },
    ],
    createdAt: '2026-03-16T12:00:00.000Z',
    updatedAt: '2026-03-16T12:10:00.000Z',
  });

  assert.equal(detail.id, 'rec-1');
  assert.equal(detail.taskId, 'task-123');
  assert.equal(detail.fullName, 'Ulya Khan');
  assert.equal(detail.status, 'completed');
  assert.equal(detail.emailStatus, 'sent');
  assert.equal(detail.riskTier, 'high');
  assert.equal(detail.scoreStatus, 'fail');
  assert.equal(detail.pageCount, 4);
  assert.equal(detail.aiReport?.headline, sampleAiReport.headline);
  assert.equal(detail.aiReport?.provider, 'anthropic');
  assert.equal(detail.dimensions.length, 4);
  assert.equal(detail.evaluationDimensions.length, 8);
  assert.equal(detail.remediationRoadmap.length, 3);
  assert.equal(detail.remediationBuckets.length, 2);
  assert.equal(detail.remediationBuckets[0].key, 'medium-effort');
  assert.equal(detail.remediationBuckets[0].itemCount, 2);
  assert.equal(detail.remediationBuckets[1].key, 'high-effort');
  assert.equal(detail.remediationBuckets[1].items[0].auditId, 'total-blocking-time');
  assert.equal(detail.reportDirectory, 'reports-full/example');
  assert.equal(detail.reportFiles.length, 1);
  assert.equal(detail.reportFiles[0].displayName, 'audit-summary.pdf');
});

test('buildAnalysisDetail preserves degraded full-audit metadata for warning-aware UI views', () => {
  const detail = buildAnalysisDetail({
    taskId: 'task-degraded',
    url: 'https://example.com',
    status: 'completed_with_warnings',
    emailStatus: 'failed',
    successfulTargetCount: 4,
    plannedTargetCount: 6,
    degradedTargetCount: 2,
    failedTargetCount: 1,
    warnings: [
      'Full scanner became unstable on tablet, so remaining tablet pages were scanned in lite mode.',
      'Email delivery failed: SMTP temporarily rejected the login.',
    ],
    scanTargets: [
      {
        url: 'https://example.com/',
        device: 'desktop',
        isHomepage: true,
        scanModeUsed: 'full',
        status: 'completed',
        score: 82,
      },
      {
        url: 'https://example.com/faq',
        device: 'tablet',
        isHomepage: false,
        scanModeUsed: 'lite',
        status: 'failed',
        failureReason: 'Lite fallback also failed.',
        errorCode: 'SERVER_ERROR',
        statusCode: 500,
      },
    ],
  });

  assert.equal(detail.status, 'completed_with_warnings');
  assert.equal(detail.emailStatus, 'failed');
  assert.equal(detail.successfulTargetCount, 4);
  assert.equal(detail.plannedTargetCount, 6);
  assert.equal(detail.degradedTargetCount, 2);
  assert.equal(detail.failedTargetCount, 1);
  assert.equal(detail.warnings.length, 2);
  assert.equal(detail.scanTargets.length, 2);
  assert.equal(detail.scanTargets[1]?.scanModeUsed, 'lite');
  assert.equal(detail.scanTargets[1]?.status, 'failed');
  assert.equal(detail.scanTargets[1]?.statusCode, 500);
});

test('buildRemediationRoadmap uses the failure-phrased template title for ss-label-in-name-audit', () => {
  const scorecard = {
    dimensions: [
      {
        key: 'motorAccessibility',
        label: 'Motor Accessibility',
        score: 40,
        weight: 25,
        issueCount: 1,
        topIssues: [
          {
            auditId: 'ss-label-in-name-audit',
            title: 'Label in name matches visible text (WCAG 2.5.3)',
            description: 'aria-label values do not contain the visible text.',
            score: 0,
            weight: 3,
            severity: 'high',
            auditSourceType: 'aging-heuristic',
            auditSourceLabel: 'Aging Heuristic',
            wcagCriteria: ['2.5.3'],
          },
        ],
      },
    ],
    evaluationDimensions: [],
  } as const;

  const roadmap = buildRemediationRoadmap(scorecard);
  const item = roadmap.find((entry) => entry.auditId === 'ss-label-in-name-audit');
  assert.ok(item);
  assert.equal(item.title, 'Visible label is missing from the accessible name (WCAG 2.5.3)');
});

test('image-alt remediation snippet uses a generic placeholder, not a canned example', () => {
  const scorecard = {
    dimensions: [
      {
        key: 'visualClarity',
        label: 'Visual Clarity',
        score: 40,
        weight: 30,
        issueCount: 1,
        topIssues: [
          {
            auditId: 'image-alt',
            title: 'Images missing alt text',
            description: 'Several images lack alternative text.',
            score: 0,
            weight: 9,
            severity: 'high',
            auditSourceType: 'wcag-aa',
            auditSourceLabel: 'WCAG AA',
            wcagCriteria: ['1.1.1'],
          },
        ],
      },
    ],
    evaluationDimensions: [],
  } as const;

  const roadmap = buildRemediationRoadmap(scorecard);
  const item = roadmap.find((entry) => entry.auditId === 'image-alt');
  assert.ok(item?.codeSnippet);
  assert.ok(!item.codeSnippet.includes('Doctor and patient'), 'canned healthcare example must not recur across sites');
  assert.ok(item.codeSnippet.includes('Descriptive text that names this product'), 'generic placeholder missing');
});

// Phase 9.1 standing check — "44×44 wording unchanged": the target-size
// remediation snippet must keep the exact corrected WCAG 2.5.8 wording
// shipped in Phase 1 (F10) — a client's own consultant would catch a
// regression here, and it was wrong before that fix.
test('target-size remediation snippet keeps the exact corrected 44×44 / WCAG 2.5.8 wording', () => {
  const scorecard = {
    dimensions: [
      {
        key: 'motorAccessibility',
        label: 'Motor Accessibility',
        score: 40,
        weight: 25,
        issueCount: 1,
        topIssues: [
          {
            auditId: 'target-size',
            title: 'Touch targets are too small or too close together (WCAG 2.5.8)',
            description: 'Interactive controls are difficult to hit accurately.',
            score: 0,
            weight: 6,
            severity: 'high',
            auditSourceType: 'wcag-aa',
            auditSourceLabel: 'WCAG AA',
            wcagCriteria: ['2.5.8'],
          },
        ],
      },
    ],
    evaluationDimensions: [],
  } as const;

  const roadmap = buildRemediationRoadmap(scorecard);
  const item = roadmap.find((entry) => entry.auditId === 'target-size');
  assert.ok(item?.codeSnippet);
  assert.ok(
    item.codeSnippet.includes('44×44px: SilverSurfers senior-friendly standard.'),
    'the corrected 44×44 standard line must be present verbatim',
  );
  assert.ok(
    item.codeSnippet.includes('WCAG 2.5.8 (AA) requires 24×24px; 44×44 also satisfies WCAG 2.5.5 (AAA).'),
    'the corrected WCAG 2.5.8/2.5.5 normative line must be present verbatim',
  );
  // The phase-1 bug this guards: "44x44px minimum per WCAG 2.5.8" — wrong,
  // since 2.5.8 actually requires 24x24px — must never reappear.
  assert.ok(!item.codeSnippet.includes('minimum per WCAG 2.5.8'), 'the incorrect phase-1 wording must not recur');
});

// Phase 9.1 standing check — "placeholder sentence count zero": the phase-1
// copy-paste placeholder ("Review this failing audit and implement a code
// or content fix that removes the accessibility barrier for older
// adults.") must never resurface, on audits with a dedicated template or
// ones that fall through to the generic fallback.
test('no remediation item ever reproduces the retired phase-1 placeholder sentence', () => {
  const RETIRED_PLACEHOLDER = 'Review this failing audit and implement a code or content fix that removes the accessibility barrier for older adults.';

  const scorecard = {
    dimensions: [
      {
        key: 'visualClarity',
        label: 'Visual Clarity',
        score: 40,
        weight: 30,
        issueCount: 2,
        topIssues: [
          {
            auditId: 'color-contrast',
            title: 'Color contrast is too low',
            description: 'Text contrast falls below the recommended threshold.',
            score: 0,
            weight: 9,
            severity: 'high',
            auditSourceType: 'wcag-aa',
            auditSourceLabel: 'WCAG AA',
            wcagCriteria: ['1.4.3'],
          },
          {
            // An audit id with no dedicated REMEDIATION_TEMPLATES entry —
            // forces the generic fallback path.
            auditId: 'some-unregistered-audit',
            title: 'Some unregistered audit finding',
            description: 'A finding with no dedicated remediation template.',
            score: 0,
            weight: 3,
            severity: 'medium',
            auditSourceType: 'supporting-signal',
            auditSourceLabel: 'Supporting Signal',
            displayValue: '4 elements failing',
          },
        ],
      },
    ],
    evaluationDimensions: [],
  } as const;

  const roadmap = buildRemediationRoadmap(scorecard);
  assert.ok(roadmap.length >= 2);

  for (const item of roadmap) {
    assert.ok(!item.action.includes(RETIRED_PLACEHOLDER), `${item.auditId}'s action reproduces the retired placeholder`);
    assert.ok(!item.whyItMatters.includes(RETIRED_PLACEHOLDER), `${item.auditId}'s whyItMatters reproduces the retired placeholder`);
  }

  // The unregistered audit must hit the current, accepted generic
  // fallback — not silently produce empty guidance.
  const genericItem = roadmap.find((entry) => entry.auditId === 'some-unregistered-audit');
  assert.ok(genericItem);
  assert.match(genericItem.action, /Review the failing elements identified in the evidence section above/);
});
