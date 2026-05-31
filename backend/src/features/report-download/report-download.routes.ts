import path from 'node:path';

import { Router } from 'express';

import AnalysisRecord from '../../models/analysis-record.model.ts';
import QuickScan from '../../models/quick-scan.model.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import type { QueueReportStorage, QueueStoredObject } from '../../infrastructure/queues/job-queue.ts';
import { downloadS3Object } from '../storage/report-storage.ts';
import { hashReportDownloadToken } from '../audits/report-download-tokens.ts';

const router = Router();

interface ReportDownloadMatch {
  storage: QueueReportStorage;
  object: QueueStoredObject;
}

function getSafeFileName(fileName: string | undefined): string {
  return path.basename(fileName || 'report.pdf').replace(/["\r\n]/g, '_') || 'report.pdf';
}

function getContentType(fileName: string | undefined, fallback?: string): string {
  const extension = path.extname(fileName || '').toLowerCase();

  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.csv':
      return 'text/csv; charset=utf-8';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return fallback || 'application/octet-stream';
  }
}

function objectMatchesToken(object: QueueStoredObject, tokenHash: string): boolean {
  return object.downloadTokenHash === tokenHash;
}

async function findReportDownload(tokenHash: string): Promise<ReportDownloadMatch | null> {
  const query = { 'reportStorage.objects.downloadTokenHash': tokenHash };
  const [quickScan, analysisRecord] = await Promise.all([
    QuickScan.findOne(query).lean(),
    AnalysisRecord.findOne(query).lean(),
  ]);
  const record = (quickScan || analysisRecord) as { reportStorage?: QueueReportStorage } | null;
  const storage = record?.reportStorage;
  const object = storage?.objects?.find((storedObject) => objectMatchesToken(storedObject, tokenHash));

  return storage && object ? { storage, object } : null;
}

router.get('/report-download/:token', asyncHandler(async (request, response) => {
  const token = String(request.params.token || '').trim();

  if (!token) {
    response.status(404).json({ error: 'Report link not found.' });
    return;
  }

  const match = await findReportDownload(hashReportDownloadToken(token));

  if (!match) {
    response.status(404).json({ error: 'Report link not found.' });
    return;
  }

  const expiresAt = match.object.downloadTokenExpiresAt
    ? new Date(match.object.downloadTokenExpiresAt)
    : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    response.status(410).json({ error: 'Report link expired.' });
    return;
  }

  if (match.storage.provider !== 's3' || !match.storage.bucket || !match.storage.region || !match.object.key) {
    response.status(404).json({ error: 'Report file not available.' });
    return;
  }

  const s3Object = await downloadS3Object({
    bucket: match.storage.bucket,
    region: match.storage.region,
    key: match.object.key,
  });
  const fileName = getSafeFileName(match.object.filename);

  response.setHeader('Content-Type', getContentType(fileName, s3Object.contentType));
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.setHeader('Cache-Control', 'private, no-store');

  if (typeof s3Object.contentLength === 'number') {
    response.setHeader('Content-Length', String(s3Object.contentLength));
  }

  response.send(s3Object.body);
}));

export default router;
