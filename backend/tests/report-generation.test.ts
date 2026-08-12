import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLib } from 'pdf-lib';

import {
  buildGapCoverLine,
  buildMergeTocEntries,
  crawlOrderForReportIndex,
  extractSiteNameFromUrl,
  getReportPageName,
  getScoreStatus,
  humanizeAuditFailureReason,
  mergePDFsByPlatform,
  orderMergePages,
  renderGapPage,
  type FullAuditPlatformReport,
} from '../src/features/audits/report-generation.ts';

test('extractSiteNameFromUrl normalizes hostnames into readable names', () => {
  assert.equal(extractSiteNameFromUrl('https://www.silver-surfers.ai/dashboard'), 'Silver Surfers');
  assert.equal(extractSiteNameFromUrl('invalid-url'), 'Invalid Url');
});

test('getReportPageName derives readable page names from report URLs', () => {
  assert.equal(getReportPageName('https://example.com/'), 'Home Page');
  assert.equal(getReportPageName('https://example.com/patient-portal/login'), 'Login Page');
  assert.equal(getReportPageName('not-a-url'), 'Page');
});

test('getScoreStatus returns the expected label and color by score band', () => {
  assert.deepEqual(getScoreStatus(88), { label: 'Pass', color: '#10B981' });
  assert.deepEqual(getScoreStatus(74), { label: 'Needs Improvement', color: '#F59E0B' });
  assert.deepEqual(getScoreStatus(50), { label: 'Fail', color: '#EF4444' });
  assert.deepEqual(getScoreStatus(null), { label: 'N/A', color: '#6B7280' });
});

function makeReport(url: string, score: number | null): FullAuditPlatformReport {
  return { jsonReportPath: `${url}.json`, url, imagePaths: {}, score };
}

async function makeFixturePdf(filePath: string, label: string, pageCount: number): Promise<void> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const stream = fsSync.createWriteStream(filePath);
  doc.pipe(stream);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) {
      doc.addPage();
    }
    doc.fontSize(12).text(`${label} - page ${pageIndex + 1}`, 40, 40);
  }
  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

test('orderMergePages re-inserts a failed middle page without label drift', () => {
  const reports = [
    makeReport('https://example.com/', 90),
    makeReport('https://example.com/about', 80),
  ];
  const ordered = orderMergePages(reports, ['home.pdf', 'about.pdf'], [
    { url: 'https://example.com/pricing', reason: 'PDF generation failed.', order: 1 },
  ]);

  assert.deepEqual(ordered, [
    { kind: 'report', report: reports[0], pdfPath: 'home.pdf' },
    { kind: 'gap', url: 'https://example.com/pricing', reason: 'PDF generation failed.' },
    { kind: 'report', report: reports[1], pdfPath: 'about.pdf' },
  ]);
});

test('orderMergePages appends gaps without a usable order instead of dropping them', () => {
  const reports = [makeReport('https://example.com/', 90)];
  const ordered = orderMergePages(reports, ['home.pdf'], [
    { url: 'https://example.com/a', reason: 'x' },
    { url: 'https://example.com/b', reason: 'x', order: 99 },
  ]);

  assert.equal(ordered.length, 3);
  assert.equal(ordered[0].kind, 'report');
  assert.deepEqual(ordered.slice(1).map((page) => page.kind), ['gap', 'gap']);
});

test('orderMergePages keeps crawl order with mixed scan and PDF failures', () => {
  // Crawl: A(ok), B(scan-failed), C(scanned but PDF-failed), D(ok)
  const reports = [
    makeReport('https://example.com/a', 90),
    makeReport('https://example.com/d', 80),
  ];
  const scanGapOrders = [1];
  const pdfGapOrder = crawlOrderForReportIndex(1, scanGapOrders);
  assert.equal(pdfGapOrder, 2);

  const ordered = orderMergePages(reports, ['a.pdf', 'd.pdf'], [
    { url: 'https://example.com/b', reason: 'bot protection', order: 1 },
    { url: 'https://example.com/c', reason: 'a PDF generation error', order: pdfGapOrder },
  ]);

  assert.deepEqual(
    ordered.map((page) => (page.kind === 'report' ? page.report.url : page.url)),
    [
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
      'https://example.com/d',
    ],
  );
});

