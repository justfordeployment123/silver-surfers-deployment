// Rolling verification for the Phase-2 findings fixes (plan.md phases 1-4 so far).
// Run from backend/:
//   node --import ./scripts/register-typescript-loader.mjs scripts/verify-fixes.js
// Exits 0 only when every check passes. Append new checks as phases land.

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildAuditScorecard, buildScoreBreakdown } from '../src/features/audits/audit-scorecard.ts';
import { orderMergePages, buildMergeTocEntries, buildGapCoverLine } from '../src/features/audits/report-generation.ts';
import { scorePageUrl } from '../src/features/audits/internal-links.ts';
import { buildWcagMatrix } from '../src/features/audits/wcag-matrix.ts';
import { getRemediationTemplateTitle } from '../src/features/audits/analysis-details.ts';

const scannerSource = fs.readFileSync(new URL('../python-scanner/camoufox_auditor.py', import.meta.url), 'utf8');
const scannerServiceSource = fs.readFileSync(new URL('../python-scanner/scanner_service.py', import.meta.url), 'utf8');
const pdfSource = fs.readFileSync(new URL('../src/features/audits/scanner/pdf-generator.js', import.meta.url), 'utf8');
const reportGenerationSource = fs.readFileSync(new URL('../src/features/audits/report-generation.ts', import.meta.url), 'utf8');
const processorSource = fs.readFileSync(new URL('../src/features/audits/full-audit.processor.ts', import.meta.url), 'utf8');
const mappingSource = fs.readFileSync(new URL('../src/features/audits/wcag-mapping.ts', import.meta.url), 'utf8');
const matrixSource = fs.readFileSync(new URL('../src/features/audits/wcag-matrix.ts', import.meta.url), 'utf8');
const analysisDetailsSource = fs.readFileSync(new URL('../src/features/audits/analysis-details.ts', import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`ok   - ${name}`); }
  catch (error) { failed++; console.error(`FAIL - ${name}: ${error.message}`); }
}

// ---------------------------------------------------------------------------
// Phase 1 — PDF combiner & TOC integrity (F2, F3-regression, N3)
// ---------------------------------------------------------------------------
check('phase1: unique request-based PDF filenames (redirect-safe hash suffix)', () => {
  assert.ok(pdfSource.includes('options.url || reportData.requestedUrl || reportData.finalUrl'), 'filename no longer based on the requested URL');
  assert.ok(pdfSource.includes('hashInput'), 'filename hash suffix missing — redirect collisions can overwrite reports');
});

check('phase1: merger guards present (sha256 dedup, gap pages, TOC builder, cover line)', () => {
  assert.ok(reportGenerationSource.includes("createHash('sha256')"), 'byte-identical dedup guard missing');
  assert.ok(reportGenerationSource.includes('renderGapPage'), 'gap-page renderer missing');
  assert.ok(reportGenerationSource.includes('buildMergeTocEntries'), 'TOC builder missing');
  assert.ok(reportGenerationSource.includes('could not be audited due to'), 'honest cover line missing');
});

check('phase1: processor records missingPages (identity pairing, no index shift)', () => {
  assert.ok(processorSource.includes('missingPages.push'), 'missingPages collection missing from full-audit processor');
});

check('phase1: a failed middle page re-inserts as a gap without label drift', () => {
  const reports = [{ url: 'https://example.com/', score: 90 }, { url: 'https://example.com/about', score: 80 }];
  const ordered = orderMergePages(reports, ['home.pdf', 'about.pdf'], [
    { url: 'https://example.com/pricing', reason: 'PDF generation failed.', order: 1 },
  ]);
  assert.deepEqual(ordered.map((page) => page.kind), ['report', 'gap', 'report']);
  assert.equal(ordered[0].pdfPath, 'home.pdf');
  assert.equal(ordered[2].pdfPath, 'about.pdf');
  assert.equal(ordered[2].report.url, 'https://example.com/about', 'label drift: about report paired with wrong PDF');
});

