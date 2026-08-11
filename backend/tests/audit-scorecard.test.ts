import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAggregateAuditScorecard, buildAuditScorecard, buildScoreBreakdown } from '../src/features/audits/audit-scorecard.ts';

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

  const evaluationWeights = Object.fromEntries(scorecard.evaluationDimensions.map((dimension) => [dimension.key, dimension.weight]));
  assert.deepEqual(evaluationWeights, {
    technicalAccessibility: 10,
    visualClarityDesign: 22,
    cognitiveLoadComplexity: 6.25,
    navigationArchitecture: 12.5,
    contentReadability: 12.92,
    interactionForms: 17.5,
    trustSecuritySignals: 3.33,
    mobileOptimization: 15.5,
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

  assert.equal(scorecard.overallScore, 77);
  assert.equal(scorecard.scoreStatus, 'needs-improvement');
  assert.equal(scorecard.riskTier, 'medium');

  const visualClarityDesign = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'visualClarityDesign');
  assert.ok(visualClarityDesign);
  assert.ok(visualClarityDesign.score < 50);
  assert.equal(visualClarityDesign.issueCount, 2);
  assert.equal(visualClarityDesign.topIssues[0].auditId, 'text-font-audit');

  const visualClarity = scorecard.dimensions.find((dimension) => dimension.key === 'visualClarity');
  assert.ok(visualClarity);
  assert.equal(visualClarity.score, 61);
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
  assert.deepEqual(targetSizeIssue.wcagPrinciples, ['operable']);
  assert.equal(targetSizeIssue.wcagReferences?.[0]?.title, 'Target Size (Minimum)');
  assert.equal(targetSizeIssue.wcagReferences?.[0]?.level, 'AA');

  assert.ok(scorecard.wcagSummary);
  assert.equal(scorecard.wcagSummary.byPrinciple.perceivable, 2);
  assert.equal(scorecard.wcagSummary.byPrinciple.operable, 1);
  assert.equal(scorecard.wcagSummary.criteria.some((reference) => reference.criterion === '2.5.8'), true);
});

test('buildAuditScorecard maps axe-core tags to structured WCAG references', () => {
  const scorecard = buildAuditScorecard({
    categories: {
      'senior-friendly-lite': {
        auditRefs: [
          { id: 'axe-aria-allowed-attr', weight: 4 },
        ],
      },
    },
    audits: {
      'axe-aria-allowed-attr': {
        title: 'ARIA attributes are valid',
        description: 'Elements use ARIA attributes that are allowed for their role.',
        score: 0,
        axeTags: ['cat.aria', 'wcag2a', 'wcag412'],
      },
    },
  }, { isLiteVersion: true, pageUrl: 'https://example.com' });

  const issue = scorecard.topIssues[0];
  assert.equal(issue.auditId, 'axe-aria-allowed-attr');
  assert.deepEqual(issue.wcagCriteria, ['4.1.2']);
  assert.deepEqual(issue.wcagPrinciples, ['robust']);
  assert.equal(issue.wcagReferences?.[0]?.source, 'axe-core');
  assert.equal(issue.wcagReferences?.[0]?.title, 'Name, Role, Value');
  assert.equal(scorecard.wcagSummary?.byPrinciple.robust, 1);
  assert.equal(scorecard.wcagSummary?.byLevel.A, 1);
});

test('buildAuditScorecard includes dynamic axe-core violations in Silver Score dimensions', () => {
  const report = buildReport();
  report.audits['axe-aria-required-attr'] = {
    title: 'Required ARIA attributes are present',
    description: 'ARIA widgets include required attributes.',
    score: 0,
    axeImpact: 'serious',
    axeTags: ['cat.aria', 'wcag2a', 'wcag412'],
  };

  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });
  const technical = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'technicalAccessibility');
  assert.ok(technical);
  assert.ok(technical.score < 100);
  assert.equal(technical.topIssues[0].auditId, 'axe-aria-required-attr');
  assert.equal(technical.topIssues[0].weight, 4);
  assert.equal(technical.topIssues[0].auditSourceType, 'wcag-a');
  assert.deepEqual(technical.topIssues[0].wcagCriteria, ['4.1.2']);
  assert.ok(scorecard.overallScore < 100);
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
  assert.ok(aggregate.overallScore < 100);
  assert.equal(aggregate.evaluationDimensions.length, 8);
  assert.ok(aggregate.topIssues.length > 0);
  assert.equal(aggregate.topIssues[0].auditId, 'text-font-audit');

  const motorAccessibility = aggregate.dimensions.find((dimension) => dimension.key === 'motorAccessibility');
  assert.ok(motorAccessibility);
  assert.ok(motorAccessibility.issueCount >= 1);
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

