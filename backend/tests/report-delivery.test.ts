import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  buildAuditReportEmailBody,
  collectAttachmentsRecursive,
  sendAuditReportEmail,
} from '../src/features/audits/report-delivery.ts';

test('collectAttachmentsRecursive returns PDF report artifacts and respects device filters', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-delivery-'));

  try {
    await fs.mkdir(path.join(tempDir, 'nested'));
    await fs.writeFile(path.join(tempDir, 'combined-desktop-report.pdf'), 'desktop');
    await fs.writeFile(path.join(tempDir, 'combined-mobile-report.pdf'), 'mobile');
    await fs.writeFile(path.join(tempDir, 'ai-executive-summary-desktop.md'), 'summary');
    await fs.writeFile(path.join(tempDir, 'nested', 'summary-tablet.pdf'), 'tablet');
    await fs.writeFile(path.join(tempDir, 'notes.txt'), 'ignore me');

    const desktopFiles = await collectAttachmentsRecursive(tempDir, 'desktop');
    const allFiles = await collectAttachmentsRecursive(tempDir);

    assert.deepEqual(
      desktopFiles.map((file) => file.filename).sort(),
      ['combined-desktop-report.pdf'].sort(),
    );
    assert.deepEqual(
      allFiles.map((file) => file.filename).sort(),
      [
        'combined-desktop-report.pdf',
        'combined-mobile-report.pdf',
        path.join('nested', 'summary-tablet.pdf'),
      ].sort(),
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('sendAuditReportEmail fails fast when no report files were generated', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-delivery-empty-'));
  const previousSmtpHost = process.env.SMTP_HOST;

  process.env.SMTP_HOST = 'smtp.example.com';

  try {
    const result = await sendAuditReportEmail({
      to: 'team@example.com',
      subject: 'Audit Results',
      text: 'Your audit results are ready.',
      folderPath: tempDir,
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'No report files were available to send.');
    assert.equal(result.totalFiles, 0);
  } finally {
    if (previousSmtpHost === undefined) {
      delete process.env.SMTP_HOST;
    } else {
      process.env.SMTP_HOST = previousSmtpHost;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildAuditReportEmailBody formats quick scan cloud links with score and expiry warning', () => {
  const previousUrlMode = process.env.AWS_S3_URL_MODE;
  process.env.AWS_S3_URL_MODE = 'signed';

  try {
    const body = buildAuditReportEmailBody({
      baseText: 'Base quick scan text.',
      uploadedFiles: [
        {
          filename: 'reports-lite/example.pdf',
          downloadUrl: 'https://downloads.example.com/example.pdf',
          providerUrl: 'https://downloads.example.com/example.pdf',
        },
      ],
      storage: {
        provider: 's3',
      },
      isQuickScan: true,
      quickScanScore: 82,
    });

    assert.match(body, /Base quick scan text\./);
    assert.match(body, /Website Results for: example\.pdf \(82%\)/);
    assert.match(body, /https:\/\/downloads\.example\.com\/example\.pdf/);
    assert.match(body, /Links expire in/);
  } finally {
    if (previousUrlMode === undefined) {
      delete process.env.AWS_S3_URL_MODE;
    } else {
      process.env.AWS_S3_URL_MODE = previousUrlMode;
    }
  }
});

test('buildAuditReportEmailBody can use backend token links instead of expiring signed URLs', () => {
  const previousUrlMode = process.env.AWS_S3_URL_MODE;
  process.env.AWS_S3_URL_MODE = 'signed';

  try {
    const body = buildAuditReportEmailBody({
      baseText: 'Base quick scan text.',
      uploadedFiles: [
        {
          filename: 'reports-lite/example.pdf',
          downloadUrl: 'https://api.silversurfers.ai/report-download/token123',
          providerUrl: 'https://downloads.example.com/example.pdf',
        },
      ],
      storage: {
        provider: 's3',
      },
      isQuickScan: true,
      quickScanScore: 82,
    });

    assert.match(body, /https:\/\/api\.silversurfers\.ai\/report-download\/token123/);
    assert.doesNotMatch(body, /https:\/\/downloads\.example\.com\/example\.pdf/);
    assert.doesNotMatch(body, /Links expire in/);
  } finally {
    if (previousUrlMode === undefined) {
      delete process.env.AWS_S3_URL_MODE;
    } else {
      process.env.AWS_S3_URL_MODE = previousUrlMode;
    }
  }
});

test('buildAuditReportEmailBody appends storage errors for partial upload failures', () => {
  const body = buildAuditReportEmailBody({
    baseText: 'Full audit results.',
    uploadedFiles: [],
    storage: {
      provider: 'unconfigured',
    },
    storageErrors: ['combined-desktop-report.pdf: upload failed'],
  });

  assert.match(body, /Full audit results\./);
  assert.match(body, /Some files could not be uploaded/);
  assert.match(body, /combined-desktop-report\.pdf: upload failed/);
});
