import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAggregateAuditScorecard, buildAuditScorecard, buildScoreBreakdown } from '../src/features/audits/audit-scorecard.ts';
import { WCAG_CRITERIA_REGISTRY } from '../src/features/audits/wcag-mapping.ts';

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
  // Phase 9.1 (F11): text-font-audit maps to real WCAG AA criteria
  // (1.4.4 Resize Text, 1.4.12 Text Spacing) and must be badged accordingly,
  // not as a no-WCAG-claim "Aging Heuristic" house signal.
  assert.equal(visualClarity.topIssues[0].auditSourceType, 'wcag-aa');
  assert.equal(visualClarity.topIssues[0].auditSourceLabel, 'WCAG AA');
  assert.deepEqual(visualClarity.topIssues[0].wcagCriteria, ['1.4.4', '1.4.12']);

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

// Phase 6.8 / N14 — a finding that recurs across many pages must outrank one
// backed by a single page, even when the single-page finding scores worse.
test('buildAggregateAuditScorecard ranks topIssues by pages affected, not raw score alone, and never repeats an audit id', () => {
  const pageA = buildAuditScorecard(buildReport({ 'color-contrast': 0 }), { pageUrl: 'https://example.com/a' });
  const pageB = buildAuditScorecard(buildReport({ 'color-contrast': 0 }), { pageUrl: 'https://example.com/b' });
  const pageC = buildAuditScorecard(buildReport({ 'color-contrast': 0 }), { pageUrl: 'https://example.com/c' });
  // A single page with a worse (0) score on a different audit — breadth
  // still wins over a lone occurrence.
  const pageD = buildAuditScorecard(buildReport({ 'target-size': 0 }), { pageUrl: 'https://example.com/d' });

  const aggregate = buildAggregateAuditScorecard([pageA, pageB, pageC, pageD]);

  assert.equal(aggregate.topIssues[0].auditId, 'color-contrast');
  assert.equal(aggregate.topIssues[0].pagesAffected, 3);

  const auditIds = aggregate.topIssues.map((issue) => issue.auditId);
  assert.equal(new Set(auditIds).size, auditIds.length, 'topIssues must not repeat the same audit id from different pages');
});

// Phase 6.7b / N10 — two different audits mapped to the same WCAG criterion
// must not both headline as separate "top issues".
test('buildAggregateAuditScorecard collapses topIssues that share a WCAG criterion to one headline slot', () => {
  const makeIssue = (overrides: Record<string, unknown>) => ({
    auditId: 'stub',
    title: 'Stub issue',
    description: '',
    score: 50,
    weight: 10,
    severity: 'medium',
    auditSourceType: 'supporting-signal',
    auditSourceLabel: 'Supporting Signal',
    ...overrides,
  });

  const makePageScorecard = (pageUrl: string, issueOverrides: Record<string, unknown>) => {
    const issue = makeIssue({ sourceUrl: pageUrl, ...issueOverrides });
    return {
      dimensions: [],
      evaluationDimensions: [
        { key: 'technicalAccessibility', label: 'Technical Accessibility', score: issue.score, weight: 10, issueCount: 1, topIssues: [issue] },
      ],
    } as any;
  };

  const scorecards = [
    makePageScorecard('https://example.com/a', { auditId: 'button-name', title: 'Button name issue', score: 30, wcagCriteria: ['2.5.3'] }),
    makePageScorecard('https://example.com/b', { auditId: 'label-content-name-mismatch', title: 'Label mismatch issue', score: 35, wcagCriteria: ['2.5.3'] }),
  ];

  const aggregate = buildAggregateAuditScorecard(scorecards);
  const criteria = aggregate.topIssues.flatMap((issue) => issue.wcagCriteria || []);
  assert.equal(new Set(criteria).size, criteria.length, 'no WCAG criterion should headline twice');
  assert.equal(aggregate.topIssues.length, 1);
  // The worse-scoring (higher-impact) of the two occurrences headlines.
  assert.equal(aggregate.topIssues[0].auditId, 'button-name');
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


test('buildAuditScorecard wires phase-7 trust checks into trustSecuritySignals', () => {
  const report = buildReport();
  report.audits['mixed-content-audit'] = {
    title: 'mixed-content-audit',
    description: 'Mixed content found.',
    score: 0,
    displayValue: '3 insecure HTTP resources loaded',
    details: { items: [{ type: 'img', url: 'http://cdn.example.com/a.png' }, { type: 'script', url: 'http://x.example.com/b.js' }, { type: 'img', url: 'http://x.example.com/c.png' }] },
  };
  report.audits['trust-markers-audit'] = {
    title: 'trust-markers-audit',
    description: 'Some markers found.',
    score: 0.5,
    displayValue: '2 of 4 trust markers found',
  };

  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });
  const trust = scorecard.evaluationDimensions.find((dimension) => dimension.key === 'trustSecuritySignals');
  assert.ok(trust);
  assert.ok(trust.score < 100, 'failing trust checks must drag the component below 100');
  const mixedIssue = trust.topIssues.find((issue) => issue.auditId === 'mixed-content-audit');
  assert.ok(mixedIssue);
  assert.equal(mixedIssue.elementCount, 3);
});