check('phase1: TOC marks gap pages N/A; cover line names the shared cause', () => {
  const toc = buildMergeTocEntries([
    { kind: 'report', report: { url: 'https://example.com/', score: 90 }, pageCount: 6 },
    { kind: 'gap', url: 'https://example.com/pricing', reason: 'bot protection' },
  ]);
  assert.equal(toc[1].score, 'N/A');
  assert.equal(toc[1].actualPageCount, 1);
  assert.equal(toc[0].actualPageCount, 5);
  const gaps = Array.from({ length: 24 }, (_, index) => ({ url: `https://x.test/${index}`, reason: 'bot protection' }));
  assert.equal(buildGapCoverLine(1, gaps), '24 of 25 pages could not be audited due to bot protection; results below cover 1 page.');
});

// ---------------------------------------------------------------------------
// Phase 2 — Crawler quality (F4, F5-blocked/empty)
// ---------------------------------------------------------------------------
check('phase2: python blocklist covers WPM fragments, UUID segments, hex stubs', () => {
  assert.ok(scannerServiceSource.includes('previewimage|cdn|wpm|next|open|close'), 'WPM fragment tokens missing from _BLOCKED_AUDIT_PATH_RE');
  assert.ok(scannerServiceSource.includes('[0-9a-f]{8}-[0-9a-f]{4}'), 'UUID segment rule missing');
  assert.ok(scannerServiceSource.includes('[0-9a-f]{20,}'), 'long-hex rule missing');
});

check('phase2: scanner returns structured failures instead of scoring junk pages', () => {
  for (const code of ['PAGE_NOT_FOUND', 'NON_HTML', 'NO_AUDITABLE_CONTENT']) {
    assert.ok(scannerSource.includes(`"${code}"`), `${code} emission missing from camoufox_auditor.py`);
  }
});

check('phase2: scorePageUrl blocks junk paths without over-blocking real pages', () => {
  for (const url of [
    'https://example.com/previewImage',
    'https://example.com/cdn/shop/t/1/assets/widget.js',
    'https://example.com/wpm/123',
    'https://example.com/next',
    'https://example.com/open',
    'https://example.com/close',
    'https://example.com/b2d05acc-8c4a-4e62-9f2f-1234567890ab',
    'https://example.com/products/abcde12345abcde12345ab',
  ]) {
    assert.equal(scorePageUrl(url, 'https://example.com'), -1, `${url} must score -1`);
  }
  for (const url of ['https://example.com/next-steps', 'https://example.com/open-source', 'https://example.com/closing-remarks', 'https://example.com/about']) {
    assert.ok(scorePageUrl(url, 'https://example.com') > 0, `${url} must keep a positive score`);
  }
});

// ---------------------------------------------------------------------------
// Phase 3.1 static: 9 zero-denominator audits emit notApplicable, no percentage
// ---------------------------------------------------------------------------
check('scanner: exactly 9 zero-denominator "check not applicable" overrides', () => {
  const lines = scannerSource.split('\n');
  const hits = [];
  lines.forEach((line, index) => { if (line.includes('check not applicable')) hits.push(index); });
  assert.equal(hits.length, 9, `expected 9 overrides, found ${hits.length}`);
  for (const index of hits) {
    assert.ok(lines[index + 1]?.includes('"scoreDisplayMode": "notApplicable"'), `line ${index + 1}: displayValue not followed by notApplicable`);
    const above = lines.slice(Math.max(0, index - 4), index).join('\n');
    assert.ok(above.includes('"score": None,'), `line ${index + 1}: missing "score": None above`);
    assert.ok(!lines[index].includes('%'), `line ${index + 1}: displayValue still prints a percentage`);
  }
});

