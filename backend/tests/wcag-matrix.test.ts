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
