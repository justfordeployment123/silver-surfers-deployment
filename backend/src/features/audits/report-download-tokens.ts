import crypto from 'node:crypto';

import { env } from '../../config/env.ts';
import type { QueueReportStorage, QueueStoredObject } from '../../infrastructure/queues/job-queue.ts';

export interface ReportDownloadTokenInfo {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  url: string;
}

export interface QueueStoredObjectWithToken extends QueueStoredObject {
  downloadTokenHash?: string;
  downloadTokenExpiresAt?: Date;
  downloadUrl?: string;
}

const DEFAULT_TOKEN_TTL_DAYS = 90;

function getDownloadBaseUrl(): string {
  return (
    process.env.REPORT_DOWNLOAD_BASE_URL
    || process.env.API_PUBLIC_URL
    || process.env.BACKEND_PUBLIC_URL
    || env.frontendUrl
  ).replace(/\/+$/, '');
}

function getTokenTtlMs(): number {
  const days = Number(process.env.REPORT_DOWNLOAD_TOKEN_TTL_DAYS || DEFAULT_TOKEN_TTL_DAYS);
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_TOKEN_TTL_DAYS;
  return normalizedDays * 24 * 60 * 60 * 1000;
}

export function hashReportDownloadToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createReportDownloadToken(): ReportDownloadTokenInfo {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashReportDownloadToken(token);
  const expiresAt = new Date(Date.now() + getTokenTtlMs());

  return {
    token,
    tokenHash,
    expiresAt,
    url: `${getDownloadBaseUrl()}/report-download/${encodeURIComponent(token)}`,
  };
}

export function attachDownloadTokenToStoredObject(object: QueueStoredObject): QueueStoredObjectWithToken {
  const tokenInfo = createReportDownloadToken();

  return {
    ...object,
    downloadTokenHash: tokenInfo.tokenHash,
    downloadTokenExpiresAt: tokenInfo.expiresAt,
    downloadUrl: tokenInfo.url,
  };
}

export function attachDownloadTokensToReportStorage(storage: QueueReportStorage): QueueReportStorage {
  const now = Date.now();

  return {
    ...storage,
    objects: (storage.objects || []).map((object) => {
      const existing = object as QueueStoredObjectWithToken;
      const expiresAt = existing.downloadTokenExpiresAt
        ? new Date(existing.downloadTokenExpiresAt).getTime()
        : 0;

      if (existing.downloadTokenHash && existing.downloadTokenExpiresAt && existing.downloadUrl && expiresAt > now) {
        return existing;
      }

      return attachDownloadTokenToStoredObject(object);
    }),
  };
}
