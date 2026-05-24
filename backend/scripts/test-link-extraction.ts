/**
 * Standalone link-extraction test script.
 *
 * Runs the full link-extraction pipeline for any URL and shows exactly which
 * pages would be selected for a full audit — without triggering a real audit.
 *
 * Usage:
 *   node --import ./scripts/register-typescript-loader.mjs scripts/test-link-extraction.ts <url> [maxLinks]
 *
 * Examples:
 *   node --import ./scripts/register-typescript-loader.mjs scripts/test-link-extraction.ts https://www.bestbuy.com
 *   node --import ./scripts/register-typescript-loader.mjs scripts/test-link-extraction.ts https://example.com 10
 */

import { extractInternalLinks, scorePageUrl } from '../src/features/audits/internal-links.ts';
import { selectFullAuditTargetPages } from '../src/features/audits/full-audit.strategy.ts';
import { env } from '../src/config/env.ts';

// ── CLI args ──────────────────────────────────────────────────────────────────

const [, , rawUrl, rawMax] = process.argv;
if (!rawUrl) {
  console.error('\n  Usage: node --import ./scripts/register-typescript-loader.mjs scripts/test-link-extraction.ts <url> [maxLinks]\n');
  process.exit(1);
}

const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
const maxLinks = Math.max(1, Number(rawMax) || 25);

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, unit = 'ms'): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}${unit}`;
}

function scoreLabel(score: number): string {
  if (score < 0)  return '🚫 blocked';
  if (score >= 70) return '🟢 nav-primary';
  if (score >= 45) return '🔵 nav-secondary';
  if (score >= 20) return '⚪ content';
  return '🔴 low-quality';
}

const bucketIcon: Record<string, string> = {
  homepage:  '🏠',
  primary:   '⭐',
  secondary: '🔹',
  other:     '▫️ ',
};

// ── run ───────────────────────────────────────────────────────────────────────

// ── Scanner service health check ──────────────────────────────────────────────

let scannerAvailable = false;
try {
  const hc = await fetch(`${env.scannerServiceUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
  scannerAvailable = hc.ok;
} catch { /* not running */ }

// ── Header ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(70)}`);
console.log(`  🔍  Link Extraction Test`);
console.log(`  URL      : ${targetUrl}`);
console.log(`  maxLinks : ${maxLinks}`);
console.log(`  Scanner  : ${scannerAvailable ? '🟢 online  (Camoufox available)' : '🔴 offline (Camoufox disabled — run scanner first)'}`);
if (!scannerAvailable) {
  console.log(`\n  ⚠️  To enable Camoufox (best for bot-protected sites like Best Buy):`);
  console.log(`      cd backend\\python-scanner`);
  console.log(`      ..\\.venv\\Scripts\\activate`);
  console.log(`      python -m uvicorn scanner_service:app --host 0.0.0.0 --port 8001`);
}
console.log(`${'─'.repeat(70)}\n`);

const t0 = Date.now();

const result = await extractInternalLinks(targetUrl, {
  maxLinks,
  maxDepth: 1,
  delayMs: 500,
  timeout: 15_000,
});

const elapsed = Date.now() - t0;
const origin = new URL(targetUrl).origin;

// ── raw extraction results ────────────────────────────────────────────────────

// Describe what the winning strategy means in plain terms.
const strategyNote: Record<string, string> = {
  'sitemap':             '✅ sitemap parsed',
  'sitemap+cheerio':     '✅ sitemap + HTML crawl',
  'sitemap+camoufox':    '✅ sitemap + Camoufox (JS nav discovered)',
  'sitemap+probe':       '✅ sitemap + nav URL probing (HEAD requests)',
  'cheerio':             '✅ HTML crawl (no browser)',
  'camoufox':            '✅ Camoufox Firefox (anti-bot)',
  'puppeteer':           '⚠️  Puppeteer Chromium (last resort)',
  'homepage-only':       '🚫 all strategies blocked — homepage only',
};

// Show which strategies were skipped.
const allStrategies = ['sitemap', 'sitemap+cheerio', 'sitemap+camoufox', 'sitemap+probe', 'cheerio', 'camoufox', 'puppeteer', 'homepage-only'];
const winnerIdx = allStrategies.indexOf(result.strategy ?? 'homepage-only');
const tried = allStrategies.slice(0, winnerIdx).filter(s => {
  if (!scannerAvailable && s === 'camoufox') return false; // wasn't tried
  return true;
});

const strategyDesc = strategyNote[result.strategy ?? ''] ?? result.strategy ?? 'unknown';
console.log(`Strategy : ${strategyDesc}`);
if (tried.length > 0) {
  console.log(`Tried    : ${tried.join(' → ')} (all fell through)`);
}
console.log(`Time     : ${fmt(elapsed)}`);
console.log(`Links    : ${result.links.length}  (max requested: ${maxLinks})`);
if (!result.success) {
  console.log(`\n⚠️  Extraction failed: ${result.details ?? result.error ?? 'unknown error'}\n`);
}
if (result.links.length === 1 && result.links[0] === new URL(targetUrl).origin) {
  console.log(`\n  ℹ️  Only the homepage was found.`);
  if (scannerAvailable) {
    console.log(`  This site uses enterprise-grade bot protection (e.g., Akamai) that blocks`);
    console.log(`  all automated browsers including Camoufox.  The audit will run on the`);
    console.log(`  homepage only — this is the correct fallback.\n`);
  } else {
    console.log(`  Start the scanner service to enable Camoufox, which may bypass bot protection.\n`);
  }
}

console.log(`\n${'─'.repeat(70)}`);
console.log('  Extracted links  (sorted by navigation quality score)');
console.log(`${'─'.repeat(70)}`);

for (const [i, link] of result.links.entries()) {
  const score = scorePageUrl(link, origin);
  const label = scoreLabel(score).padEnd(18);
  const idx = String(i + 1).padStart(2);
  console.log(`  ${idx}. ${label} [${String(score).padStart(3)}]  ${link}`);
}

// ── what the full audit would actually pick ───────────────────────────────────

const totalPageLimit    = env.fullAuditTotalPageLimit;    // default 25
const priorityPageLimit = env.fullAuditPriorityPageLimit; // default 3

const innerLinks = result.links.slice(1); // exclude homepage (first item)
const auditPages = selectFullAuditTargetPages(targetUrl, innerLinks, {
  totalPageLimit,
  priorityPageLimit,
});

console.log(`\n${'─'.repeat(70)}`);
console.log(`  Full-audit page selection  (up to ${totalPageLimit} pages, ${priorityPageLimit} priority slots)`);
console.log(`${'─'.repeat(70)}`);

for (const [i, page] of auditPages.entries()) {
  const icon = bucketIcon[page.priorityBucket] ?? '  ';
  const bucket = page.priorityBucket.padEnd(10);
  const idx = String(i + 1).padStart(2);
  console.log(`  ${idx}. ${icon} [${bucket}]  ${page.url}`);
}

if (auditPages.length === 0) {
  console.log('  (no pages selected — extraction produced no usable links)');
}

console.log(`\n${'─'.repeat(70)}\n`);