test('buildAuditScorecard excludes notApplicable audits from dimension scoring', () => {
  const report = buildReport();
  report.audits['button-name'] = {
    title: 'button-name',
    description: 'No buttons were found on the page, so the check is not applicable.',
    score: null,
    scoreDisplayMode: 'notApplicable',
    displayValue: 'No buttons found — check not applicable',
  };

  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });

  assert.ok(scorecard.notApplicableAuditIds.includes('button-name'));
  const interactionForms = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'interactionForms');
  assert.ok(interactionForms);
  assert.equal(interactionForms.score, 100);
  assert.equal(interactionForms.issueCount, 0);
  assert.equal(scorecard.overallScore, 100);
});

test('buildScoreBreakdown prints true one-decimal weights that multiply and sum consistently', () => {
  const scorecard = buildAuditScorecard(buildReport({
    'color-contrast': 0.5,
    'label': 0.8,
  }));
  const breakdown = buildScoreBreakdown(scorecard.evaluationDimensions);

  const printedWeights = Object.fromEntries(breakdown.rows.map((row) => [row.key, row.weight]));
  assert.deepEqual(printedWeights, {
    technicalAccessibility: 10,
    visualClarityDesign: 22,
    cognitiveLoadComplexity: 6.3,
    navigationArchitecture: 12.5,
    contentReadability: 12.9,
    interactionForms: 17.5,
    trustSecuritySignals: 3.3,
    mobileOptimization: 15.5,
  });

  // Every printed Weighted cell equals printed Score x printed Weight at display precision.
  for (const row of breakdown.rows) {
    assert.equal(row.weighted, Math.round((((row.score ?? 0) * row.weight) / 100) * 10) / 10);
  }

  // Columns sum to the printed totals, and the final score is the table's own arithmetic.
  assert.equal(breakdown.totalWeight, 100);
  const summedWeighted = Math.round(breakdown.rows.reduce((sum, row) => sum + (row.weighted ?? 0), 0) * 10) / 10;
  assert.equal(breakdown.totalWeighted, summedWeighted);
  assert.equal(breakdown.finalScore, Math.round((breakdown.totalWeighted / breakdown.totalWeight) * 100));
});

test('buildScoreBreakdown renormalizes printed weights when a dimension is excluded', () => {
  const report = buildReport();
  report.audits['flesch-kincaid-audit'] = {
    title: 'flesch-kincaid-audit',
    description: 'Not enough analyzable text, so the check is not applicable.',
    score: null,
    scoreDisplayMode: 'notApplicable',
  };

  const scorecard = buildAuditScorecard(report);
  const contentReadability = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'contentReadability');
  assert.ok(contentReadability);
  assert.equal(contentReadability.weight, 0);

  const breakdown = buildScoreBreakdown(scorecard.evaluationDimensions);
  const excludedRow = breakdown.rows.find((row) => row.key === 'contentReadability');
  assert.ok(excludedRow);
  assert.equal(excludedRow.score, null);
  assert.equal(excludedRow.weight, 0);
  assert.equal(excludedRow.weighted, null);

  // Remaining weights renormalize and the printed column still sums to 100.
  assert.equal(breakdown.totalWeight, 100);
  const visualRow = breakdown.rows.find((row) => row.key === 'visualClarityDesign');
  assert.ok(visualRow);
  assert.ok(visualRow.weight > 22);

  for (const row of breakdown.rows) {
    if (row.weighted === null) continue;
    assert.equal(row.weighted, Math.round((((row.score ?? 0) * row.weight) / 100) * 10) / 10);
  }
});

test('buildAuditScorecard prefers failure-phrased remediation template titles for issues', () => {
  const scorecard = buildAuditScorecard(buildReport({ 'target-size': 0 }), { pageUrl: 'https://example.com' });

  const targetSizeIssue = scorecard.issues.find((issue) => issue.auditId === 'target-size');
  assert.ok(targetSizeIssue);
  assert.equal(targetSizeIssue.title, 'Touch targets are too small or too close together (WCAG 2.5.8)');
});

test('buildAuditScorecard captures failing-element counts from audit details', () => {
  const report = buildReport({ 'color-contrast': 0 });
  report.audits['color-contrast'].details = { items: [{ node: 'a' }, { node: 'b' }, { node: 'c' }] };

  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });
  const contrastIssue = scorecard.issues.find((issue) => issue.auditId === 'color-contrast');
  assert.ok(contrastIssue);
  assert.equal(contrastIssue.elementCount, 3);
});
