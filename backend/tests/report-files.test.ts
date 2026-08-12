import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalysisReportFileViews,
  buildStoredReportFilesFromAttachments,
  buildStoredReportFilesFromStorage,
  mergeStoredReportFilesWithStorage,
} from '../src/features/audits/report-files.ts';

test('buildStoredReportFilesFromAttachments persists local relative paths and pdf content types', () => {
  const files = buildStoredReportFilesFromAttachments([
    {
      filename: 'desktop/audit-summary.pdf',
      path: '/tmp/reports/desktop/audit-summary.pdf',
      size: 2048,
      sizeMB: '0.00',
    },
  ]);

  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'desktop/audit-summary.pdf');
  assert.equal(files[0].relativePath, 'desktop/audit-summary.pdf');
  assert.equal(files[0].contentType, 'application/pdf');
});

// Report attachments are PDF-only end to end: collectAttachmentsRecursive
// (report-delivery.ts) only walks the report folder for .pdf files in the
// first place, so a .md executive summary never reaches this function today.
// buildAuditAiReportMarkdown() (ai-reporting.ts) generates markdown content
// but isn't wired into the delivery pipeline — this test locks in that a
// non-PDF attachment is filtered out rather than silently mislabeled.
test('buildStoredReportFilesFromAttachments filters out non-PDF attachments', () => {
  const files = buildStoredReportFilesFromAttachments([
    {
      filename: 'ai-executive-summary.md',
      path: '/tmp/reports/ai-executive-summary.md',
      size: 512,
      sizeMB: '0.00',
    },
  ]);

  assert.equal(files.length, 0);
});

test('mergeStoredReportFilesWithStorage enriches persisted files with storage keys and urls', () => {
  const localFiles = buildStoredReportFilesFromAttachments([
    {
      filename: 'audit-summary.pdf',
      path: '/tmp/reports/audit-summary.pdf',
      size: 2048,
      sizeMB: '0.00',
    },
  ]);

  const merged = mergeStoredReportFilesWithStorage(localFiles, {
    provider: 's3',
    bucket: 'silver-reports',
    region: 'ap-south-1',
    prefix: 'reports/example',
    objects: [
      {
        filename: 'audit-summary.pdf',
        key: 'reports/example/audit-summary.pdf',
        providerUrl: 'https://downloads.example.com/audit-summary.pdf',
      },
    ],
  });

  assert.equal(merged[0].storageKey, 'reports/example/audit-summary.pdf');
  assert.equal(merged[0].providerUrl, 'https://downloads.example.com/audit-summary.pdf');

  const views = buildAnalysisReportFileViews(merged);
  assert.equal(views[0].displayName, 'audit-summary.pdf');
  assert.equal(views[0].hasDownload, true);
});

test('buildStoredReportFilesFromStorage backfills stored objects for old records', () => {
  const files = buildStoredReportFilesFromStorage({
    provider: 's3',
    bucket: 'silver-reports',
    region: 'ap-south-1',
    prefix: 'reports/example',
    objects: [
      {
        filename: 'combined-desktop-report.pdf',
        key: 'reports/example/combined-desktop-report.pdf',
        size: 4096,
        sizeMB: '0.00',
      },
    ],
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].storageKey, 'reports/example/combined-desktop-report.pdf');
  assert.equal(files[0].filename, 'combined-desktop-report.pdf');
});
