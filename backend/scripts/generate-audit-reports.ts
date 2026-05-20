import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../src/config/env.ts';
import { resolveBackendPath } from '../src/config/paths.ts';
import { requestScannerAudit } from '../src/features/scanner/scanner-client.ts';
import { buildAuditScorecard } from '../src/features/audits/audit-scorecard.ts';
import {
  calculateSeniorFriendlinessScore,
  generateCombinedPlatformReport,
  generateLiteAccessibilityReport,
  generateSeniorAccessibilityReport,
  generateSummaryPDF,
  type FullAuditPlatformReport,
} from '../src/features/audits/report-generation.ts';
import type { FullAuditDevice } from '../src/features/audits/full-audit.helpers.ts';

type Mode = 'quick' | 'full' | 'both';

interface CliOptions {
  url: string;
  email: string;
  mode: Mode;
  device: FullAuditDevice;
  pages: string[];
  outDir: string;
}

interface GeneratedFile {
  kind: string;
  path: string;
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function parseMode(value: string | undefined): Mode {
  if (value === 'quick' || value === 'full' || value === 'both') {
    return value;
  }

  return 'both';
}

function parseDevice(value: string | undefined): FullAuditDevice {
  if (value === 'mobile' || value === 'tablet') {
    return value;
  }

  return 'desktop';
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('URL is required. Pass --url=https://example.com');
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parsePages(rawPages: string | undefined, fallbackUrl: string): string[] {
  const pages = (rawPages || '')
    .split(',')
    .map((page) => page.trim())
    .filter(Boolean)
    .map(normalizeUrl);

  return pages.length > 0 ? pages : [fallbackUrl];
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'audit';
}

function buildOptions(): CliOptions {
  const url = normalizeUrl(getArg('url') || 'https://example.com');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutDir = resolveBackendPath('reports-local', `${timestamp}-${sanitizePathSegment(url)}`);

  return {
    url,
    email: getArg('email') || 'local-test@silversurfers.local',
    mode: parseMode(getArg('mode')),
    device: parseDevice(getArg('device')),
    pages: parsePages(getArg('pages'), url),
    outDir: path.resolve(getArg('out') || defaultOutDir),
  };
}

async function copyJsonReport(sourcePath: string, targetPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(sourcePath, 'utf8');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, raw, 'utf8');
  await fs.rm(sourcePath, { force: true }).catch(() => undefined);
  return JSON.parse(raw) as Record<string, unknown>;
}

async function assertScannerReachable(): Promise<void> {
  const response = await fetch(`${env.scannerServiceUrl}/healthz`).catch((error) => {
    throw new Error(`Scanner is not reachable at ${env.scannerServiceUrl}: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (!response.ok) {
    throw new Error(`Scanner health check failed at ${env.scannerServiceUrl}/healthz with HTTP ${response.status}`);
  }
}

async function generateQuickReport(options: CliOptions): Promise<GeneratedFile[]> {
  console.log(`Running quick scan for ${options.url} (${options.device})`);
  const result = await requestScannerAudit({
    url: options.url,
    device: options.device,
    format: 'json',
    isLiteVersion: true,
    includeReport: true,
  });

  if (!result.success) {
    throw new Error(`Quick scan failed: ${result.errorCode} ${result.error}`);
  }

  const quickDir = path.join(options.outDir, 'quick-scan');
  const jsonPath = path.join(quickDir, `quick-${options.device}.json`);
  const report = await copyJsonReport(result.reportPath, jsonPath);
  const scorecard = buildAuditScorecard(report, {
    isLiteVersion: true,
    pageUrl: options.url,
  });
  const pdf = await generateLiteAccessibilityReport(jsonPath, quickDir);
  const scorecardPath = path.join(quickDir, `quick-${options.device}-scorecard.json`);
  await fs.writeFile(scorecardPath, JSON.stringify(scorecard, null, 2), 'utf8');

  return [
    { kind: 'quick-json', path: jsonPath },
    { kind: 'quick-scorecard', path: scorecardPath },
    { kind: 'quick-pdf', path: pdf.reportPath },
  ];
}

async function generateFullReports(options: CliOptions): Promise<GeneratedFile[]> {
  console.log(`Running full audit for ${options.pages.length} page(s) (${options.device})`);
  const fullDir = path.join(options.outDir, 'full-audit');
  const pageReports: FullAuditPlatformReport[] = [];
  const individualPdfPaths: string[] = [];
  const generatedFiles: GeneratedFile[] = [];

  for (const [index, pageUrl] of options.pages.entries()) {
    console.log(`Full audit page ${index + 1}/${options.pages.length}: ${pageUrl}`);
    const result = await requestScannerAudit({
      url: pageUrl,
      device: options.device,
      format: 'json',
      isLiteVersion: false,
      includeReport: true,
    });

    if (!result.success) {
      throw new Error(`Full audit failed for ${pageUrl}: ${result.errorCode} ${result.error}`);
    }

    const pageDir = path.join(fullDir, `page-${index + 1}-${sanitizePathSegment(pageUrl)}`);
    const jsonPath = path.join(pageDir, `full-${options.device}.json`);
    const report = await copyJsonReport(result.reportPath, jsonPath);
    const scoreResult = await calculateSeniorFriendlinessScore(report, { isLiteVersion: false });
    const scorecard = buildAuditScorecard(report, {
      isLiteVersion: false,
      pageUrl,
    });
    const scorecardPath = path.join(pageDir, `full-${options.device}-scorecard.json`);
    await fs.writeFile(scorecardPath, JSON.stringify(scorecard, null, 2), 'utf8');

    const pdf = await generateSeniorAccessibilityReport({
      inputFile: jsonPath,
      url: pageUrl,
      email_address: options.email,
      device: options.device,
      imagePaths: {},
      outputDir: pageDir,
      formFactor: options.device,
      planType: 'local-test',
    });

    pageReports.push({
      jsonReportPath: jsonPath,
      url: pageUrl,
      imagePaths: {},
      score: Number.isFinite(scoreResult.finalScore) ? scoreResult.finalScore : null,
    });
    individualPdfPaths.push(pdf.reportPath);
    generatedFiles.push(
      { kind: 'full-json', path: jsonPath },
      { kind: 'full-scorecard', path: scorecardPath },
      { kind: 'full-page-pdf', path: pdf.reportPath },
    );
  }

  const combinedPdf = await generateCombinedPlatformReport({
    reports: pageReports,
    device: options.device,
    email_address: options.email,
    outputDir: fullDir,
    planType: 'local-test',
    individualPdfPaths,
  });
  const summaryPdf = await generateSummaryPDF(
    pageReports.map((report) => ({ platform: report.url, score: report.score })),
    path.join(fullDir, `summary-${options.device}.pdf`),
  );

  generatedFiles.push(
    { kind: 'full-combined-pdf', path: combinedPdf },
    { kind: 'full-summary-pdf', path: summaryPdf },
  );

  return generatedFiles;
}

async function main(): Promise<void> {
  const options = buildOptions();
  await fs.mkdir(options.outDir, { recursive: true });
  await assertScannerReachable();

  const generatedFiles: GeneratedFile[] = [];
  if (options.mode === 'quick' || options.mode === 'both') {
    generatedFiles.push(...await generateQuickReport(options));
  }

  if (options.mode === 'full' || options.mode === 'both') {
    generatedFiles.push(...await generateFullReports(options));
  }

  const manifestPath = path.join(options.outDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scannerServiceUrl: env.scannerServiceUrl,
    url: options.url,
    pages: options.pages,
    mode: options.mode,
    device: options.device,
    email: options.email,
    files: generatedFiles,
  }, null, 2), 'utf8');

  console.log('\nGenerated audit test reports:');
  for (const file of generatedFiles) {
    console.log(`- ${file.kind}: ${file.path}`);
  }
  console.log(`- manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