check('scanner: the 9 expected element-denominator phrases are present', () => {
  for (const phrase of [
    'No interactive elements found', // target-size
    'No buttons found',              // button-name
    'No form controls found',        // label
    'No images found',               // image-alt
    'No text elements found',        // text-font-audit
    'No text blocks found',          // line-spacing-audit
    'No text containers found',      // layout-brittle-audit
  ]) {
    assert.ok(scannerSource.includes(`${phrase} — check not applicable`), `missing override: ${phrase}`);
  }
  // link-name and interactive-color-audit share "No links found"
  const linkHits = scannerSource.split('No links found — check not applicable').length - 1;
  assert.equal(linkHits, 2, `expected 2 "No links found" overrides, found ${linkHits}`);
});

// ---------------------------------------------------------------------------
// Phase 3.1/3.2 functional: notApplicable audits leave numerator AND denominator
// ---------------------------------------------------------------------------
const FULL_AUDIT_IDS = [
  'color-contrast', 'target-size', 'viewport', 'cumulative-layout-shift', 'text-font-audit',
  'layout-brittle-audit', 'flesch-kincaid-audit', 'largest-contentful-paint', 'total-blocking-time',
  'link-name', 'button-name', 'label', 'interactive-color-audit', 'is-on-https', 'dom-size',
  'heading-order', 'errors-in-console', 'geolocation-on-start', 'image-alt', 'focus-traps',
  'bypass', 'line-spacing-audit', 'autoplay-audit',
];
function buildReport(scoreOverrides = {}) {
  const audits = Object.fromEntries(FULL_AUDIT_IDS.map((auditId) => ([
    auditId,
    { title: auditId, description: `${auditId} description`, score: scoreOverrides[auditId] ?? 1, displayValue: `${auditId} display` },
  ])));
  return { audits };
}

check('scorecard: notApplicable audit is excluded and dimension renormalizes', () => {
  const report = buildReport();
  report.audits['button-name'] = {
    title: 'button-name', description: 'No buttons found.', score: null,
    scoreDisplayMode: 'notApplicable', displayValue: 'No buttons found — check not applicable',
  };
  const scorecard = buildAuditScorecard(report, { pageUrl: 'https://example.com' });
  assert.ok(scorecard.notApplicableAuditIds.includes('button-name'));
  const interactionForms = scorecard.evaluationDimensions.find((d) => d.key === 'interactionForms');
  assert.equal(interactionForms.score, 100);
  assert.equal(interactionForms.issueCount, 0);
  assert.equal(scorecard.overallScore, 100);
});

// ---------------------------------------------------------------------------
// Phase 3.3 functional: printed weights are the true weights and the table self-checks
// ---------------------------------------------------------------------------
check('scorecard: buildScoreBreakdown prints true weights; Score x Weight == Weighted; columns sum', () => {
  const scorecard = buildAuditScorecard(buildReport({ 'color-contrast': 0.5, label: 0.8 }));
  const breakdown = buildScoreBreakdown(scorecard.evaluationDimensions);
  const printedWeights = Object.fromEntries(breakdown.rows.map((row) => [row.key, row.weight]));
  assert.deepEqual(printedWeights, {
    technicalAccessibility: 10, visualClarityDesign: 22, cognitiveLoadComplexity: 6.3,
    navigationArchitecture: 12.5, contentReadability: 12.9, interactionForms: 17.5,
    trustSecuritySignals: 3.3, mobileOptimization: 15.5,
  });
  for (const row of breakdown.rows) {
    assert.equal(row.weighted, Math.round((((row.score ?? 0) * row.weight) / 100) * 10) / 10, `${row.key}: Weighted != Score x printed Weight`);
  }
  assert.equal(breakdown.totalWeight, 100);
  const summed = Math.round(breakdown.rows.reduce((sum, row) => sum + (row.weighted ?? 0), 0) * 10) / 10;
  assert.equal(breakdown.totalWeighted, summed);
  assert.equal(breakdown.finalScore, Math.round((breakdown.totalWeighted / breakdown.totalWeight) * 100));
});

