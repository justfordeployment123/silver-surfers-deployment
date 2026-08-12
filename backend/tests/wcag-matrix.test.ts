import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWcagMatrix } from '../src/features/audits/wcag-matrix.ts';

function makeIssue(overrides = {}) {
  return {
    auditId: 'color-contrast',
    title: 'Color contrast is too low',
    description: 'Text contrast falls below the recommended threshold.',
    score: 0,
    weight: 9,
    severity: 'high',
    auditSourceType: 'wcag-aa',
    auditSourceLabel: 'WCAG AA',
    wcagCriteria: ['1.4.3'],
    ...overrides,
  };
}

test('criterion whose mapped audits all sit in the pass-with-findings band is not Fail', () => {
  const matrix = buildWcagMatrix([
    makeIssue({ score: 85, elementCount: 12 }),
    makeIssue({ auditId: 'image-alt', score: 80, wcagCriteria: ['1.1.1'], elementCount: 4 }),
  ]);

  const contrast = matrix.find((row) => row.criterion === '1.4.3');
  assert.equal(contrast.status, 'pass');
  assert.equal(contrast.issueCount, 12);

  const alt = matrix.find((row) => row.criterion === '1.1.1');
  assert.equal(alt.status, 'pass', 'score exactly at the pass band must not fail');
  assert.equal(alt.issueCount, 4);
});

test('criterion with an audit below the pass band fails and counts failing elements', () => {
  const matrix = buildWcagMatrix([
    makeIssue({ score: 79, elementCount: 12 }),
  ]);

  const row = matrix.find((entry) => entry.criterion === '1.4.3');
  assert.equal(row.status, 'fail');
  assert.equal(row.issueCount, 12, 'Issues column reports failing elements, not rule count');
});

test('issueCount falls back to failing-check count when audits carry no element details', () => {
  const matrix = buildWcagMatrix([makeIssue({ score: 0 })]);

  const row = matrix.find((entry) => entry.criterion === '1.4.3');
  assert.equal(row.status, 'fail');
  assert.equal(row.issueCount, 1);
});

test('element counts sum across pages for the same criterion', () => {
  const matrix = buildWcagMatrix([
    makeIssue({ auditId: 'image-alt', score: 0, wcagCriteria: ['1.1.1'], elementCount: 7, sourceUrl: 'https://example.com/a' }),
    makeIssue({ auditId: 'image-alt', score: 0, wcagCriteria: ['1.1.1'], elementCount: 5, sourceUrl: 'https://example.com/b' }),
  ]);

  const row = matrix.find((entry) => entry.criterion === '1.1.1');
  assert.equal(row.status, 'fail');
  assert.equal(row.issueCount, 12);
});

// Phase 9.1 standing check — "no frozen matrix clusters": the phase-1 bug
// this guards against printed the same inflated count (e.g. "25 violations
// detected") on every page regardless of what actually failed. Model that
// exact shape here: 25 pages worth of issues, but only one page's audit
// actually fails a given criterion — the matrix must report 1, never 25.
test('issue count reflects only the pages that actually failed, not the full crawl size', () => {
  const matrix = buildWcagMatrix([
    makeIssue({ auditId: 'image-alt', score: 0, wcagCriteria: ['1.1.1'], elementCount: 1, sourceUrl: 'https://example.com/only-failing-page' }),
  ]);

  const row = matrix.find((entry) => entry.criterion === '1.1.1');
  assert.equal(row.status, 'fail');
  assert.equal(row.issueCount, 1, 'a single failing page must never inflate to a frozen sitewide count');
});

// Phase 9.1 standing check — 1.3.4 (Orientation) and 3.2.3 (Consistent
// Navigation) must default to Needs Review, never a fabricated Pass or
// Fail, when the scanner can't positively confirm either (the F6 fix).
// This exercises the TS-side wiring: an audit flagged manual-review by the
// scanner (camoufox_auditor.py sets scoreDisplayMode: "manual" when no
// violation is *and* isn't confirmed) must turn into a needs-review row.
test('1.3.4 and 3.2.3 default to Needs Review when their audits are flagged for manual review', () => {
  const matrix = buildWcagMatrix(
    [], // no failing issues — the common case (no violation detected)
    [],
    ['ss-orientation-audit', 'ss-consistent-navigation-audit'],
  );

  const orientation = matrix.find((row) => row.criterion === '1.3.4');
  assert.equal(orientation.status, 'needs-review');
  assert.equal(orientation.manualReviewRequired, true);

  const consistentNav = matrix.find((row) => row.criterion === '3.2.3');
  assert.equal(consistentNav.status, 'needs-review');
  assert.equal(consistentNav.manualReviewRequired, true);
});

// The same two criteria must still fail honestly when the scanner *does*
// positively detect a real violation (e.g. an actual orientation lock) —
// manual-review defaulting must not mask a genuine, confirmed failure.
test('1.3.4 still fails when a real violation is reported (not silently downgraded to Needs Review)', () => {
  const matrix = buildWcagMatrix([
    makeIssue({ auditId: 'ss-orientation-audit', score: 0, wcagCriteria: ['1.3.4'], elementCount: 1 }),
  ]);

  const orientation = matrix.find((row) => row.criterion === '1.3.4');
  assert.equal(orientation.status, 'fail');
});
