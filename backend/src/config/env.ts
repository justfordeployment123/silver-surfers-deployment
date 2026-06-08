import dotenv from "dotenv";
import { existsSync } from "node:fs";
import type { QueueBackend } from "../infrastructure/queues/queue-factory.ts";
import { backendRoot, resolveBackendPath } from "./paths.ts";

dotenv.config({ path: resolveBackendPath(".env"), quiet: true });

type Environment = "development" | "test" | "production";
type ScannerDispatchMode = "http" | "sqs";

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

function resolveScannerDispatchMode(value: string | undefined): ScannerDispatchMode {
    return value?.trim().toLowerCase() === "sqs" ? "sqs" : "http";
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
    scannerDispatchMode: ScannerDispatchMode;
    scannerSqsJobQueueUrl?: string;
    scannerSqsResultQueueUrl?: string;
    scannerSqsQuickJobQueueUrl?: string;
    scannerSqsQuickResultQueueUrl?: string;
    scannerSqsFullJobQueueUrl?: string;
    scannerSqsFullResultQueueUrl?: string;
    scannerSqsVpsQuickJobQueueUrl?: string;
    scannerSqsVpsFullJobQueueUrl?: string;
    scannerFallbackToVpsEnabled: boolean;
    scannerFallbackMaxAttempts: number;
    scannerFallbackVpsQuickBacklogLimit: number;
    scannerFallbackVpsFullBacklogLimit: number;
    scannerSqsWaitTimeSeconds: number;
    scannerSqsResultVisibilityTimeoutSeconds: number;
    scannerSqsResultWorkerEnabled: boolean;
    scannerSqsResultWorkerMaxMessages: number;
    scannerSqsResultWorkerVisibilityTimeoutSeconds: number;
    scannerSqsArtifactBucket?: string;
    scannerSqsArtifactRegion?: string;
    scannerSqsArtifactPrefix: string;
    scannerLiteAuditTimeoutMs: number;
    scannerFullAuditTimeoutMs: number;
    scannerPrecheckFallbackEnabled: boolean;
    scannerPrecheckFallbackUrl?: string;
    scannerPrecheckFallbackTimeoutMs: number;
    skipUrlPrecheck: boolean;
    chromePath?: string;
    requestLogEnabled: boolean;
    queueBackend: QueueBackend;
    queueFullAuditConcurrency: number;
    queueQuickScanConcurrency: number;
    queueFullAuditJobTimeoutMs: number;
    queueQuickScanJobTimeoutMs: number;
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
    fullAuditLinkExtractionCamoufoxFirst: boolean;
    fullAuditTotalPageLimit: number;
    fullAuditPriorityPageLimit: number;
    fullAuditFullModePageLimit: number;
    fullAuditMaxFullFailuresPerDevice: number;
    fullAuditMaxFullFailuresPerAudit: number;
    fullAuditScannerCooldownMs: number;
    fullAuditBatchScannerEnabled: boolean;
    fullAuditEventDrivenScannerEnabled: boolean;
    fullAuditReportsInScannerEnabled: boolean;
    fullAuditOrchestrationInScannerEnabled: boolean;
    fullAuditCacheEnabled: boolean;
    fullAuditCacheTtlMs: number;
    queueCleanupIntervalMs: number;
    queueMaintenanceIntervalMs: number;
    queueLeaseDurationMs: number;
    queueHeartbeatIntervalMs: number;
    queueBullMqLockDurationMs: number;
    queueBullMqLockRenewTimeMs: number;
    queueBullMqStalledIntervalMs: number;
    queueBullMqMaxStalledCount: number;
    queueRecoverProcessingJobs: boolean;
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
    const genericScannerSqsJobQueueUrl = source.SCANNER_SQS_JOB_QUEUE_URL?.trim() || undefined;
    const genericScannerSqsResultQueueUrl = source.SCANNER_SQS_RESULT_QUEUE_URL?.trim() || undefined;

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
        scannerDispatchMode: resolveScannerDispatchMode(source.SCANNER_DISPATCH_MODE),
        scannerSqsJobQueueUrl: genericScannerSqsJobQueueUrl,
        scannerSqsResultQueueUrl: genericScannerSqsResultQueueUrl,
        scannerSqsQuickJobQueueUrl: source.SCANNER_SQS_QUICK_JOB_QUEUE_URL?.trim() || genericScannerSqsJobQueueUrl,
        scannerSqsQuickResultQueueUrl: source.SCANNER_SQS_QUICK_RESULT_QUEUE_URL?.trim() || genericScannerSqsResultQueueUrl,
        scannerSqsFullJobQueueUrl: source.SCANNER_SQS_FULL_JOB_QUEUE_URL?.trim() || genericScannerSqsJobQueueUrl,
        scannerSqsFullResultQueueUrl: source.SCANNER_SQS_FULL_RESULT_QUEUE_URL?.trim() || genericScannerSqsResultQueueUrl,
        scannerSqsVpsQuickJobQueueUrl: source.SCANNER_SQS_VPS_QUICK_JOB_QUEUE_URL?.trim() || undefined,
        scannerSqsVpsFullJobQueueUrl: source.SCANNER_SQS_VPS_FULL_JOB_QUEUE_URL?.trim() || undefined,
        scannerFallbackToVpsEnabled: parseBoolean(source.SCANNER_FALLBACK_TO_VPS_ENABLED, false),
        scannerFallbackMaxAttempts: parseBoundedNumber(source.SCANNER_FALLBACK_MAX_ATTEMPTS, 1, 0, 5),
        scannerFallbackVpsQuickBacklogLimit: parseBoundedNumber(source.SCANNER_FALLBACK_VPS_QUICK_BACKLOG_LIMIT, 25, 1, 500),
        scannerFallbackVpsFullBacklogLimit: parseBoundedNumber(source.SCANNER_FALLBACK_VPS_FULL_BACKLOG_LIMIT, 5, 1, 100),
        scannerSqsWaitTimeSeconds: parseBoundedNumber(source.SCANNER_SQS_WAIT_TIME_SECONDS, 20, 1, 20),
        scannerSqsResultVisibilityTimeoutSeconds: parseBoundedNumber(source.SCANNER_SQS_RESULT_VISIBILITY_TIMEOUT_SECONDS, 30, 5, 300),
        scannerSqsResultWorkerEnabled: parseBoolean(source.SCANNER_SQS_RESULT_WORKER_ENABLED, true),
        scannerSqsResultWorkerMaxMessages: parseBoundedNumber(source.SCANNER_SQS_RESULT_WORKER_MAX_MESSAGES, 1, 1, 10),
        scannerSqsResultWorkerVisibilityTimeoutSeconds: parseBoundedNumber(source.SCANNER_SQS_RESULT_WORKER_VISIBILITY_TIMEOUT_SECONDS, 900, 30, 3600),
        scannerSqsArtifactBucket: source.SCANNER_SQS_ARTIFACT_BUCKET?.trim() || source.AWS_S3_BUCKET?.trim() || undefined,
        scannerSqsArtifactRegion: source.SCANNER_SQS_ARTIFACT_REGION?.trim() || source.AWS_REGION?.trim() || undefined,
        scannerSqsArtifactPrefix: source.SCANNER_SQS_ARTIFACT_PREFIX?.trim() || "silver-surfers/scanner-results",
        scannerLiteAuditTimeoutMs: parseBoundedNumber(source.SCANNER_LITE_AUDIT_TIMEOUT_MS, 240_000, 60_000, 60 * 60 * 1000),
        scannerFullAuditTimeoutMs: parseBoundedNumber(source.SCANNER_FULL_AUDIT_TIMEOUT_MS, 300_000, 60_000, 4 * 60 * 60 * 1000),
        scannerPrecheckFallbackEnabled: parseBoolean(source.SCANNER_PRECHECK_FALLBACK_ENABLED, true),
        scannerPrecheckFallbackUrl: source.SCANNER_PRECHECK_FALLBACK_URL?.trim() || source.VPS_SCANNER_SERVICE_URL?.trim() || undefined,
        scannerPrecheckFallbackTimeoutMs: parseBoundedNumber(source.SCANNER_PRECHECK_FALLBACK_TIMEOUT_MS, 20_000, 3_000, 60_000),
        skipUrlPrecheck: parseBoolean(source.SKIP_URL_PRECHECK, false),
        chromePath: resolveChromePath(source),
        requestLogEnabled: parseBoolean(source.REQUEST_LOG_ENABLED, true),
        queueBackend: resolveQueueBackend(source.QUEUE_BACKEND?.trim().toLowerCase(), redisUrl),
        queueFullAuditConcurrency: parseBoundedNumber(source.QUEUE_FULL_AUDIT_CONCURRENCY, 1, 1, 20),
        queueQuickScanConcurrency: parseBoundedNumber(source.QUEUE_QUICK_SCAN_CONCURRENCY, 1, 1, 20),
        queueFullAuditJobTimeoutMs: parseBoundedNumber(source.QUEUE_FULL_AUDIT_JOB_TIMEOUT_MS, 180 * 60 * 1000, 60_000, 6 * 60 * 60 * 1000),
        queueQuickScanJobTimeoutMs: parseBoundedNumber(source.QUEUE_QUICK_SCAN_JOB_TIMEOUT_MS, 30 * 60 * 1000, 60_000, 2 * 60 * 60 * 1000),
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
        fullAuditLinkExtractionCamoufoxFirst: parseBoolean(source.FULL_AUDIT_LINK_EXTRACTION_CAMOUFOX_FIRST, true),
        fullAuditTotalPageLimit: parseBoundedNumber(source.FULL_AUDIT_TOTAL_PAGE_LIMIT, 25, 1, 100),
        fullAuditPriorityPageLimit: parseBoundedNumber(source.FULL_AUDIT_PRIORITY_PAGE_LIMIT, 3, 0, 20),
        fullAuditFullModePageLimit: parseBoundedNumber(source.FULL_AUDIT_FULL_MODE_PAGE_LIMIT, 2, 0, 20),
        fullAuditMaxFullFailuresPerDevice: parseBoundedNumber(source.FULL_AUDIT_MAX_FULL_FAILURES_PER_DEVICE, 2, 1, 20),
        fullAuditMaxFullFailuresPerAudit: parseBoundedNumber(source.FULL_AUDIT_MAX_FULL_FAILURES_PER_AUDIT, 3, 1, 50),
        fullAuditScannerCooldownMs: parseBoundedNumber(source.FULL_AUDIT_SCANNER_COOLDOWN_MS, 250, 0, 60000),
        fullAuditBatchScannerEnabled: parseBoolean(source.FULL_AUDIT_BATCH_SCANNER_ENABLED, false),
        fullAuditEventDrivenScannerEnabled: parseBoolean(source.FULL_AUDIT_EVENT_DRIVEN_SCANNER_ENABLED, true),
        fullAuditReportsInScannerEnabled: parseBoolean(source.FULL_AUDIT_REPORTS_IN_SCANNER_ENABLED, false),
        fullAuditOrchestrationInScannerEnabled: parseBoolean(source.FULL_AUDIT_ORCHESTRATION_IN_SCANNER_ENABLED, false),
        fullAuditCacheEnabled: parseBoolean(source.FULL_AUDIT_CACHE_ENABLED, true),
        fullAuditCacheTtlMs: parseBoundedNumber(source.FULL_AUDIT_CACHE_TTL_MS, 24 * 60 * 60 * 1000, 60_000, 7 * 24 * 60 * 60 * 1000),
        queueCleanupIntervalMs: parseNumber(source.QUEUE_CLEANUP_INTERVAL_MS, 5 * 60 * 1000),
        queueMaintenanceIntervalMs: parseNumber(source.QUEUE_MAINTENANCE_INTERVAL_MS, 30 * 1000),
        queueLeaseDurationMs: parseNumber(source.QUEUE_LEASE_DURATION_MS, 60 * 1000),
        queueHeartbeatIntervalMs: parseNumber(source.QUEUE_HEARTBEAT_INTERVAL_MS, 15 * 1000),
        queueBullMqLockDurationMs: parseBoundedNumber(source.QUEUE_BULLMQ_LOCK_DURATION_MS, 30 * 60 * 1000, 30_000, 6 * 60 * 60 * 1000),
        queueBullMqLockRenewTimeMs: parseBoundedNumber(source.QUEUE_BULLMQ_LOCK_RENEW_TIME_MS, 15 * 60 * 1000, 5_000, 3 * 60 * 60 * 1000),
        queueBullMqStalledIntervalMs: parseBoundedNumber(source.QUEUE_BULLMQ_STALLED_INTERVAL_MS, 5 * 60 * 1000, 30_000, 60 * 60 * 1000),
        queueBullMqMaxStalledCount: parseBoundedNumber(source.QUEUE_BULLMQ_MAX_STALLED_COUNT, 0, 0, 10),
        queueRecoverProcessingJobs: parseBoolean(source.QUEUE_RECOVER_PROCESSING_JOBS, false),
        cacheCleanupIntervalMs: parseNumber(source.CACHE_CLEANUP_INTERVAL_MS, 15 * 60 * 1000),
        tempReportTtlMs: parseNumber(source.TEMP_REPORT_TTL_MS, 6 * 60 * 60 * 1000),
        reportDirectoryTtlMs: parseNumber(source.REPORT_DIRECTORY_TTL_MS, 24 * 60 * 60 * 1000),
        quickScanReportTtlMs: parseNumber(source.QUICK_SCAN_REPORT_TTL_MS, 30 * 60 * 1000),
    };
}

export const env = readEnv();