// ---------------------------------------------------------------------------
// Phase 3.4 functional + static: excluded dimensions -> renormalize + (N/A)
// ---------------------------------------------------------------------------
check('scorecard: excluded dimension renormalizes printed weights to sum 100', () => {
  const report = buildReport();
  report.audits['flesch-kincaid-audit'] = {
    title: 'flesch-kincaid-audit', description: 'Not enough text.', score: null, scoreDisplayMode: 'notApplicable',
  };
  const scorecard = buildAuditScorecard(report);
  const breakdown = buildScoreBreakdown(scorecard.evaluationDimensions);
  const excludedRow = breakdown.rows.find((row) => row.key === 'contentReadability');
  assert.equal(excludedRow.score, null);
  assert.equal(excludedRow.weight, 0);
  assert.equal(excludedRow.weighted, null);
  assert.equal(breakdown.totalWeight, 100);
  assert.ok(breakdown.rows.find((row) => row.key === 'visualClarityDesign').weight > 22);
});

check('pdf: score page derives from buildScoreBreakdown; largest-remainder block removed', () => {
  assert.ok(pdfSource.includes('buildScoreBreakdown'), 'pdf-generator does not import/use buildScoreBreakdown');
  assert.ok(!pdfSource.includes('Largest remainder'), 'largest-remainder weight block still present');
});

check('pdf: excluded dimension evidence header prints (N/A), not (0%)', () => {
  assert.ok(pdfSource.includes(`' (N/A)'`), 'headingSuffix (N/A) branch missing');
  assert.ok(pdfSource.includes('Number(dimensionScore.weight) > 0'), 'headingSuffix no longer keyed off weight');
});

// ---------------------------------------------------------------------------
// Phase 4: extract the real JS the browser receives and test its logic
// ---------------------------------------------------------------------------
function extractEvaluateJs(varName) {
  const marker = `${varName} = page.evaluate("""`;
  const start = scannerSource.indexOf(marker);
  assert.notEqual(start, -1, `${varName} evaluate block not found`);
  const bodyStart = scannerSource.indexOf('"""', start) + 3;
  const bodyEnd = scannerSource.indexOf('"""', bodyStart);
  const raw = scannerSource.slice(bodyStart, bodyEnd);
  for (const escape of raw.match(/\\./g) || []) {
    assert.ok(escape === '\\\\', `unsupported escape "${escape}" in ${varName} block — extend the decoder`);
  }
  return raw.replace(/\\\\/g, '\\');
}

function makeMedia(props) {
  const el = Object.assign({
    tagName: 'VIDEO', autoplay: false, muted: false, paused: true,
    duration: NaN, loop: false, controls: false,
    currentSrc: 'https://x.test/m.mp4', src: '', id: '', className: '',
  }, props);
  el.hasAttribute = (name) => (name === 'autoplay' ? el.autoplay : false);
  el.getAttribute = () => null;
  return el;
}

let autoplayFn;
let motionFn;
check('phase4: autoplay and 2.2.2 evaluate blocks are valid JS once Python-decoded', () => {
  autoplayFn = new Function(`return (${extractEvaluateJs('autoplay_results')});`)();
  motionFn = new Function(`return (${extractEvaluateJs('motion_results')});`)();
});

function runAutoplay(media) {
  globalThis.document = { querySelectorAll: (sel) => (sel === 'video, audio' ? media : []) };
  return autoplayFn();
}
function runMotion(videos) {
  globalThis.document = { querySelectorAll: (sel) => (sel === 'video' ? videos : []) };
  return motionFn();
}

check('4.1 ACT 80f0bf: only audible autoplay fails 1.4.2', () => {
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: false, duration: 10, mozHasAudio: true })]).failingCount, 1, 'unmuted playing >3s with audio must fail');
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: false, duration: 2, loop: true, mozHasAudio: true })]).failingCount, 1, 'short but looping must fail');
  assert.equal(runAutoplay([makeMedia({ tagName: 'AUDIO', autoplay: true, muted: false, paused: false, duration: 10 })]).failingCount, 1, '<audio> always has audio');
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: false, duration: 10 })]).failingCount, 1, 'unknown audio presence counts as audio');
});

