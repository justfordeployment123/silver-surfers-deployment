import test from 'node:test';
import assert from 'node:assert/strict';

import { attachDownloadTokensToReportStorage, hashReportDownloadToken } from '../src/features/audits/report-download-tokens.ts';

test('attachDownloadTokensToReportStorage adds backend download tokens without replacing S3 provider URLs', () => {
  const previousBaseUrl = process.env.REPORT_DOWNLOAD_BASE_URL;
  const previousTtl = process.env.REPORT_DOWNLOAD_TOKEN_TTL_DAYS;
  process.env.REPORT_DOWNLOAD_BASE_URL = 'https://api.silversurfers.ai/';
  process.env.REPORT_DOWNLOAD_TOKEN_TTL_DAYS = '30';

  try {
    const storage = attachDownloadTokensToReportStorage({
      provider: 's3',
      bucket: 'reports',
      region: 'eu-north-1',
      objects: [
        {
          filename: 'example.pdf',
          key: 'reports/example.pdf',
          providerUrl: 'https://reports.s3.eu-north-1.amazonaws.com/reports/example.pdf?signature=old',
        },
      ],
    });
    const [object] = storage.objects || [];

    assert.ok(object.downloadTokenHash);
    assert.ok(object.downloadTokenExpiresAt instanceof Date);
    assert.match(object.downloadUrl || '', /^https:\/\/api\.silversurfers\.ai\/report-download\/[-_a-zA-Z0-9]+$/);
    assert.equal(object.providerUrl, 'https://reports.s3.eu-north-1.amazonaws.com/reports/example.pdf?signature=old');
    assert.notEqual(object.downloadUrl, object.providerUrl);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.REPORT_DOWNLOAD_BASE_URL;
    } else {
      process.env.REPORT_DOWNLOAD_BASE_URL = previousBaseUrl;
    }

    if (previousTtl === undefined) {
      delete process.env.REPORT_DOWNLOAD_TOKEN_TTL_DAYS;
    } else {
      process.env.REPORT_DOWNLOAD_TOKEN_TTL_DAYS = previousTtl;
    }
  }
});

test('attachDownloadTokensToReportStorage keeps unexpired existing tokens and renews expired tokens', () => {
  const futureDate = new Date(Date.now() + 60_000);
  const expiredDate = new Date(Date.now() - 60_000);
  const activeTokenHash = hashReportDownloadToken('active-token');
  const expiredTokenHash = hashReportDownloadToken('expired-token');

  const storage = attachDownloadTokensToReportStorage({
    provider: 's3',
    objects: [
      {
        filename: 'active.pdf',
        key: 'active.pdf',
        downloadTokenHash: activeTokenHash,
        downloadTokenExpiresAt: futureDate,
        downloadUrl: 'https://api.example.com/report-download/active-token',
      },
      {
        filename: 'expired.pdf',
        key: 'expired.pdf',
        downloadTokenHash: expiredTokenHash,
        downloadTokenExpiresAt: expiredDate,
        downloadUrl: 'https://api.example.com/report-download/expired-token',
      },
    ],
  });
  const [activeObject, renewedObject] = storage.objects || [];

  assert.equal(activeObject.downloadTokenHash, activeTokenHash);
  assert.equal(activeObject.downloadUrl, 'https://api.example.com/report-download/active-token');
  assert.notEqual(renewedObject.downloadTokenHash, expiredTokenHash);
  assert.notEqual(renewedObject.downloadUrl, 'https://api.example.com/report-download/expired-token');
});