// Phase 9.1 standing check (F11) — "badges match mapped levels": each
// issue's auditSourceLabel badge ("WCAG A" / "WCAG AA") is hand-maintained
// alongside its wcagCriteria list, so the two can drift out of sync if one
// is edited without the other. Cross-check every WCAG-mapped issue's badge
// against the strictest registered conformance level among its own
// criteria (an audit can legitimately span more than one level — e.g.
// interactive-color-audit covers both 1.4.1 (A) and 1.4.11 (AA) — in which
// case the badge shows the stricter of the two, not either alone).
test('every WCAG-mapped issue is badged with the strictest of its own criteria\'s conformance levels', () => {
  const failingScores = Object.fromEntries(FULL_AUDIT_IDS.map((auditId) => [auditId, 0]));
  const scorecard = buildAuditScorecard(buildReport(failingScores), { pageUrl: 'https://example.com' });

  const wcagIssues = scorecard.issues.filter((issue) => issue.wcagCriteria && issue.wcagCriteria.length > 0);
  assert.ok(wcagIssues.length > 0, 'expected at least one WCAG-mapped issue in this fixture');

  const levelRank: Record<string, number> = { A: 1, AA: 2, AAA: 3 };
  for (const issue of wcagIssues) {
    const levels = (issue.wcagCriteria ?? []).map((criterion) => {
      const registered = WCAG_CRITERIA_REGISTRY[criterion];
      assert.ok(registered, `${criterion} must be a registered WCAG criterion`);
      return registered.level;
    });
    const strictest = levels.reduce((strictestSoFar, level) => (levelRank[level] > levelRank[strictestSoFar] ? level : strictestSoFar));
    assert.equal(
      issue.auditSourceLabel,
      `WCAG ${strictest}`,
      `${issue.auditId} references [${issue.wcagCriteria?.join(', ')}] (strictest: ${strictest}) but is badged "${issue.auditSourceLabel}"`,
    );
  }
});

// Phase 9.1 (F11) — direct coverage for the "ss-" custom audit family
// specifically, since FULL_AUDIT_IDS (used by the sweep above) doesn't
// include any of them. Every ss- audit that maps to a WCAG criterion via
// wcag-mapping.ts must be badged WCAG, not the generic "Supporting Signal"
// default it silently fell back to before this fix.
//
// Real scanner reports embed their own `categories['senior-friendly'].
// auditRefs` (built per-scan by scanner_config.py's FULL_AUDIT_REFS, which
// includes the full ss- family with real weights) — getReportCategoryAuditRefs
// reads that first, falling back to the TS-side custom-config.js (a sparser
// list that intentionally omits the ss- family) only when a report carries
// none. This fixture replicates that real shape so the ss- audits are
// actually scored, instead of silently skipped the way a bare buildReport()
// fixture (no embedded categories) would leave them.
test('ss- custom audits mapped to a WCAG criterion are badged WCAG, not Supporting Signal', () => {
  const report = buildReport();
  report.audits['ss-orientation-audit'] = {
    title: 'ss-orientation-audit',
    description: 'No automated lock detected — manual device test recommended.',
    score: null,
    scoreDisplayMode: 'manual',
  };
  report.audits['ss-consistent-navigation-audit'] = {
    title: 'ss-consistent-navigation-audit',
    description: 'Navigation differs from other pages.',
    score: 0,
  };
  report.audits['ss-label-in-name-audit'] = {
    title: 'ss-label-in-name-audit',
    description: 'Visible label is missing from the accessible name.',
    score: 0,
  };
  report.categories = {
    'senior-friendly': {
      auditRefs: [
        ...FULL_AUDIT_IDS.map((id) => ({ id, weight: 1 })),
        { id: 'ss-orientation-audit', weight: 1 },
        { id: 'ss-consistent-navigation-audit', weight: 1 },
        { id: 'ss-label-in-name-audit', weight: 1 },
      ],
    },
  };

  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });

  const consistentNav = scorecard.issues.find((issue) => issue.auditId === 'ss-consistent-navigation-audit');
  assert.ok(consistentNav);
  assert.equal(consistentNav.auditSourceType, 'wcag-aa');
  assert.equal(consistentNav.auditSourceLabel, 'WCAG AA');
  assert.deepEqual(consistentNav.wcagCriteria, ['3.2.3']);

  const labelInName = scorecard.issues.find((issue) => issue.auditId === 'ss-label-in-name-audit');
  assert.ok(labelInName);
  assert.equal(labelInName.auditSourceType, 'wcag-a');
  assert.equal(labelInName.auditSourceLabel, 'WCAG A');
  assert.deepEqual(labelInName.wcagCriteria, ['2.5.3']);
});