check('4.1 false-positive guards: muted / blocked / short / silent-track do NOT fail', () => {
  const muted = runAutoplay([makeMedia({ autoplay: true, muted: true, paused: false, duration: 5, loop: true })]);
  assert.equal(muted.failingCount, 0, 'muted loop must not fail 1.4.2');
  assert.equal(muted.mutedCount, 1, 'muted loop must be collected separately');
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: true, duration: 10, mozHasAudio: true })]).failingCount, 0, 'browser-blocked (paused) must not fail');
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: false, duration: 2, mozHasAudio: true })]).failingCount, 0, '<=3s must not fail');
  assert.equal(runAutoplay([makeMedia({ autoplay: true, muted: false, paused: false, duration: 10, mozHasAudio: false })]).failingCount, 0, 'no audio track must not fail');
  assert.equal(runAutoplay([makeMedia({ autoplay: false, paused: false, duration: 10 })]).failingCount, 0, 'non-autoplay ignored');
});

check('4.2 muted loops route to 2.2.2 review; unmuted autoplay stays a hard issue', () => {
  const hard = runMotion([makeMedia({ autoplay: true, muted: false })]);
  assert.equal(hard.issueCount, 1, 'unmuted autoplay video must stay a 2.2.2 issue');
  assert.equal(hard.mutedLoopCount, 0);
  const muted = runMotion([makeMedia({ autoplay: true, muted: true, loop: true, controls: false, id: 'hero' })]);
  assert.equal(muted.issueCount, 0, 'muted loop is not a hard issue');
  assert.equal(muted.mutedLoopCount, 1, 'muted loop without controls collected');
  assert.equal(muted.mutedLoops[0].selector, 'video#hero');
  assert.equal(runMotion([makeMedia({ autoplay: true, muted: true, loop: true, controls: true })]).mutedLoopCount, 0, 'controls present -> not collected');
  assert.equal(runMotion([makeMedia({ autoplay: true, muted: true, duration: 2 })]).mutedLoopCount, 0, 'short non-looping -> not collected');
  assert.equal(runMotion([makeMedia({ autoplay: true, muted: true, duration: 30 })]).mutedLoopCount, 1, 'long muted autoplay collected');
  const empty = runMotion([]);
  assert.equal(empty.issueCount, 0);
  assert.equal(empty.mutedLoopCount, 0);
});

check('4.2 scanner emits manual needs-review when only muted loops exist', () => {
  assert.ok(scannerSource.includes('"scoreDisplayMode": "manual",\n                            "displayValue": f"{muted_loop_count} muted loop(s) without controls'), 'manual emission for muted loops missing');
  assert.ok(scannerSource.includes('muted_loop_count > 0:'), 'muted-loop branch missing');
});

check('4.2 regression: broken data-slick selector is gone', () => {
  assert.ok(!scannerSource.includes(`[data-slick*=\\'"autoplay":true\\']`), 'old quote-nested selector still present');
  assert.ok(scannerSource.includes(`indexOf('"autoplay":true')`), 'JS-side data-slick filter missing');
});

