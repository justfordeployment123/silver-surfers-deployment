import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAggregateAuditScorecard, buildAuditScorecard } from '../src/features/audits/audit-scorecard.ts';

const FULL_AUDIT_IDS = [
  'color-contrast',
  'target-size',
  'viewport',
  'cumulative-layout-shift',
  'text-font-audit',
  'layout-brittle-audit',
  'flesch-kincaid-audit',
  'largest-contentful-paint',
  'total-blocking-time',
  'link-name',
  'button-name',
  'label',
  'interactive-color-audit',
  'is-on-https',
  'dom-size',
  'heading-order',
  'errors-in-console',
  'geolocation-on-start',
  'image-alt',
  'focus-traps',
  'bypass',
  'line-spacing-audit',
  'autoplay-audit',
];

function buildReport(scoreOverrides: Record<string, number> = {}) {
  const audits = Object.fromEntries(FULL_AUDIT_IDS.map((auditId) => ([
    auditId,
    {
      title: auditId,
      description: `${auditId} description`,
      score: scoreOverrides[auditId] ?? 1,
      displayValue: `${auditId} display`,
    },
  ])));

  return { audits };
}

test('buildAuditScorecard returns a passing low-risk scorecard when all audits pass', () => {
  const scorecard = buildAuditScorecard(buildReport(), { pageUrl: 'https://example.com' });

  assert.equal(scorecard.overallScore, 100);
  assert.equal(scorecard.scoreStatus, 'pass');
  assert.equal(scorecard.riskTier, 'low');
  assert.equal(scorecard.pageCount, 1);
  assert.equal(scorecard.dimensions.length, 4);
  assert.equal(scorecard.evaluationDimensions.length, 8);
  assert.equal(scorecard.topIssues.length, 0);

  const primaryWeights = Object.fromEntries(scorecard.dimensions.map((dimension) => [dimension.key, dimension.weight]));
  assert.deepEqual(primaryWeights, {
    visualClarity: 30,
    cognitiveLoad: 25,
    motorAccessibility: 25,
    contentTrust: 20,
  });

  for (const dimension of scorecard.dimensions) {
    assert.equal(dimension.score, 100);
    assert.equal(dimension.issueCount, 0);
  }
});

test('buildAuditScorecard maps failing audits into evaluation dimensions and primary weighted categories', () => {
  const scorecard = buildAuditScorecard(buildReport({
    'color-contrast': 0,
    'text-font-audit': 0,
    'target-size': 0,
  }), { pageUrl: 'https://example.com/page-a' });

  assert.ok(scorecard.overallScore < 80);
  assert.equal(scorecard.scoreStatus, 'needs-improvement');
  assert.equal(scorecard.riskTier, 'medium');

  const visualClarityDesign = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'visualClarityDesign');
  assert.ok(visualClarityDesign);
  assert.ok(visualClarityDesign.score < 50);
  assert.equal(visualClarityDesign.issueCount, 2);
  assert.equal(visualClarityDesign.topIssues[0].auditId, 'text-font-audit');

  const visualClarity = scorecard.dimensions.find((dimension) => dimension.key === 'visualClarity');
  assert.ok(visualClarity);
  assert.ok(visualClarity.score < 60);
  assert.equal(visualClarity.issueCount, 2);
  assert.equal(visualClarity.topIssues[0].auditId, 'text-font-audit');
  assert.equal(visualClarity.topIssues[0].sourceUrl, 'https://example.com/page-a');
  assert.equal(visualClarity.topIssues[0].auditSourceType, 'aging-heuristic');
  assert.equal(visualClarity.topIssues[0].auditSourceLabel, 'Aging Heuristic');

  const interactionForms = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'interactionForms');
  assert.ok(interactionForms);
  const targetSizeIssue = interactionForms.topIssues.find((issue) => issue.auditId === 'target-size');
  assert.ok(targetSizeIssue);
  assert.equal(targetSizeIssue.auditSourceType, 'wcag-aa');
  assert.equal(targetSizeIssue.auditSourceLabel, 'WCAG AA');
  assert.deepEqual(targetSizeIssue.wcagCriteria, ['2.5.8']);
});

test('buildAggregateAuditScorecard averages page scorecards and keeps worst issues', () => {
  const pageA = buildAuditScorecard(buildReport({
    'color-contrast': 0,
    'text-font-audit': 0,
  }), { pageUrl: 'https://example.com/page-a' });
  const pageB = buildAuditScorecard(buildReport({
    'label': 0,
  }), { pageUrl: 'https://example.com/page-b' });

  const aggregate = buildAggregateAuditScorecard([pageA, pageB], {
    platforms: [
      { key: 'desktop', label: 'Desktop', score: 76, pageCount: 2 },
    ],
  });

  assert.equal(aggregate.pageCount, 2);
  assert.equal(aggregate.platforms.length, 1);
  assert.ok(aggregate.overallScore < 95);
  assert.equal(aggregate.evaluationDimensions.length, 8);
  assert.ok(aggregate.topIssues.length > 0);
  assert.equal(aggregate.topIssues[0].auditId, 'text-font-audit');

  const contentTrust = aggregate.dimensions.find((dimension) => dimension.key === 'contentTrust');
  assert.ok(contentTrust);
  assert.ok(contentTrust.issueCount >= 1);
});

test('buildAuditScorecard honors auditRefs embedded in the scanner report', () => {
  const scorecard = buildAuditScorecard({
    categories: {
      'senior-friendly-lite': {
        auditRefs: [
          { id: 'color-contrast', weight: 1 },
        ],
      },
    },
    audits: {
      'color-contrast': {
        title: 'Contrast',
        description: 'Contrast passed.',
        score: 1,
      },
    },
  }, { isLiteVersion: true });

  assert.equal(scorecard.overallScore, 100);
  assert.equal(scorecard.topIssues.some((issue) => issue.auditId === 'target-size'), false);
});
