import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

import "../../config/env.ts";
import { logger } from "../../config/logger.ts";
import type { QueueReportStorage, QueueStoredObject } from "../../infrastructure/queues/job-queue.ts";
import { buildS3Uri, isS3Configured, uploadFilesToS3 } from "../storage/report-storage.ts";

const reportDeliveryLogger = logger.child("feature:audits:report-delivery");
let cachedTransporter: nodemailer.Transporter | null = null;
const S3_EXPIRY_DAYS = Math.max(1, Math.round((Number(process.env.AWS_S3_SIGNED_URL_EXPIRES_SECONDS) || 7 * 24 * 60 * 60) / 86400));

export interface ReportAttachment {
    filename: string;
    path: string;
    size: number;
    sizeMB: string;
}

export interface UploadedReportFile {
    filename: string;
    size?: number;
    sizeMB?: string;
    downloadUrl: string;
    providerUrl?: string;
    key?: string;
}

interface StorageUploadResult {
    providerLabel: string;
    linksExpire: boolean;
    storage: QueueReportStorage;
    uploadedFiles: UploadedReportFile[];
    storageErrors?: string[];
}

export interface AuditReportEmailOptions {
    to: string;
    subject: string;
    text: string;
    folderPath: string;
    isQuickScan?: boolean;
    websiteUrl?: string;
    quickScanScore?: string | number | null;
    deviceFilter?: string | null;
}

export interface StoredAuditReportEmailOptions {
    to: string;
    subject: string;
    text: string;
    storage: QueueReportStorage;
    isQuickScan?: boolean;
    quickScanScore?: string | number | null;
}

export interface AuditReportEmailResult {
    success?: boolean;
    error?: string;
    attachmentCount?: number;
    uploadedCount?: number;
    totalFiles?: number;
    totalSizeMB?: string;
    uploadedFiles?: string[];
    storage?: QueueReportStorage;
    storageErrors?: string[];
    accepted?: string[];
    rejected?: string[];
    response?: string;
    messageId?: string;
}

export interface DirectMailAttachment {
    filename: string;
    path: string;
    contentType?: string;
}

export interface DirectMailOptions {
    from?: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
    attachments?: DirectMailAttachment[];
}

interface MailTransportResult {
    transporter: nodemailer.Transporter | null;
    reason?: string;
}

function resetCachedTransport(): void {
    const previousTransporter = cachedTransporter;
    cachedTransporter = null;
    previousTransporter?.close();
}

