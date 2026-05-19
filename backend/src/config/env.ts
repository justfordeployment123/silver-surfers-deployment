import dotenv from "dotenv";
import { existsSync } from "node:fs";
import type { QueueBackend } from "../infrastructure/queues/queue-factory.ts";
import { backendRoot, resolveBackendPath } from "./paths.ts";

dotenv.config({ path: resolveBackendPath(".env"), quiet: true });

type Environment = "development" | "test" | "production";

const COMMON_CHROME_PATHS = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];

function parseNumber(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = parseNumber(value, fallback);
    return Math.min(maximum, Math.max(minimum, parsed));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    return fallback;
}

function parseCsv(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function resolveNodeEnv(value: string | undefined): Environment {
    if (value === "production" || value === "test") {
        return value;
    }

    return "development";
}

function resolveQueueBackend(value: string | undefined, redisUrl: string | undefined): QueueBackend {
    if (value === "bullmq" || value === "persistent") {
        return value;
    }

    return redisUrl ? "bullmq" : "persistent";
}

function resolveChromePath(source: NodeJS.ProcessEnv): string | undefined {
    const explicitPath =
        source.CHROME_PATH?.trim() || source.CHROMIUM_PATH?.trim() || source.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;

    if (explicitPath) {
        return explicitPath;
    }

    return COMMON_CHROME_PATHS.find((candidate) => existsSync(candidate));
}

export interface AppEnv {
    backendRoot: string;
    nodeEnv: Environment;
    isProduction: boolean;
    isDevelopment: boolean;
    port: number;
    scannerPort: number;
    mongoUri?: string;
    jwtSecret: string;
    jwtExpiresIn: string;
    frontendUrl: string;
    additionalAllowedOrigins: string[];
    processingTimeoutMs: number;
    queuedTimeoutMs: number;
    watchdogIntervalMs: number;
    auditRecoveryEnabled: boolean;
    auditRecoveryCheckIntervalMs: number;
    auditRecoveryRetryDelayMs: number;
    auditRecoveryBatchSize: number;
    auditRecoveryMaxAttempts: number;
    scannerServiceUrl: string;
    scannerLiteAuditTimeoutMs: number;
    scannerFullAuditTimeoutMs: number;
    chromePath?: string;
    requestLogEnabled: boolean;
    queueBackend: QueueBackend;
    queueMaxRetries: number;
    redisUrl?: string;
    bullMqPrefix: string;
    openAiApiKey?: string;
    openAiModel: string;
    openAiBaseUrl: string;
    openAiTimeoutMs: number;
    scannerMaxConcurrentAudits: number;
    scannerMaxQueuedAudits: number;
    fullAuditMaxPages: number;
    fullAuditMaxDepth: number;
    fullAuditCrawlDelayMs: number;
    fullAuditCrawlTimeoutMs: number;
    fullAuditCrawlMaxRetries: number;
    fullAuditTotalPageLimit: number;
    fullAuditPriorityPageLimit: number;
    fullAuditFullModePageLimit: number;
    fullAuditMaxFullFailuresPerDevice: number;
    fullAuditMaxFullFailuresPerAudit: number;
    fullAuditScannerCooldownMs: number;
    fullAuditCacheTtlMs: number;
    queueCleanupIntervalMs: number;
    queueMaintenanceIntervalMs: number;
    queueLeaseDurationMs: number;
    queueHeartbeatIntervalMs: number;
    cacheCleanupIntervalMs: number;
    tempReportTtlMs: number;
    reportDirectoryTtlMs: number;
    quickScanReportTtlMs: number;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
    const nodeEnv = resolveNodeEnv(source.NODE_ENV);
    const port = parseNumber(source.PORT, 8000);
    const scannerPort = parseNumber(source.SCANNER_PORT, 8001);
    const redisUrl = source.REDIS_URL?.trim() || source.QUEUE_REDIS_URL?.trim() || undefined;

    return {
        backendRoot,
        nodeEnv,
        isProduction: nodeEnv === "production",
        isDevelopment: nodeEnv === "development",
        port,
        scannerPort,
        mongoUri: source.MONGO_URL?.trim() || undefined,
        jwtSecret: source.JWT_SECRET?.trim() || "dev_secret_change_me",
        jwtExpiresIn: source.JWT_EXPIRES_IN?.trim() || "7d",
        frontendUrl: source.FRONTEND_URL?.trim() || "http://localhost:3000",
        additionalAllowedOrigins: parseCsv(source.ADDITIONAL_ALLOWED_ORIGINS),
        processingTimeoutMs: parseNumber(source.PROCESSING_TIMEOUT_MS, 4 * 60 * 60 * 1000),
        queuedTimeoutMs: parseNumber(source.QUEUED_TIMEOUT_MS, 60 * 60 * 1000),
        watchdogIntervalMs: parseNumber(source.WATCHDOG_INTERVAL_MS, 5 * 60 * 1000),
        auditRecoveryEnabled: parseBoolean(source.AUDIT_RECOVERY_ENABLED, false),
        auditRecoveryCheckIntervalMs: parseBoundedNumber(source.AUDIT_RECOVERY_CHECK_INTERVAL_MS, 60_000, 5_000, 60 * 60 * 1000),
        auditRecoveryRetryDelayMs: parseBoundedNumber(source.AUDIT_RECOVERY_RETRY_DELAY_MS, 5 * 60 * 1000, 5_000, 24 * 60 * 60 * 1000),
        auditRecoveryBatchSize: parseBoundedNumber(source.AUDIT_RECOVERY_BATCH_SIZE, 10, 1, 100),
        auditRecoveryMaxAttempts: parseBoundedNumber(source.AUDIT_RECOVERY_MAX_ATTEMPTS, 3, 1, 20),
        scannerServiceUrl: source.SCANNER_SERVICE_URL?.trim() || source.PYTHON_SCANNER_URL?.trim() || `http://localhost:${scannerPort}`,
        scannerLiteAuditTimeoutMs: parseBoundedNumber(source.SCANNER_LITE_AUDIT_TIMEOUT_MS, 240_000, 60_000, 60 * 60 * 1000),
        scannerFullAuditTimeoutMs: parseBoundedNumber(source.SCANNER_FULL_AUDIT_TIMEOUT_MS, 300_000, 60_000, 60 * 60 * 1000),
        chromePath: resolveChromePath(source),
        requestLogEnabled: parseBoolean(source.REQUEST_LOG_ENABLED, true),
        queueBackend: resolveQueueBackend(source.QUEUE_BACKEND?.trim().toLowerCase(), redisUrl),
        queueMaxRetries: parseBoundedNumber(source.QUEUE_MAX_RETRIES, 1, 1, 20),
        redisUrl,
        bullMqPrefix: source.BULLMQ_PREFIX?.trim() || "silver-surfers",
        openAiApiKey: source.OPENAI_API_KEY?.trim() || undefined,
        openAiModel: source.OPENAI_MODEL?.trim() || "gpt-4o",
        openAiBaseUrl: source.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
        openAiTimeoutMs: parseBoundedNumber(source.OPENAI_TIMEOUT_MS, 20_000, 1_000, 120_000),
        scannerMaxConcurrentAudits: parseNumber(source.SCANNER_MAX_CONCURRENT_AUDITS, 1),
        scannerMaxQueuedAudits: parseNumber(source.SCANNER_MAX_QUEUED_AUDITS, 8),
        fullAuditMaxPages: parseBoundedNumber(source.FULL_AUDIT_MAX_PAGES, 25, 1, 500),
        fullAuditMaxDepth: parseBoundedNumber(source.FULL_AUDIT_MAX_DEPTH, 1, 0, 5),
        fullAuditCrawlDelayMs: parseBoundedNumber(source.FULL_AUDIT_CRAWL_DELAY_MS, 2000, 0, 10000),
        fullAuditCrawlTimeoutMs: parseBoundedNumber(source.FULL_AUDIT_CRAWL_TIMEOUT_MS, 15000, 1000, 120000),
        fullAuditCrawlMaxRetries: parseBoundedNumber(source.FULL_AUDIT_CRAWL_MAX_RETRIES, 3, 1, 5),
        fullAuditTotalPageLimit: parseBoundedNumber(source.FULL_AUDIT_TOTAL_PAGE_LIMIT, 25, 1, 100),
        fullAuditPriorityPageLimit: parseBoundedNumber(source.FULL_AUDIT_PRIORITY_PAGE_LIMIT, 3, 0, 20),
        fullAuditFullModePageLimit: parseBoundedNumber(source.FULL_AUDIT_FULL_MODE_PAGE_LIMIT, 2, 0, 20),
        fullAuditMaxFullFailuresPerDevice: parseBoundedNumber(source.FULL_AUDIT_MAX_FULL_FAILURES_PER_DEVICE, 2, 1, 20),
        fullAuditMaxFullFailuresPerAudit: parseBoundedNumber(source.FULL_AUDIT_MAX_FULL_FAILURES_PER_AUDIT, 3, 1, 50),
        fullAuditScannerCooldownMs: parseBoundedNumber(source.FULL_AUDIT_SCANNER_COOLDOWN_MS, 250, 0, 60000),
        fullAuditCacheTtlMs: parseBoundedNumber(source.FULL_AUDIT_CACHE_TTL_MS, 24 * 60 * 60 * 1000, 60_000, 7 * 24 * 60 * 60 * 1000),
        queueCleanupIntervalMs: parseNumber(source.QUEUE_CLEANUP_INTERVAL_MS, 5 * 60 * 1000),
        queueMaintenanceIntervalMs: parseNumber(source.QUEUE_MAINTENANCE_INTERVAL_MS, 30 * 1000),
        queueLeaseDurationMs: parseNumber(source.QUEUE_LEASE_DURATION_MS, 60 * 1000),
        queueHeartbeatIntervalMs: parseNumber(source.QUEUE_HEARTBEAT_INTERVAL_MS, 15 * 1000),
        cacheCleanupIntervalMs: parseNumber(source.CACHE_CLEANUP_INTERVAL_MS, 15 * 60 * 1000),
        tempReportTtlMs: parseNumber(source.TEMP_REPORT_TTL_MS, 6 * 60 * 60 * 1000),
        reportDirectoryTtlMs: parseNumber(source.REPORT_DIRECTORY_TTL_MS, 24 * 60 * 60 * 1000),
        quickScanReportTtlMs: parseNumber(source.QUICK_SCAN_REPORT_TTL_MS, 30 * 60 * 1000),
    };
}

export const env = readEnv();