// ── Phase 10: cross-document consistency guards ──────────────────────────────
// Each of these locks in a contradiction found by auditing the delivered
// documents against each other. They are the checks a client could run by
// hand with a calculator across the full report, the executive summary and
// the dashboard, so they must never disagree again.

// #1 (N5 residual) — the "Detailed Score Breakdown" table prints its own
// Final Score; that number IS the report's headline score. The two used to be
// computed by different renormalisation schemes and drifted up to 4 points
// apart whenever a dimension was Excluded (the redlobster case).
test('overall score always equals the printed breakdown table\'s own Final Score, including with an excluded dimension', () => {
  const cases: Array<{ label: string; notApplicable: string[] }> = [
    { label: 'all 8 dimensions active', notApplicable: [] },
    { label: 'contentReadability excluded', notApplicable: ['flesch-kincaid-audit'] },
  ];

  for (const testCase of cases) {
    const report = buildReport({ 'link-name': 0, 'heading-order': 0, bypass: 0, 'color-contrast': 0.4 });
    for (const auditId of testCase.notApplicable) {
      report.audits[auditId] = { title: auditId, description: 'n/a', score: null, scoreDisplayMode: 'notApplicable' };
    }

    const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });
    const breakdown = buildScoreBreakdown(scorecard.evaluationDimensions);
    assert.equal(
      Math.round(scorecard.overallScore),
      breakdown.finalScore,
      `${testCase.label}: headline ${Math.round(scorecard.overallScore)}% vs table ${breakdown.finalScore}%`,
    );
  }
});

// #2 (F1 residual) — the aggregate feeds the WCAG matrix stamped on every page
// of the full report. It must carry every failing audit, not just the top 3
// per dimension, or the matrix prints "Pass" for criteria the same page's
// evidence section shows failing.
test('aggregate keeps every failing audit, even past the per-dimension display cap', () => {
  // 6 failing audits all inside visualClarityDesign — double the 3-item cap.
  const failing = {
    'color-contrast': 0,
    'text-font-audit': 0,
    'layout-brittle-audit': 0,
    'line-spacing-audit': 0,
    'interactive-color-audit': 0,
    'cumulative-layout-shift': 0,
  };
  const page = buildAuditScorecard(buildReport(failing), { pageUrl: 'https://example.com/' });
  const aggregate = buildAggregateAuditScorecard([page], { pageCount: 1 });

  assert.equal(page.issues.length, 6);
  assert.equal(aggregate.issues.length, 6, 'aggregate must not drop issues past the 3-per-dimension display cap');

  const dimension = aggregate.evaluationDimensions.find((entry) => entry.key === 'visualClarityDesign');
  assert.ok(dimension);
  assert.equal(dimension.issueCount, 6, 'issueCount is the true total, not the capped topIssues length');
  assert.equal(dimension.topIssues.length, 3, 'topIssues stays capped for display');
});

// #3 (N7 residual) — a page that reported a dimension Not Applicable must not
// be averaged into that dimension as a zero. The executive summary printed 30%
// where the one applicable page in the full report showed 60%.
test('aggregate component score averages only the pages that actually evaluated it', () => {
  const scoredPage = buildAuditScorecard(buildReport({ 'flesch-kincaid-audit': 0.6 }), { pageUrl: 'https://example.com/a' });
  const notApplicableReport = buildReport();
  notApplicableReport.audits['flesch-kincaid-audit'] = {
    title: 'flesch-kincaid-audit', description: 'n/a', score: null, scoreDisplayMode: 'notApplicable',
  };
  const naPage = buildAuditScorecard(notApplicableReport, { pageUrl: 'https://example.com/b' });

  const aggregate = buildAggregateAuditScorecard([scoredPage, naPage], { pageCount: 2 });
  const contentReadability = aggregate.evaluationDimensions.find((entry) => entry.key === 'contentReadability');
  assert.ok(contentReadability);
  assert.equal(contentReadability.score, 60, 'the Not Applicable page must not drag the average toward zero');
});