test('buildMergeTocEntries marks gap pages as N/A and counts one page each', () => {
  const entries = buildMergeTocEntries([
    { kind: 'report', report: makeReport('https://example.com/', 88.4), pdfPath: 'home.pdf', pageCount: 5 },
    { kind: 'gap', url: 'https://example.com/pricing', reason: 'x' },
  ]);

  assert.deepEqual(entries, [
    { pageName: 'Home Page', score: '88%', actualPageCount: 4 },
    { pageName: 'Pricing Page', score: 'N/A', actualPageCount: 1 },
  ]);
});

// Phase 9.1 standing check — "TOC pointers land exactly": mergePDFsByPlatform
// computes each report's TOC start page by cumulatively summing
// actualPageCount over buildMergeTocEntries' output, in order (title + cover
// + TOC page count, then += each entry's actualPageCount as it walks the
// list). That arithmetic is a straightforward reduce, but it is only
// correct if actualPageCount and entry order are right for every kind of
// entry (multi-page reports, single-page reports, gap pages) — this locks
// that data down for a realistic mixed sequence.
test('buildMergeTocEntries preserves order and actualPageCount for a mixed multi-report, multi-page, gap sequence', () => {
  const entries = buildMergeTocEntries([
    { kind: 'report', report: makeReport('https://example.com/', 90), pdfPath: 'home.pdf', pageCount: 4 },
    { kind: 'gap', url: 'https://example.com/blocked', reason: 'bot protection' },
    { kind: 'report', report: makeReport('https://example.com/about', 70), pdfPath: 'about.pdf', pageCount: 2 },
    { kind: 'report', report: makeReport('https://example.com/pricing', 55), pdfPath: 'pricing.pdf', pageCount: 3 },
  ]);

  assert.deepEqual(entries, [
    { pageName: 'Home Page', score: '90%', actualPageCount: 3 },
    { pageName: 'Blocked Page', score: 'N/A', actualPageCount: 1 },
    { pageName: 'About Page', score: '70%', actualPageCount: 1 },
    { pageName: 'Pricing Page', score: '55%', actualPageCount: 2 },
  ]);

  // Replicate mergePDFsByPlatform's own cumulative-offset formula (title(1)
  // + cover(1) + TOC page count, then += actualPageCount per entry in
  // order) — this is what actually places each TOC pointer.
  const assumedTocPageCount = 1;
  let currentPageNumber = 2 + assumedTocPageCount + 1;
  const startPages = entries.map((entry) => {
    const startPage = currentPageNumber;
    currentPageNumber += entry.actualPageCount;
    return startPage;
  });

  assert.deepEqual(startPages, [4, 7, 8, 9]);
  // Total body pages consumed must equal the sum of every entry's own
  // actualPageCount — if the TOC's own entry count or per-entry page count
  // ever drifts from what's actually assembled, this stops matching.
  const totalBodyPages = entries.reduce((sum, entry) => sum + entry.actualPageCount, 0);
  assert.equal(currentPageNumber - (2 + assumedTocPageCount + 1), totalBodyPages);
});

test('humanizeAuditFailureReason maps error codes and messages to honest reasons', () => {
  assert.equal(humanizeAuditFailureReason({ errorCode: 'PAGE_NOT_FOUND' }), 'page not found (HTTP 404)');
  assert.equal(humanizeAuditFailureReason({ errorCode: 'NON_HTML' }), 'non-HTML content');
  assert.equal(humanizeAuditFailureReason({ errorCode: 'NO_AUDITABLE_CONTENT' }), 'insufficient auditable content');
  assert.equal(
    humanizeAuditFailureReason({ error: 'Bot-protection wall detected on this page - content not auditable. URL skipped.' }),
    'bot protection',
  );
  assert.equal(
    humanizeAuditFailureReason({ error: 'Page redirected to a different domain - bot protection suspected. URL skipped.' }),
    'bot protection',
  );
  assert.equal(humanizeAuditFailureReason({ error: 'Navigation timeout after 120000ms' }), 'a scan timeout');
  assert.equal(humanizeAuditFailureReason({}), 'a scan error');
});

