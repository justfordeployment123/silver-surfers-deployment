import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLib } from 'pdf-lib';

import {
  buildMergeTocEntries,
  extractSiteNameFromUrl,
  getReportPageName,
  getScoreStatus,
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
