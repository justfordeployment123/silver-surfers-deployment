import type { Request, Response } from 'express';

import Ebook from '../../models/ebook.model.ts';
import EbookPurchase from '../../models/ebook-purchase.model.ts';
import { createS3AccessUrl, isS3Configured } from '../storage/report-storage.ts';

// Milestone 3.1 Developer Plan, Module 16. Client answers 2026-10-07, #9:
// "7 days seems reasonable" — matches report-delivery.ts's existing
// default for audit report links (AWS_S3_SIGNED_URL_EXPIRES_SECONDS).
const EBOOK_DOWNLOAD_LINK_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

// A freshly-signed, time-limited URL generated on each request — never a
// permanent public S3 URL, and never proxied through the Node process
// (unlike report-download.routes.ts's public token-link pattern, which
// exists for emailed/unauthenticated access; this endpoint is
// authenticated and dashboard-only, so a direct signed-URL redirect is
// simpler and sufficient).
export async function getEbookDownloadLink(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const ebookId = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const purchase = await EbookPurchase.findOne({ userId, ebookId }).lean();
    if (!purchase) {
      response.status(403).json({ error: 'You have not purchased this ebook.' });
      return;
    }

    const ebook = await Ebook.findById(ebookId).lean();
    if (!ebook) {
      response.status(404).json({ error: 'Ebook not found.' });
      return;
    }

    if (!isS3Configured()) {
      response.status(500).json({ error: 'Downloads are not configured yet. Please contact support.' });
      return;
    }

    const url = await createS3AccessUrl({
      bucket: String(process.env.AWS_S3_BUCKET || ''),
      region: String(process.env.AWS_REGION || ''),
      key: (ebook as unknown as { s3Key: string }).s3Key,
      urlMode: 'signed',
      signedUrlExpiresInSeconds: EBOOK_DOWNLOAD_LINK_LIFETIME_SECONDS,
    });

    response.json({ url });
  } catch (error) {
    console.error('getEbookDownloadLink error:', error);
    response.status(500).json({ error: 'Failed to generate a download link.' });
  }
}