function buildTransport(): MailTransportResult {
    if (cachedTransporter) {
        return { transporter: cachedTransporter };
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE === "true" : port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
        return { transporter: null, reason: "SMTP not configured (missing SMTP_HOST)" };
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT) || 20_000,
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT) || 10_000,
        ...(process.env.SMTP_IGNORE_TLS_ERRORS === "true" ? { tls: { rejectUnauthorized: false } } : {}),
    });

    cachedTransporter = transporter;
    return { transporter };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRetryableEmailError(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return [
        " 421 ",
        " 450 ",
        " 451 ",
        " 452 ",
        " 454 ",
        "try again later",
        "temporarily unavailable",
        "timeout",
        "timed out",
        "connection closed",
        "connection reset",
        "econnreset",
        "etimedout",
        "esocket",
    ].some((token) => message.includes(token));
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMailWithRetry(
    mailOptions: nodemailer.SendMailOptions,
    context: { to: string; subject: string; kind: "audit-report" | "direct-mail" },
): Promise<nodemailer.SentMessageInfo> {
    let lastError: unknown;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const { transporter, reason } = buildTransport();
        if (!transporter) {
            throw new Error(reason || "SMTP transporter unavailable");
        }

        try {
            return await transporter.sendMail(mailOptions);
        } catch (error) {
            lastError = error;
            const retryable = isRetryableEmailError(error);

            reportDeliveryLogger.warn("Email send attempt failed.", {
                kind: context.kind,
                to: context.to,
                subject: context.subject,
                attempt,
                maxAttempts,
                retryable,
                error: getErrorMessage(error),
            });

            resetCachedTransport();

            if (!retryable || attempt === maxAttempts) {
                break;
            }

            await sleep(2000 * attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
}

function normalizeAddressList(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return values.map((value) => String(value));
}

async function getFileSize(filePath: string): Promise<number> {
    try {
        const stats = await fs.stat(filePath);
        return stats.size;
    } catch (error) {
        reportDeliveryLogger.warn("Failed to read file size.", {
            filePath,
            error: error instanceof Error ? error.message : String(error),
        });
        return 0;
    }
}

function buildStorageUnavailableResult(files: ReportAttachment[]): StorageUploadResult {
    const storageErrors =
        files.length > 0
            ? ["Cloud report storage is not configured. Set AWS_S3_BUCKET and AWS_REGION to deliver report download links."]
            : [];

    return {
        providerLabel: "Storage unavailable",
        linksExpire: false,
        storage: {
            provider: "unconfigured",
            objectCount: 0,
            objects: [],
        },
        uploadedFiles: [],
        storageErrors,
    };
}

async function uploadFilesToConfiguredStorage(
    files: ReportAttachment[],
    options: {
        folderPath: string;
        recipientEmail: string;
        kind: string;
    },
): Promise<StorageUploadResult> {
    if (!isS3Configured()) {
        reportDeliveryLogger.warn("Report delivery storage is not configured for upload.", {
            kind: options.kind,
            folderPath: options.folderPath,
            fileCount: files.length,
        });
        return buildStorageUnavailableResult(files);
    }

    const result = await uploadFilesToS3(files, {
        folderPath: options.folderPath,
        recipientEmail: options.recipientEmail,
        kind: options.kind,
    });

    return {
        providerLabel: "AWS S3",
        linksExpire: result.urlMode === "signed",
        storage: {
            provider: result.provider,
            bucket: result.bucket,
            region: result.region,
            prefix: result.prefix,
            objectCount: result.objectCount,
            signedUrlExpiresInSeconds: result.signedUrlExpiresInSeconds,
            objects: result.uploadedFiles.map(
                (file): QueueStoredObject => ({
                    filename: file.filename,
                    size: file.size,
                    sizeMB: file.sizeMB,
                    key: file.key,
                    providerUrl: file.downloadUrl,
                }),
            ),
        },
        uploadedFiles: result.uploadedFiles.map((file) => ({
            filename: file.filename,
            size: file.size,
            sizeMB: file.sizeMB,
            downloadUrl: file.downloadUrl,
            providerUrl: file.providerUrl,
            key: file.key,
        })),
    };
}

function matchesDeviceFilter(filePath: string, deviceFilter?: string | null): boolean {
    if (!deviceFilter) {
        return true;
    }

    const deviceRegex = new RegExp(`[-_]${deviceFilter}([-.]|$)`);
    return deviceRegex.test(filePath);
}

export async function collectAttachmentsRecursive(rootDir: string, deviceFilter: string | null = null): Promise<ReportAttachment[]> {
    const results: ReportAttachment[] = [];

    async function walk(currentDirectory: string): Promise<void> {
        let entries: Dirent[];
        try {
            entries = await fs.readdir(currentDirectory, { withFileTypes: true });
        } catch (error) {
            reportDeliveryLogger.warn("Cannot read directory while collecting attachments.", {
                currentDirectory,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDirectory, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }

            const lowerPath = fullPath.toLowerCase();
            const isSupportedAttachment = lowerPath.endsWith(".pdf");
            if (!entry.isFile() || !isSupportedAttachment) {
                continue;
            }

            if (!matchesDeviceFilter(fullPath, deviceFilter)) {
                continue;
            }

            try {
                await fs.access(fullPath);
                const size = await getFileSize(fullPath);
                results.push({
                    filename: path.relative(rootDir, fullPath),
                    path: fullPath,
                    size,
                    sizeMB: (size / (1024 * 1024)).toFixed(2),
                });
            } catch (error) {
                reportDeliveryLogger.warn("Skipping inaccessible report attachment.", {
                    filePath: fullPath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    try {
        await walk(rootDir);
    } catch (error) {
        reportDeliveryLogger.warn("Attachment collection failed.", {
            rootDir,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return results;
}

function formatQuickScanDisplayName(fileName: string, quickScanScore: string | number | null | undefined): string {
    const baseName = path.basename(fileName);
    if (!baseName.endsWith(".pdf")) {
        return baseName;
    }

    const parsedScore = Number.parseFloat(String(quickScanScore ?? ""));
    const scoreText = Number.isFinite(parsedScore) ? ` (${Math.round(parsedScore)}%)` : "";
    return `Website Results for: ${baseName}${scoreText}`;
}

export function buildAuditReportEmailBody(options: {
    baseText: string;
    uploadedFiles: UploadedReportFile[];
    storage: QueueReportStorage | undefined;
    storageErrors?: string[];
    isQuickScan?: boolean;
    quickScanScore?: string | number | null;
}): string {
    const hasFiles = options.uploadedFiles.length > 0;
    const hasErrors = options.storageErrors && options.storageErrors.length > 0;
    const usesSignedUrls = options.storage?.provider === "s3" && usesSignedS3Urls();

    const styles = {
        body: `
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f0f4f8;
            margin: 0;
            padding: 0;
        `,
        wrapper: `
            max-width: 620px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        `,
        header: `
            background-color: #16213e;
            padding: 40px 40px 32px;
            text-align: center;
        `,
        headerBadge: `
            display: inline-block;
            background-color: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 20px;
            padding: 6px 16px;
            font-size: 12px;
            font-weight: 600;
            color: #a8c7fa;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 16px;
        `,
        headerTitle: `
            font-size: 26px;
            font-weight: 700;
            color: #ffffff;
            margin: 0 0 8px;
            line-height: 1.3;
        `,
        headerSubtitle: `
            font-size: 14px;
            color: rgba(255,255,255,0.6);
            margin: 0;
        `,
        content: `
            padding: 36px 40px;
        `,
        baseTextBox: `
            font-size: 15px;
            line-height: 1.7;
            color: #374151;
            background-color: #f8fafc;
            border-left: 4px solid #3b82f6;
            border-radius: 0 8px 8px 0;
            padding: 20px 24px;
            margin-bottom: 32px;
        `,
        sectionTitle: `
            font-size: 11px;
            font-weight: 700;
            color: #9ca3af;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0 0 16px;
        `,
        fileCard: `
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 18px 20px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `,
        fileIcon: `
            font-size: 24px;
            margin-right: 14px;
            flex-shrink: 0;
        `,
        fileName: `
            font-size: 14px;
            font-weight: 600;
            color: #111827;
            margin: 0 0 4px;
            word-break: break-word;
        `,
        downloadButton: `
            display: inline-block;
            background-color: #3b82f6;
            color: #ffffff !important;
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            padding: 8px 18px;
            border-radius: 6px;
            margin-top: 10px;
            letter-spacing: 0.3px;
        `,
        expiryBanner: `
            background-color: #fef3c7;
            border: 1px solid #fcd34d;
            border-radius: 10px;
            padding: 16px 20px;
            margin-top: 20px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        `,
        expiryText: `
            font-size: 13px;
            color: #92400e;
            line-height: 1.6;
            margin: 0;
        `,
        archiveBanner: `
            background-color: #dcfce7;
            border: 1px solid #86efac;
            border-radius: 10px;
            padding: 16px 20px;
            margin-top: 20px;
        `,
        archiveText: `
            font-size: 13px;
            color: #166534;
            line-height: 1.6;
            margin: 0;
        `,
        errorBox: `
            background-color: #fee2e2;
            border: 1px solid #fca5a5;
            border-radius: 10px;
            padding: 20px 24px;
            margin-top: 28px;
        `,
        errorTitle: `
            font-size: 14px;
            font-weight: 700;
            color: #991b1b;
            margin: 0 0 12px;
        `,
        errorItem: `
            font-size: 13px;
            color: #7f1d1d;
            line-height: 1.6;
            margin: 0 0 6px;
            padding-left: 16px;
            position: relative;
        `,
        errorSupport: `
            font-size: 13px;
            color: #991b1b;
            margin: 12px 0 0;
            font-style: italic;
        `,
        footer: `
            background: #f8fafc;
            border-top: 1px solid #e5e7eb;
            padding: 24px 40px;
            text-align: center;
        `,
        footerText: `
            font-size: 12px;
            color: #9ca3af;
            margin: 0;
            line-height: 1.6;
        `,
        divider: `
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 28px 0;
        `,
    };

    // ─── File Cards ───────────────────────────────────────────────────────────
    const fileCardsHtml = options.uploadedFiles
        .map((file) => {
            const displayName = options.isQuickScan
                ? formatQuickScanDisplayName(file.filename, options.quickScanScore)
                : path.basename(file.filename);

            const ext = path.extname(file.filename).toLowerCase();
            const fileIcon = ext === ".pdf" ? "📄" : ext === ".xlsx" || ext === ".csv" ? "📊" : ext === ".zip" ? "🗜️" : "📁";

            return `
                <div style="${styles.fileCard}">
                    <div style="display:flex; align-items:flex-start; width:100%;">
                        <span style="${styles.fileIcon}">${fileIcon}</span>
                        <div style="flex:1; min-width:0;">
                            <p style="${styles.fileName}">${displayName}</p>
                            <a href="${file.downloadUrl}" 
                               style="${styles.downloadButton}" 
                               target="_blank" 
                               rel="noopener noreferrer">
                                ↓ Download File
                            </a>
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");

    // ─── Storage Notice ───────────────────────────────────────────────────────
    const storageNoticeHtml = hasFiles
        ? usesSignedUrls
            ? `
                <div style="${styles.expiryBanner}">
                    <span style="font-size:20px; flex-shrink:0;">⏳</span>
                    <p style="${styles.expiryText}">
                        <strong>Links expire in ${S3_EXPIRY_DAYS} day${S3_EXPIRY_DAYS === 1 ? "" : "s"}.</strong><br/>
                        For your security, these download links are time-limited. 
                        Please save your files as soon as possible.
                    </p>
                </div>
            `
            : `
                <div style="${styles.archiveBanner}">
                    <span style="font-size:20px;">☁️</span>
                    <p style="${styles.archiveText}">
                        <strong>Securely archived.</strong> These files are stored in your 
                        cloud report archive and can be retrieved at any time.
                    </p>
                </div>
            `
        : "";

    // ─── Error Box ────────────────────────────────────────────────────────────
    const errorBoxHtml = hasErrors
        ? `
            <div style="${styles.errorBox}">
                <p style="${styles.errorTitle}">⚠️ Some files could not be uploaded</p>
                ${options.storageErrors!.map((e) => `<p style="${styles.errorItem}">• ${e}</p>`).join("")}
                <p style="${styles.errorSupport}">
                    Please contact our support team if you need assistance with these files.
                </p>
            </div>
        `
        : "";

    // ─── Files Section ────────────────────────────────────────────────────────
    const filesSectionHtml = hasFiles
        ? `
            <hr style="${styles.divider}" />
            <p style="${styles.sectionTitle}">📁 Your Report Files</p>
            ${fileCardsHtml}
            ${storageNoticeHtml}
        `
        : "";

    // ─── Full Template ────────────────────────────────────────────────────────
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Audit Report</title>
        </head>
        <body style="${styles.body}">
            <div style="${styles.wrapper}">

                <!-- Header -->
                <div style="${styles.header}">
                    <div style="${styles.headerBadge}">
                        ${options.isQuickScan ? "⚡ Quick Scan" : "🔍 Audit Report"}
                    </div>
                    <h1 style="${styles.headerTitle}">Your Report Is Ready</h1>
                    <p style="${styles.headerSubtitle}">
                        Generated on ${new Date().toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                    </p>
                </div>

                <!-- Body -->
                <div style="${styles.content}">
                    <div style="${styles.baseTextBox}">
                        ${options.baseText
                            .split("\n")
                            .map((line) => `<p style="margin:0 0 8px;">${line || "&nbsp;"}</p>`)
                            .join("")}
                    </div>

                    ${filesSectionHtml}
                    ${errorBoxHtml}
                </div>

                <!-- Footer -->
                <div style="${styles.footer}">
                    <p style="${styles.footerText}">
                        This email was generated automatically. Please do not reply directly.<br/>
                        If you have questions, please reach out to our support team.
                    </p>
                </div>

            </div>
        </body>
        </html>
    `.trim();
}

function buildFromAddress(): string {
    return `SilverSurfers <${process.env.SMTP_USER || "no-reply@silversurfers.local"}>`;
}

function usesSignedS3Urls(): boolean {
    return process.env.AWS_S3_URL_MODE?.trim() !== "object";
}

export async function sendAuditReportEmail(options: AuditReportEmailOptions): Promise<AuditReportEmailResult> {
    const { reason } = buildTransport();
    if (reason && !cachedTransporter) {
        reportDeliveryLogger.warn("Audit report email skipped.", {
            reason,
            to: options.to,
            subject: options.subject,
        });
        return { success: false, error: reason };
    }

    const files = options.folderPath ? await collectAttachmentsRecursive(options.folderPath, options.deviceFilter || null) : [];
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    reportDeliveryLogger.info("Preparing audit report email.", {
        to: options.to,
        subject: options.subject,
        folderPath: options.folderPath,
        fileCount: files.length,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        provider: isS3Configured() ? "s3" : "unconfigured",
    });

    if (files.length === 0) {
        reportDeliveryLogger.warn("Audit report email skipped because no report files were generated.", {
            to: options.to,
            subject: options.subject,
            folderPath: options.folderPath,
            provider: isS3Configured() ? "s3" : "unconfigured",
        });
        return {
            success: false,
            error: "No report files were available to send.",
            totalFiles: 0,
            totalSizeMB: "0.00",
        };
    }

    let uploadResult: StorageUploadResult | undefined;
    const storageErrors: string[] = [];

    try {
        uploadResult = await uploadFilesToConfiguredStorage(files, {
            folderPath: options.folderPath,
            recipientEmail: options.to,
            kind: options.isQuickScan ? "quick-scans" : "audit-reports",
        });

        if ((uploadResult?.uploadedFiles || []).length === 0) {
            reportDeliveryLogger.warn("No report files were available for cloud upload.", {
                to: options.to,
                subject: options.subject,
                folderPath: options.folderPath,
                localFileCount: files.length,
                provider: uploadResult.storage.provider,
                bucket: uploadResult.storage.bucket,
                prefix: uploadResult.storage.prefix,
            });
        } else if (uploadResult.storage.provider === "s3" && uploadResult.storage.bucket && uploadResult.storage.prefix) {
            reportDeliveryLogger.info("Uploaded report files to S3.", {
                to: options.to,
                s3Uri: buildS3Uri(uploadResult.storage.bucket, uploadResult.storage.prefix),
                uploadedCount: uploadResult.uploadedFiles.length,
            });
        }
    } catch (error) {
        storageErrors.push(error instanceof Error ? error.message : String(error));
        reportDeliveryLogger.error("Audit report storage upload failed.", {
            to: options.to,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    const combinedStorageErrors = [...(uploadResult?.storageErrors || []), ...storageErrors];
    const emailBody = buildAuditReportEmailBody({
        baseText: options.text,
        uploadedFiles: uploadResult?.uploadedFiles || [],
        storage: uploadResult?.storage,
        storageErrors: combinedStorageErrors,
        isQuickScan: options.isQuickScan,
        quickScanScore: options.quickScanScore,
    });

    try {
        const info = await sendMailWithRetry(
            {
                from: buildFromAddress(),
                to: options.to,
                subject: options.subject,
                html: emailBody,
            },
            {
                to: options.to,
                subject: options.subject,
                kind: "audit-report",
            },
        );

        return {
            success: true,
            attachmentCount: uploadResult?.uploadedFiles.length || 0,
            uploadedCount: uploadResult?.uploadedFiles.length || 0,
            totalFiles: files.length,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            uploadedFiles: (uploadResult?.uploadedFiles || []).map((file) => file.filename),
            storage: uploadResult?.storage,
            storageErrors: combinedStorageErrors.length > 0 ? combinedStorageErrors : undefined,
            accepted: normalizeAddressList(info.accepted),
            rejected: normalizeAddressList(info.rejected),
            response: info.response,
            messageId: info.messageId,
        };
    } catch (error) {
        reportDeliveryLogger.error("Audit report email send failed.", {
            to: options.to,
            subject: options.subject,
            error: getErrorMessage(error),
        });
        return { success: false, error: getErrorMessage(error) };
    }
}

export async function sendStoredAuditReportEmail(options: StoredAuditReportEmailOptions): Promise<AuditReportEmailResult> {
    const { reason } = buildTransport();
    if (reason && !cachedTransporter) {
        reportDeliveryLogger.warn("Stored audit report email skipped.", {
            reason,
            to: options.to,
            subject: options.subject,
        });
        return { success: false, error: reason };
    }

    const uploadedFiles: UploadedReportFile[] = (options.storage.objects || []).map((object) => ({
        filename: object.filename,
        size: object.size,
        sizeMB: object.sizeMB,
        downloadUrl: object.providerUrl || "",
        providerUrl: object.providerUrl,
        key: object.key,
    })).filter((file) => Boolean(file.filename && file.downloadUrl));
    const totalSize = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    reportDeliveryLogger.info("Preparing stored audit report email.", {
        to: options.to,
        subject: options.subject,
        fileCount: uploadedFiles.length,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        provider: options.storage.provider,
        bucket: options.storage.bucket,
        prefix: options.storage.prefix,
    });

    if (uploadedFiles.length === 0) {
        return {
            success: false,
            error: "No stored report links were available to send.",
            totalFiles: 0,
            totalSizeMB: "0.00",
            storage: options.storage,
        };
    }

    const emailBody = buildAuditReportEmailBody({
        baseText: options.text,
        uploadedFiles,
        storage: options.storage,
        isQuickScan: options.isQuickScan,
        quickScanScore: options.quickScanScore,
    });

    try {
        const info = await sendMailWithRetry(
            {
                from: buildFromAddress(),
                to: options.to,
                subject: options.subject,
                html: emailBody,
            },
            {
                to: options.to,
                subject: options.subject,
                kind: "audit-report",
            },
        );

        return {
            success: true,
            attachmentCount: uploadedFiles.length,
            uploadedCount: uploadedFiles.length,
            totalFiles: uploadedFiles.length,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            uploadedFiles: uploadedFiles.map((file) => file.filename),
            storage: options.storage,
            accepted: normalizeAddressList(info.accepted),
            rejected: normalizeAddressList(info.rejected),
            response: info.response,
            messageId: info.messageId,
        };
    } catch (error) {
        reportDeliveryLogger.error("Stored audit report email send failed.", {
            to: options.to,
            subject: options.subject,
            error: getErrorMessage(error),
        });
        return { success: false, error: getErrorMessage(error), storage: options.storage };
    }
}

export async function sendDirectMail(options: DirectMailOptions): Promise<{
    success: boolean;
    error?: string;
    accepted?: string[];
    rejected?: string[];
    response?: string;
    messageId?: string;
}> {
    const { reason } = buildTransport();
    if (reason && !cachedTransporter) {
        return {
            success: false,
            error: reason,
        };
    }

    try {
        const info = await sendMailWithRetry(
            {
                from: options.from || buildFromAddress(),
                to: options.to,
                subject: options.subject,
                ...(options.html ? { html: options.html } : {}),
                ...(options.text ? { text: options.text } : {}),
                ...(options.attachments?.length ? { attachments: options.attachments } : {}),
            },
            {
                to: options.to,
                subject: options.subject,
                kind: "direct-mail",
            },
        );

        return {
            success: true,
            accepted: normalizeAddressList(info.accepted),
            rejected: normalizeAddressList(info.rejected),
            response: info.response,
            messageId: info.messageId,
        };
    } catch (error) {
        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
}
