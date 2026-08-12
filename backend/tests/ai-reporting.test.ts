import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuditAiReportMarkdown, buildFallbackAuditAiReport } from '../src/features/audits/ai-reporting.ts';

const scorecard = {
  overallScore: 68,
  riskTier: 'high',
  scoreStatus: 'fail',
  pageCount: 3,
  dimensions: [
    { label: 'Visual Clarity', score: 59, issueCount: 2 },
    { label: 'Cognitive Load', score: 72, issueCount: 1 },
  ],
  evaluationDimensions: [],
  topIssues: [
    {
      title: 'Color contrast is too low',
      score: 52,
      severity: 'high',
      auditSourceLabel: 'WCAG AA',
      wcagCriteria: ['1.4.3'],
    },
    {
      title: 'Tap targets are too small',
      score: 61,
      severity: 'high',
      auditSourceLabel: 'WCAG AA',
      wcagCriteria: ['2.5.8'],
    },
  ],
} as any;

const remediationRoadmap = [
  {
    auditId: 'color-contrast',
    title: 'Color contrast is too low',
    bucketKey: 'medium-effort',
    bucketLabel: 'Medium Effort',
    impact: 'high',
    effort: 'medium',
    action: 'Increase text contrast in primary reading areas.',
    whyItMatters: 'Low-contrast text is hard for older adults to read, especially with age-related vision changes.',
  },
  {
    auditId: 'target-size',
    title: 'Tap targets are too small',
    bucketKey: 'quick-wins',
    bucketLabel: 'Quick Wins',
    impact: 'high',
    effort: 'low',
    action: 'Increase tap target sizes in the main conversion flow.',
    whyItMatters: 'Small tap targets increase mis-clicks for users with reduced fine motor control.',
  },
] as any;

test('buildFallbackAuditAiReport creates a business-friendly local narrative', () => {
  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard,
    remediationRoadmap,
  });

  assert.equal(report.status, 'fallback');
  assert.equal(report.provider, 'local');
  assert.match(report.summary, /68%/);
  assert.match(report.businessImpact, /older adults|trust|task completion/i);
  assert.ok(report.topRecommendations.length >= 2);
});

test('buildAuditAiReportMarkdown renders a downloadable executive summary file', () => {
  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard,
    remediationRoadmap,
  });

  const markdown = buildAuditAiReportMarkdown(report, { url: 'https://example.com' });

  assert.match(markdown, /# AI Executive Summary/);
  assert.match(markdown, /## Top Recommendations/);
  assert.match(markdown, /https:\/\/example\.com/);
});

// Phase 6.4 / N7 — the fallback narrative must name one of the full report's
// eight evaluation-dimension labels, never the four-category primary-
// dimension rollup (whose names appear nowhere in the full report).
test('buildFallbackAuditAiReport names the weakest area from evaluationDimensions, not the primary-dimension rollup', () => {
  const scorecardWithEvaluationDimensions = {
    overallScore: 62,
    riskTier: 'high',
    scoreStatus: 'fail',
    pageCount: 10,
    // A primary-rollup name that must never surface in the summary text.
    dimensions: [
      { label: 'Cognitive Load', score: 20, issueCount: 5 },
    ],
    evaluationDimensions: [
      { label: 'Trust & Security Signals', score: 35, weight: 3.33, issueCount: 2 },
      { label: 'Mobile & Cross-Platform Optimization', score: 90, weight: 15.5, issueCount: 0 },
      // Excluded on every page (weight 0) — must never be picked as weakest
      // even though its score is 0.
      { label: 'Content Readability & Plain Language', score: 0, weight: 0, issueCount: 0 },
    ],
    topIssues: [],
  } as any;

  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard: scorecardWithEvaluationDimensions,
    remediationRoadmap: [],
  });

  assert.match(report.summary, /trust & security signals/i);
  assert.doesNotMatch(report.summary, /cognitive load/i);
  assert.doesNotMatch(report.summary, /content readability/i);
});

// Phase 6.6 / N9 — the same issue must never be named twice in the top-issue
// sentence, even if the caller supplies duplicate-titled entries.
test('buildFallbackAuditAiReport collapses duplicate top-issue titles into the singular sentence form', () => {
  const scorecardWithDuplicateTitles = {
    ...scorecard,
    topIssues: [
      {
        title: 'Elements must meet minimum color contrast ratio thresholds',
        score: 40,
        severity: 'high',
        auditSourceLabel: 'WCAG AA',
        wcagCriteria: ['1.4.3'],
      },
      {
        title: 'Elements must meet minimum color contrast ratio thresholds',
        score: 38,
        severity: 'high',
        auditSourceLabel: 'WCAG AA',
        wcagCriteria: ['1.4.3'],
      },
    ],
  } as any;

  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard: scorecardWithDuplicateTitles,
    remediationRoadmap: [],
  });

  assert.match(
    report.summary,
    /The top issue currently affecting the experience is Elements must meet minimum color contrast ratio thresholds\./,
  );
  assert.doesNotMatch(report.summary, / and Elements must meet minimum color contrast ratio thresholds/);
});

// Phase 6.5 / N8 — never tell a client to "start with quick wins" when the
// roadmap has none.
test('buildFallbackAuditAiReport drops the quick-wins sentence when the roadmap has no quick wins', () => {
  const remediationRoadmapNoQuickWins = [
    {
      auditId: 'a',
      title: 'A',
      bucketKey: 'medium-effort',
      bucketLabel: 'Medium Effort',
      impact: 'high',
      effort: 'medium',
      action: 'Fix A.',
      whyItMatters: 'It matters for older adults.',
    },
    {
      auditId: 'b',
      title: 'B',
      bucketKey: 'high-effort',
      bucketLabel: 'High Effort',
      impact: 'high',
      effort: 'high',
      action: 'Fix B.',
      whyItMatters: 'It matters for older adults too.',
    },
  ] as any;

  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard,
    remediationRoadmap: remediationRoadmapNoQuickWins,
  });

  assert.match(report.prioritySummary, /0 Quick Wins/);
  assert.doesNotMatch(report.prioritySummary, /Start with lower-effort fixes/);
  assert.match(report.prioritySummary, /no quick wins/i);
});

test('buildFallbackAuditAiReport keeps the quick-wins sentence when the roadmap has quick wins', () => {
  const remediationRoadmapWithQuickWins = [
    {
      auditId: 'a',
      title: 'A',
      bucketKey: 'quick-wins',
      bucketLabel: 'Quick Wins',
      impact: 'high',
      effort: 'low',
      action: 'Fix A.',
      whyItMatters: 'It matters for older adults.',
    },
  ] as any;

  const report = buildFallbackAuditAiReport({
    url: 'https://example.com',
    scorecard,
    remediationRoadmap: remediationRoadmapWithQuickWins,
  });

  assert.match(report.prioritySummary, /1 Quick Wins/);
  assert.match(report.prioritySummary, /Start with lower-effort fixes/);
});