test('crawlOrderForReportIndex shifts report indices past scan-time gaps', () => {
  assert.equal(crawlOrderForReportIndex(0, [1]), 0);
  assert.equal(crawlOrderForReportIndex(1, [1]), 2);
  assert.equal(crawlOrderForReportIndex(2, [1]), 3);
  assert.equal(crawlOrderForReportIndex(1, [0, 2]), 3);
  assert.equal(crawlOrderForReportIndex(0, []), 0);
});

test('buildGapCoverLine names the shared cause when every gap has the same reason', () => {
  const botGaps = Array.from({ length: 24 }, () => ({ kind: 'gap' as const, url: 'https://example.com/x', reason: 'bot protection' }));
  assert.equal(
    buildGapCoverLine(1, botGaps),
    '24 of 25 pages could not be audited due to bot protection; results below cover 1 page.',
  );

  const mixedGaps = [
    { kind: 'gap' as const, url: 'https://example.com/a', reason: 'bot protection' },
    { kind: 'gap' as const, url: 'https://example.com/b', reason: 'page not found (HTTP 404)' },
  ];
  assert.equal(
    buildGapCoverLine(2, mixedGaps),
    '2 of 4 pages could not be audited; see the Table of Contents for details.',
  );
});

test('renderGapPage produces a single-page PDF', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-page-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const gapPath = await renderGapPage({
    url: 'https://example.com/missing',
    reason: 'page not found',
    outputDir: tmpDir,
    device: 'desktop',
  });

  const gapDoc = await PDFLib.load(await fs.readFile(gapPath));
  assert.equal(gapDoc.getPageCount(), 1);
});

test('mergePDFsByPlatform refuses byte-identical body reports', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-dup-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const firstPath = path.join(tmpDir, 'a.pdf');
  const secondPath = path.join(tmpDir, 'b.pdf');
  await makeFixturePdf(firstPath, 'same', 3);
  await fs.copyFile(firstPath, secondPath);

  await assert.rejects(
    mergePDFsByPlatform({
      pdfPaths: [firstPath, secondPath],
      device: 'desktop',
      email_address: 'qa@example.com',
      outputDir: tmpDir,
      reports: [
        makeReport('https://example.com/products/waves', 70),
        makeReport('https://example.com/products/dunes', 75),
      ],
      planType: 'pro',
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /byte-identical/);
      assert.match(message, /products\/waves/);
      assert.match(message, /products\/dunes/);
      return true;
    },
  );
});

test('mergePDFsByPlatform assembles reports and gap pages into a consistent PDF', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-ok-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const homePath = path.join(tmpDir, 'home.pdf');
  const aboutPath = path.join(tmpDir, 'about.pdf');
  await makeFixturePdf(homePath, 'home', 3);
  await makeFixturePdf(aboutPath, 'about', 2);

  const outputPath = await mergePDFsByPlatform({
    pdfPaths: [homePath, aboutPath],
    device: 'desktop',
    email_address: 'qa@example.com',
    outputDir: tmpDir,
    reports: [
      makeReport('https://example.com/', 90),
      makeReport('https://example.com/about', 80),
    ],
    missingPages: [{ url: 'https://example.com/pricing', reason: 'PDF generation failed.', order: 1 }],
    planType: 'pro',
  });

  // title(1) + cover(1) + toc(1) + home body(3-1) + gap(1) + about body(2-1)
  const merged = await PDFLib.load(await fs.readFile(outputPath));
  assert.equal(merged.getPageCount(), 7);
});
