import test from 'node:test';
import assert from 'node:assert/strict';

import { readEnv } from '../src/config/env.ts';

test('readEnv uses scanner URL alias and parses booleans/numbers', () => {
  const parsed = readEnv({
    NODE_ENV: 'production',
    PORT: '9000',
    SCANNER_PORT: '9100',
    PYTHON_SCANNER_URL: 'http://legacy-scanner:8001',
    REQUEST_LOG_ENABLED: 'false',
    PROCESSING_TIMEOUT_MS: '12345',
    QUEUE_MAX_RETRIES: '2',
    AUDIT_RECOVERY_ENABLED: 'true',
    AUDIT_RECOVERY_CHECK_INTERVAL_MS: '60001',
    AUDIT_RECOVERY_RETRY_DELAY_MS: '120000',
    AUDIT_RECOVERY_BATCH_SIZE: '12',
    AUDIT_RECOVERY_MAX_ATTEMPTS: '4',
    REDIS_URL: 'redis://cache:6379/0',
    BULLMQ_PREFIX: 'silver-test',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-test-mini',
    OPENAI_BASE_URL: 'https://api.example.com/v1',
    OPENAI_TIMEOUT_MS: '4567',
    SCANNER_MAX_CONCURRENT_AUDITS: '2',
    SCANNER_MAX_QUEUED_AUDITS: '11',
    FULL_AUDIT_MAX_PAGES: '600',
    FULL_AUDIT_MAX_DEPTH: '3',
    FULL_AUDIT_CRAWL_DELAY_MS: '1500',
    FULL_AUDIT_CRAWL_TIMEOUT_MS: '45000',
    FULL_AUDIT_CRAWL_MAX_RETRIES: '4',
    FULL_AUDIT_TOTAL_PAGE_LIMIT: '9',
    FULL_AUDIT_PRIORITY_PAGE_LIMIT: '4',
    FULL_AUDIT_FULL_MODE_PAGE_LIMIT: '3',
    FULL_AUDIT_MAX_FULL_FAILURES_PER_DEVICE: '5',
    FULL_AUDIT_MAX_FULL_FAILURES_PER_AUDIT: '7',
    FULL_AUDIT_SCANNER_COOLDOWN_MS: '2200',
    FULL_AUDIT_CACHE_TTL_MS: '86400000',
    QUEUE_CLEANUP_INTERVAL_MS: '23456',
    QUEUE_MAINTENANCE_INTERVAL_MS: '34567',
    QUEUE_LEASE_DURATION_MS: '45678',
    QUEUE_HEARTBEAT_INTERVAL_MS: '56789',
    CACHE_CLEANUP_INTERVAL_MS: '67890',
    TEMP_REPORT_TTL_MS: '78901',
    REPORT_DIRECTORY_TTL_MS: '89012',
    QUICK_SCAN_REPORT_TTL_MS: '90123',
  });

  assert.equal(parsed.nodeEnv, 'production');
  assert.equal(parsed.port, 9000);
  assert.equal(parsed.scannerPort, 9100);
  assert.equal(parsed.scannerServiceUrl, 'http://legacy-scanner:8001');
  assert.equal(parsed.requestLogEnabled, false);
  assert.equal(parsed.processingTimeoutMs, 12345);
  assert.equal(parsed.queueMaxRetries, 2);
  assert.equal(parsed.auditRecoveryEnabled, true);
  assert.equal(parsed.auditRecoveryCheckIntervalMs, 60001);
  assert.equal(parsed.auditRecoveryRetryDelayMs, 120000);
  assert.equal(parsed.auditRecoveryBatchSize, 12);
  assert.equal(parsed.auditRecoveryMaxAttempts, 4);
  assert.equal(parsed.queueBackend, 'bullmq');
  assert.equal(parsed.redisUrl, 'redis://cache:6379/0');
  assert.equal(parsed.bullMqPrefix, 'silver-test');
  assert.equal(parsed.openAiApiKey, 'sk-test');
  assert.equal(parsed.openAiModel, 'gpt-test-mini');
  assert.equal(parsed.openAiBaseUrl, 'https://api.example.com/v1');
  assert.equal(parsed.openAiTimeoutMs, 4567);
  assert.equal(parsed.scannerMaxConcurrentAudits, 2);
  assert.equal(parsed.scannerMaxQueuedAudits, 11);
  assert.equal(parsed.fullAuditMaxPages, 500);
  assert.equal(parsed.fullAuditMaxDepth, 3);
  assert.equal(parsed.fullAuditCrawlDelayMs, 1500);
  assert.equal(parsed.fullAuditCrawlTimeoutMs, 45000);
  assert.equal(parsed.fullAuditCrawlMaxRetries, 4);
  assert.equal(parsed.fullAuditTotalPageLimit, 9);
  assert.equal(parsed.fullAuditPriorityPageLimit, 4);
  assert.equal(parsed.fullAuditFullModePageLimit, 3);
  assert.equal(parsed.fullAuditMaxFullFailuresPerDevice, 5);
  assert.equal(parsed.fullAuditMaxFullFailuresPerAudit, 7);
  assert.equal(parsed.fullAuditScannerCooldownMs, 2200);
  assert.equal(parsed.fullAuditCacheTtlMs, 86400000);
  assert.equal(parsed.queueCleanupIntervalMs, 23456);
  assert.equal(parsed.queueMaintenanceIntervalMs, 34567);
  assert.equal(parsed.queueLeaseDurationMs, 45678);
  assert.equal(parsed.queueHeartbeatIntervalMs, 56789);
  assert.equal(parsed.cacheCleanupIntervalMs, 67890);
  assert.equal(parsed.tempReportTtlMs, 78901);
  assert.equal(parsed.reportDirectoryTtlMs, 89012);
  assert.equal(parsed.quickScanReportTtlMs, 90123);
});