check('4.3 mapping + manual flow into the matrix', () => {
  assert.ok(mappingSource.includes('"1.4.2": ["autoplay-audit"]'), '1.4.2 mapping changed');
  assert.ok(mappingSource.includes('"2.2.2": ["autoplay-audit", "ss-pause-stop-hide-audit"]'), '2.2.2 mapping changed');
  assert.ok(mappingSource.includes('"autoplay-audit": ["1.4.2", "2.2.2"]'), 'audit->criteria mapping changed');
  assert.ok(mappingSource.includes('"ss-pause-stop-hide-audit": ["2.2.2"]'), 'pause-stop-hide mapping changed');
  assert.ok(matrixSource.includes('manualReviewSet.has(id)'), 'matrix needs-review branch missing');
  const report = buildReport();
  report.audits['autoplay-audit'] = { title: 'autoplay-audit', description: 'manual', score: null, scoreDisplayMode: 'manual' };
  const scorecard = buildAuditScorecard(report);
  assert.ok(scorecard.manualReviewAuditIds.includes('autoplay-audit'), 'manual audit not surfaced for review');
  assert.equal(scorecard.evaluationDimensions.find((d) => d.key === 'cognitiveLoadComplexity').score, 100, 'manual audit must not drag the dimension');
});

// ---------------------------------------------------------------------------
// Phase 5 — matrix consistency & templates (F1-residual, F9, N13)
// ---------------------------------------------------------------------------
function makeMatrixIssue(overrides = {}) {
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

check('phase5: matrix Issues column counts failing elements (evidence parity)', () => {
  const matrix = buildWcagMatrix([
    makeMatrixIssue({ auditId: 'image-alt', score: 0, wcagCriteria: ['1.1.1'], elementCount: 7, sourceUrl: 'https://example.com/a' }),
    makeMatrixIssue({ auditId: 'image-alt', score: 0, wcagCriteria: ['1.1.1'], elementCount: 5, sourceUrl: 'https://example.com/b' }),
    makeMatrixIssue({ score: 0 }),
  ]);
  assert.equal(matrix.find((row) => row.criterion === '1.1.1').issueCount, 12, 'element totals must sum across pages');
  assert.equal(matrix.find((row) => row.criterion === '1.4.3').issueCount, 1, 'no element details -> failing-check count');
});

check('phase5: criterion with only pass-band audits is never Fail', () => {
  const matrix = buildWcagMatrix([
    makeMatrixIssue({ score: 85, elementCount: 12 }),
    makeMatrixIssue({ auditId: 'image-alt', score: 80, wcagCriteria: ['1.1.1'], elementCount: 4 }),
    makeMatrixIssue({ auditId: 'target-size', score: 79, wcagCriteria: ['2.5.8'], elementCount: 3 }),
  ]);
  assert.equal(matrix.find((row) => row.criterion === '1.4.3').status, 'pass');
  assert.equal(matrix.find((row) => row.criterion === '1.1.1').status, 'pass', 'score at the pass band must not fail');
  assert.equal(matrix.find((row) => row.criterion === '2.5.8').status, 'fail', 'score below the pass band must fail');
});

check('phase5: failure-phrased titles from one title table (F9)', () => {
  assert.equal(getRemediationTemplateTitle('ss-label-in-name-audit'), 'Visible label is missing from the accessible name (WCAG 2.5.3)');
  assert.ok(!scannerSource.includes('Label in name matches visible text'), 'old pass-phrased scanner title still present');
  assert.equal(scannerSource.split('Visible label is missing from the accessible name (WCAG 2.5.3)').length - 1, 2, 'scanner title must be renamed in both branches');
  const scorecard = buildAuditScorecard(buildReport({ 'target-size': 0 }), { pageUrl: 'https://example.com' });
  assert.equal(scorecard.issues.find((issue) => issue.auditId === 'target-size')?.title, 'Touch targets are too small or too close together (WCAG 2.5.8)', 'issue titles must prefer the template table');
});

check('phase5: N13 canned healthcare alt example removed', () => {
  assert.ok(!analysisDetailsSource.includes('Doctor and patient'), 'canned healthcare alt string still present');
  assert.ok(analysisDetailsSource.includes('Descriptive text that names this product'), 'generic placeholder missing');
});

check('phase5: PDF matrix pass rows acknowledge findings instead of claiming zero violations', () => {
  assert.ok(pdfSource.includes('Automated checks passed with'), 'findings-aware pass text missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
console.log('ALL CHECKS PASSED');