// #4 (N7 residual) — whether a dimension counts as evaluated must depend on
// the data, not on which page happened to be iterated last.
test('aggregate dimension weight is independent of page order', () => {
  const naReport = buildReport();
  naReport.audits['flesch-kincaid-audit'] = {
    title: 'flesch-kincaid-audit', description: 'n/a', score: null, scoreDisplayMode: 'notApplicable',
  };
  const naPage = buildAuditScorecard(naReport, { pageUrl: 'https://example.com/a' });
  const scoredPage = buildAuditScorecard(buildReport({ 'flesch-kincaid-audit': 0.8 }), { pageUrl: 'https://example.com/b' });

  const weightOf = (pages: Parameters<typeof buildAggregateAuditScorecard>[0]) =>
    buildAggregateAuditScorecard(pages, { pageCount: 2 })
      .evaluationDimensions.find((entry) => entry.key === 'contentReadability')?.weight;

  assert.equal(weightOf([scoredPage, naPage]), 12.92);
  assert.equal(weightOf([naPage, scoredPage]), 12.92);
});

// #5 (N1 residual) — the executive summary headline, scoreCard.overallScore
// and the dashboard's record.score are one number. They were up to 8 points
// apart for the same scan.
test('aggregate overall score is the page-weighted mean of its own platform rows', () => {
  const pages = [0, 1].map((i) => buildAuditScorecard(buildReport({ 'color-contrast': 0.5 }), { pageUrl: `https://example.com/p${i}` }));
  const platforms = [
    { key: 'desktop', label: 'Desktop', score: 71, pageCount: 25 },
    { key: 'mobile', label: 'Mobile', score: 68, pageCount: 25 },
    { key: 'tablet', label: 'Tablet', score: 71, pageCount: 25 },
  ];

  const aggregate = buildAggregateAuditScorecard(pages, { pageCount: 2, platforms });
  assert.equal(aggregate.overallScore, 70, 'must equal the mean of the platform table it ships with');
  assert.equal(aggregate.riskTier, 'medium', 'risk band follows the reconciled score (QA: kristychettle HIGH -> MEDIUM)');

  // Weighted by page count, not a plain mean.
  const uneven = buildAggregateAuditScorecard(pages, {
    pageCount: 2,
    platforms: [
      { key: 'desktop', label: 'Desktop', score: 90, pageCount: 20 },
      { key: 'mobile', label: 'Mobile', score: 50, pageCount: 1 },
    ],
  });
  assert.equal(uneven.overallScore, 88);

  // With no platform rows it falls back to the single-page breakdown arithmetic.
  const noPlatforms = buildAggregateAuditScorecard(pages, { pageCount: 2 });
  assert.equal(noPlatforms.overallScore, buildScoreBreakdown(noPlatforms.evaluationDimensions).finalScore);
});

// ── Phase 6.7c / N10c: device attribution on highlighted issues ──
// QA: "Where the source is mobile or tablet scan data the claims may even be
// true; the client just cannot verify a single one of them."

test('aggregate top issues record every device an audit failed under', () => {
  const desktop = buildAuditScorecard(buildReport({ 'color-contrast': 0.4 }), {
    pageUrl: 'https://example.com/a', platform: 'desktop',
  });
  const mobile = buildAuditScorecard(buildReport({ 'color-contrast': 0.4 }), {
    pageUrl: 'https://example.com/a', platform: 'mobile',
  });

  const aggregate = buildAggregateAuditScorecard([desktop, mobile], { pageCount: 1 });
  const issue = aggregate.topIssues.find((entry) => entry.auditId === 'color-contrast');
  assert.ok(issue, 'color-contrast should headline');
  // The critical case: dedupeIssues keys on auditId::sourceUrl, so these two
  // occurrences collapse to one row. Attribution must still see both devices,
  // otherwise a cross-platform issue gets mislabelled as mobile-only.
  assert.deepEqual(issue.sourcePlatforms, ['desktop', 'mobile']);
});

test('an issue seen only under mobile is attributed to mobile alone', () => {
  const desktop = buildAuditScorecard(buildReport(), {
    pageUrl: 'https://example.com/a', platform: 'desktop',
  });
  const mobile = buildAuditScorecard(buildReport({ 'target-size': 0.2 }), {
    pageUrl: 'https://example.com/a', platform: 'mobile',
  });

  const aggregate = buildAggregateAuditScorecard([desktop, mobile], { pageCount: 1 });
  const issue = aggregate.topIssues.find((entry) => entry.auditId === 'target-size');
  assert.ok(issue, 'target-size should headline');
  assert.deepEqual(issue.sourcePlatforms, ['mobile']);
});

test('platform attribution is omitted when the caller does not scan per device', () => {
  const page = buildAuditScorecard(buildReport({ 'color-contrast': 0.4 }), { pageUrl: 'https://example.com/a' });
  const aggregate = buildAggregateAuditScorecard([page], { pageCount: 1 });
  for (const issue of aggregate.topIssues) {
    assert.equal(issue.sourcePlatforms, undefined, 'no device data must mean no claim about devices');
  }
});