test('readEnv falls back to localhost scanner URL', () => {
  const parsed = readEnv({
    SCANNER_PORT: '8123',
  });

  assert.equal(parsed.scannerServiceUrl, 'http://localhost:8123');
  assert.equal(parsed.queueBackend, 'persistent');
  assert.equal(parsed.queueMaxRetries, 1);
  assert.equal(parsed.openAiModel, 'gpt-4o');
  assert.equal(parsed.openAiBaseUrl, 'https://api.openai.com/v1');
  assert.equal(parsed.openAiTimeoutMs, 20_000);
  assert.equal(parsed.auditRecoveryEnabled, false);
  assert.equal(parsed.auditRecoveryCheckIntervalMs, 60_000);
  assert.equal(parsed.auditRecoveryRetryDelayMs, 5 * 60 * 1000);
  assert.equal(parsed.auditRecoveryBatchSize, 10);
  assert.equal(parsed.auditRecoveryMaxAttempts, 3);
  assert.equal(parsed.scannerMaxConcurrentAudits, 1);
  assert.equal(parsed.scannerMaxQueuedAudits, 8);
  assert.equal(parsed.fullAuditMaxPages, 25);
  assert.equal(parsed.fullAuditMaxDepth, 1);
  assert.equal(parsed.fullAuditCrawlDelayMs, 2000);
  assert.equal(parsed.fullAuditCrawlTimeoutMs, 15000);
  assert.equal(parsed.fullAuditCrawlMaxRetries, 3);
  assert.equal(parsed.fullAuditTotalPageLimit, 25);
  assert.equal(parsed.fullAuditPriorityPageLimit, 3);
  assert.equal(parsed.fullAuditFullModePageLimit, 2);
  assert.equal(parsed.fullAuditMaxFullFailuresPerDevice, 2);
  assert.equal(parsed.fullAuditMaxFullFailuresPerAudit, 3);
  assert.equal(parsed.fullAuditScannerCooldownMs, 250);
  assert.equal(parsed.fullAuditCacheTtlMs, 24 * 60 * 60 * 1000);
  assert.equal(parsed.quickScanReportTtlMs, 30 * 60 * 1000);
});

test('readEnv uses PUPPETEER_EXECUTABLE_PATH when CHROME_PATH is not set', () => {
  const parsed = readEnv({
    PUPPETEER_EXECUTABLE_PATH: '/custom/chrome',
  });

  assert.equal(parsed.chromePath, '/custom/chrome');
});
