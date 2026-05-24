import zlib from 'node:zlib';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';

const gunzip = promisify(zlib.gunzip);

const internalLinksLogger = logger.child('feature:audits:internal-links');

// Extensions that are definitively not auditable HTML pages.
// .gz is included so that any compressed file that slips through is blocked.
const NON_HTML_ASSET_PATTERN = /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf|xml|json|csv|mp4|mp3|webm|ogg|wav|flac|gz)$/i;

// Matches both plain and gzip-compressed sitemap filenames.
const SITEMAP_FILE_RE = /\.xml(\.gz)?$/i;

// Sitemaps that hold paginated, product-catalogue or media content.
// We skip recursing into these to avoid flooding the audit with detail pages.
//
// Matches (examples):
//   sitemap_p_0.xml.gz          (paginated — explicit number suffix)
//   sitemap_paginated_0.xml.gz
//   sitemap_product_0.xml.gz
//   sitemap_category_1.xml
//   sitemap_brand_3.xml.gz
//   sitemap_faceted_0.xml.gz
//   sitemap_lts_0.xml.gz        (Best Buy "Long-Tail Search")
//   sitemap_reviews.xml         (product review pages)
//   sitemap_image.xml
//   sitemap_video.xml
//
// Does NOT match:
//   sitemap_pages.xml           (navigational pages — no number)
//   sitemap_page.xml
//   sitemap_main.xml
const SKIP_SITEMAP_RE = /(sitemap[_-]p[_-]\d+|sitemap[_-](paginated|product|products|category|categories|brand|brands|faceted|lts|news|video|videos|image|images|img|reviews?|media|amp)[_-]?\d*)\.xml(\.gz)?$/i;

// Maximum number of nested sitemaps to recurse into from a single index.
// Prevents fetching hundreds of compressed product-catalogue sitemaps.
const MAX_NESTED_SITEMAPS_PER_INDEX = 5;

// Sitemaps often front-load locale mirrors or generated tool pages. Collect a
// larger raw pool first, then score/filter and only then apply the caller limit.
const SITEMAP_RAW_LINK_MULTIPLIER = 5;
const SITEMAP_RAW_LINK_MIN = 250;
const SITEMAP_RAW_LINK_MAX = 1000;

// ── URL quality scoring ───────────────────────────────────────────────────────

// Mirror of the keyword lists in full-audit.strategy.ts so scoring is consistent.
const PRIMARY_NAV_KEYWORDS = ['pricing', 'price', 'plan', 'plans', 'service', 'services', 'solution', 'solutions', 'feature', 'features'];
const SECONDARY_NAV_KEYWORDS = ['contact', 'about', 'help', 'faq', 'support', 'accessibility', 'careers', 'team', 'blog', 'press', 'legal', 'privacy', 'terms'];
const LANGUAGE_CODE_SEGMENTS = new Set([
  'am', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'da', 'de', 'el', 'es', 'et', 'fa', 'fi', 'fr', 'gu',
  'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'kn', 'ko', 'lt', 'lv', 'mk', 'ml',
  'mn', 'mr', 'ms', 'my', 'nb', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'so', 'sq', 'sr',
  'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh',
]);

function isLocalePathSegment(segment: string): boolean {
  const normalized = segment.toLowerCase();
  const [language, region] = normalized.split('-');
  if (!language || !LANGUAGE_CODE_SEGMENTS.has(language)) return false;
  return !region || /^(?:[a-z]{2}|\d{3})$/i.test(region);
}

/**
 * Scores a URL as an audit target.
 *
 * Returns -1  → hard-blocked (never include).
 * Returns 0   → very low priority (include only when nothing better exists).
 * Returns 1–100 → include; higher = more important.
 *
 * Scoring factors:
 *  + Shallow path depth  (root-level pages = probably main navigation)
 *  + Navigation keywords in path  (pricing, about, contact…)
 *  − Long numeric segments  (product SKUs like /32381217)
 *  − Very deep paths  (5+ segments)
 *  − Transactional/account paths  (cart, checkout, login…)
 */
export function scorePageUrl(url: string, baseOrigin: string): number {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(baseOrigin);
  } catch {
    return -1;
  }

  if (!isSameAuditableSite(parsed, base)) return -1;

  const path = parsed.pathname;
  const pathLower = path.toLowerCase();
  const segments = path.split('/').filter(Boolean);
  const depth = segments.length;

  // Hard block locale mirrors such as /fr-FR, /zh-CN, /am-ET/images.
  // They are duplicate language variants, not distinct audit targets.
  if (segments[0] && isLocalePathSegment(segments[0])) {
    return -1;
  }

  // Hard block utility/template pages. These are generated tool/content pages
  // that flood sitemaps but are not representative navigation targets.
  if (/^\/(?:translate|writing)\//i.test(pathLower) || /^\/images\/i\//i.test(pathLower)) {
    return -1;
  }

  // Hard block: transactional / account pages — never audit these.
  if (/\/(cart|checkout|basket|wishlist|my-account|order-status|login|signin|register|signup)\b/i.test(pathLower)) {
    return -1;
  }

  // Hard block: any path segment that is a long numeric product SKU (6+ digits).
  // e.g. /site/reviews/-1-hits-70s-cd/32381217  →  32381217 is a product SKU.
  if (segments.some((seg) => /^\d{6,}$/.test(seg))) {
    return -1;
  }

  // Hard block: alphanumeric product-catalogue ID segments.
  // Covers Best Buy's pcmcat/pcmid/abcat/cat convention
  // (e.g., pcmcat748301920615.c, abcat0107017.c, cat09000.c)
  // and similar patterns used by other large e-commerce catalogues.
  // These are category-browsing pages — not meaningful accessibility audit targets.
  if (segments.some((seg) => /^(?:pcm(?:cat|id)|abcat|cat)\d{4,}/i.test(seg))) {
    return -1;
  }

  // Hard block: path segments that contain long hexadecimal hashes or UUIDs.
  // These identify user-generated / machine-generated content items rather than
  // navigational pages.  Examples that are blocked:
  //   /g/g-690d07f5098881919da2ff75e38fb89c-team-india-cricket-gpt  (ChatGPT GPT)
  //   /share/550e8400-e29b-41d4-a716-446655440000                   (OpenAI share link)
  //   /notion-page-abc123def456789012345678                         (Notion UUID)
  // A run of 20+ consecutive hex characters (0–9, a–f) in a URL segment is
  // virtually never a human-readable navigation page.
  if (
    segments.some(
      (seg) =>
        // Standard UUID format  (e.g., 550e8400-e29b-41d4-a716-446655440000)
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ||
        // Long embedded hex run — hash IDs, content fingerprints, GPT IDs, etc.
        /[0-9a-f]{20,}/i.test(seg),
    )
  ) {
    return -1;
  }

  // Very deep paths (5+ segments) are almost certainly product/detail pages.
  if (depth >= 5) return 1;

  // Base score: shallower path → higher priority.
  let score = Math.max(5, 65 - depth * 12);

  if (PRIMARY_NAV_KEYWORDS.some((kw) => pathLower.includes(kw))) {
    score += 30;
  } else if (SECONDARY_NAV_KEYWORDS.some((kw) => pathLower.includes(kw))) {
    score += 20;
  }

  return Math.min(score, 100);
}

/**
 * Removes hard-blocked URLs and sorts the rest by navigation quality score,
 * highest first. The homepage (depth 0) is always moved to position 0.
 */
export function rankPageLinks(links: string[], baseOrigin: string): string[] {
  const scored = links
    .map((link) => ({ link, score: scorePageUrl(link, baseOrigin) }))
    .filter((item) => item.score >= 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.link);
}

// Sitemap paths to probe when robots.txt yields nothing.
const SITEMAP_CANDIDATE_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap/sitemap.xml',
  '/sitemaps/sitemap.xml',
];

export interface InternalLinksExtractionResult {
  success: boolean;
  links: string[];
  strategy?: string;
  error?: string;
  details?: string;
}

export interface InternalLinksExtractorOptions {
  maxLinks?: number;
  maxDepth?: number;
  delayMs?: number;
  timeout?: number;
  maxRetries?: number;
}

interface CamoufoxCrawlResult {
  links: string[];
  finalUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAbortController(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePageUrl(href: string): string {
  return canonicalizePageUrl(href).url;
}

function normalizeComparableHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isSameAuditableSite(candidate: URL, base: URL): boolean {
  return candidate.protocol === base.protocol && normalizeComparableHost(candidate.hostname) === normalizeComparableHost(base.hostname);
}

const HOMEPAGE_ALIAS_PATHS = new Set([
  '/',
  '/home',
  '/index',
  '/index.html',
  '/index.htm',
  '/default',
  '/default.aspx',
]);

function normalizeAuditPath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const lower = collapsed.toLowerCase();
  return HOMEPAGE_ALIAS_PATHS.has(lower) ? '/' : collapsed;
}

function canonicalizePageUrl(href: string): { url: string; key: string } {
  try {
    const parsed = new URL(href);
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    const path = normalizeAuditPath(parsed.pathname);
    parsed.pathname = path === '/' ? '/' : path;

    const displayUrl = path === '/'
      ? parsed.origin
      : parsed.href.replace(/\/$/, '');
    const keyHost = normalizeComparableHost(parsed.hostname);
    const keyPort = parsed.port ? `:${parsed.port}` : '';
    return {
      url: displayUrl,
      key: `${parsed.protocol}//${keyHost}${keyPort}${path.toLowerCase()}`,
    };
  } catch {
    const fallback = String(href || '').trim().replace(/\/+$/, '');
    return { url: fallback, key: fallback.toLowerCase() };
  }
}

function comparablePageKey(href: string): string {
  return canonicalizePageUrl(href).key;
}

// ── Exported utilities ────────────────────────────────────────────────────────

/** Parse <loc> entries out of sitemap XML. */
export function extractSitemapLocs(xmlContent: string): string[] {
  const matches = String(xmlContent || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi);
  return [...matches]
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v));
}

// ── Low-level network helpers ─────────────────────────────────────────────────

/**
 * Fetch a sitemap file and return its XML text.
 * Handles both plain XML and gzip-compressed XML (.xml.gz) transparently:
 * detects the gzip magic bytes (1f 8b) and decompresses before returning.
 */
async function fetchSitemapXml(url: string, timeoutMs: number): Promise<string | null> {
  const { signal, cancel } = makeAbortController(timeoutMs);
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SilverSurfersBot/1.0)',
        Accept: 'application/xml,text/xml;q=0.9,application/x-gzip;q=0.8,*/*;q=0.7',
      },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Gzip magic bytes: 0x1f 0x8b
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        const decompressed = await gunzip(buffer);
        return decompressed.toString('utf8');
      } catch {
        internalLinksLogger.debug(`Failed to decompress gzip sitemap: ${url}`);
        return null;
      }
    }

    return buffer.toString('utf8');
  } catch {
    return null;
  } finally {
    cancel();
  }
}

/** Fetch raw text with a timeout. Returns null on any error. */
async function fetchText(url: string, timeoutMs: number, accept?: string): Promise<string | null> {
  const { signal, cancel } = makeAbortController(timeoutMs);
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SilverSurfersBot/1.0)',
        ...(accept ? { Accept: accept } : {}),
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    cancel();
  }
}

/** Fetch HTML for a page. Returns the HTML body and the final URL after redirects. */
async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string } | null> {
  const { signal, cancel } = makeAbortController(timeoutMs);
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

// ── HTML link parsing ─────────────────────────────────────────────────────────

interface ParsedHtmlLinks {
  links: string[];
  canonical: string | null;
}

/**
 * Extracts same-origin <a href> links from an HTML string.
 * Also reads the canonical URL so callers can skip non-canonical duplicates.
 */
function parseLinksFromHtml(html: string, pageUrl: string, origin: string): ParsedHtmlLinks {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  const baseUrl = new URL(origin);

  // Canonical URL
  const rawCanonical = $('link[rel="canonical"]').attr('href') || null;
  let canonical: string | null = null;
  if (rawCanonical) {
    try {
      canonical = new URL(rawCanonical, pageUrl).href;
    } catch { /* ignore */ }
  }

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    try {
      const parsed = new URL(href, pageUrl);
      if (!isSameAuditableSite(parsed, baseUrl)) return;

      parsed.hash = '';
      parsed.search = '';
      const clean = normalizePageUrl(parsed.href);
      if (clean !== origin && !NON_HTML_ASSET_PATTERN.test(clean)) {
        links.add(clean);
      }
    } catch { /* skip invalid hrefs */ }
  });

  return { links: Array.from(links), canonical };
}

// ── Strategy 1: Sitemap ───────────────────────────────────────────────────────

/**
 * Reads robots.txt and returns any `Sitemap:` directive URLs listed there.
 * This is the most reliable way to discover non-standard sitemap paths.
 */
async function readSitemapUrlsFromRobotsTxt(origin: string, timeoutMs: number): Promise<string[]> {
  const text = await fetchText(`${origin}/robots.txt`, timeoutMs, 'text/plain');
  if (!text) return [];

  const urls: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^Sitemap:\s*(\S+)/i.exec(line.trim());
    if (match?.[1]) urls.push(match[1]);
  }
  return urls;
}

/**
 * Recursively fetches a sitemap (or sitemap index) and returns
 * all same-origin auditable page URLs found inside it.
 *
 * Key rules:
 *  - Both plain (.xml) and gzip-compressed (.xml.gz) sitemaps are handled.
 *  - Paginated / product-catalogue nested sitemaps are skipped (they produce
 *    thousands of product URLs that are useless for an accessibility audit).
 *  - At most MAX_NESTED_SITEMAPS_PER_INDEX nested sitemaps are recursed into
 *    from any single index to prevent runaway fetching.
 */
async function parseSitemapRecursive(
  sitemapUrl: string,
  origin: string,
  timeoutMs: number,
  maxLinks: number,
  visitedSitemaps: Set<string>,
  depth = 0,
): Promise<string[]> {
  if (visitedSitemaps.has(sitemapUrl) || depth > 4) return [];
  visitedSitemaps.add(sitemapUrl);
  const baseUrl = new URL(origin);

  const xml = await fetchSitemapXml(sitemapUrl, timeoutMs);
  if (!xml) return [];

  const locs = extractSitemapLocs(xml);
  const pageLinks: string[] = [];
  const nestedSitemaps: string[] = [];

  for (const loc of locs) {
    try {
      const parsed = new URL(loc);
      if (!isSameAuditableSite(parsed, baseUrl)) continue;

      // Detect both .xml and .xml.gz as nested sitemap files.
      if (SITEMAP_FILE_RE.test(parsed.pathname)) {
        // Skip paginated / product-catalogue sitemaps — they only contain
        // product detail pages which are not useful for accessibility auditing.
        if (!SKIP_SITEMAP_RE.test(parsed.href)) {
          nestedSitemaps.push(parsed.href);
        }
      } else {
        // Treat everything else as a candidate page URL.
        parsed.hash = '';
        parsed.search = '';
        const clean = normalizePageUrl(parsed.href);
        if (clean !== origin && !NON_HTML_ASSET_PATTERN.test(clean)) {
          pageLinks.push(clean);
        }
      }
    } catch { /* skip malformed loc entries */ }
  }

  // Recurse into a limited number of nested sitemaps to avoid unbounded fetching.
  const sitemapsToCheck = nestedSitemaps.slice(0, MAX_NESTED_SITEMAPS_PER_INDEX);
  for (const nested of sitemapsToCheck) {
    if (pageLinks.length >= maxLinks) break;
    const sub = await parseSitemapRecursive(nested, origin, timeoutMs, maxLinks - pageLinks.length, visitedSitemaps, depth + 1);
    for (const link of sub) {
      if (!pageLinks.includes(link)) pageLinks.push(link);
    }
  }

  return pageLinks.slice(0, maxLinks);
}

/**
 * Main sitemap extraction:
 *   1. Parse robots.txt for Sitemap directives
 *   2. Probe standard paths (/sitemap.xml, /sitemap_index.xml, …)
 *   3. Recurse into nested sitemap indexes
 */
async function extractLinksFromSitemaps(
  baseUrl: string,
  timeoutMs: number,
  maxLinks: number,
): Promise<{ links: string[]; found: boolean }> {
  const origin = new URL(baseUrl).origin;
  const visitedSitemaps = new Set<string>();
  const collectedLinks: string[] = [];
  const seenLinks = new Set<string>();
  const rawCollectionLimit = Math.max(
    maxLinks,
    Math.min(SITEMAP_RAW_LINK_MAX, Math.max(SITEMAP_RAW_LINK_MIN, maxLinks * SITEMAP_RAW_LINK_MULTIPLIER)),
  );

  // Build ordered list of sitemaps to try.
  const robotsSitemaps = await readSitemapUrlsFromRobotsTxt(origin, timeoutMs);
  const candidates = [
    ...robotsSitemaps,
    ...SITEMAP_CANDIDATE_PATHS.map((p) => `${origin}${p}`),
  ];
  const seenCandidates = new Set<string>();

  for (const sitemapUrl of candidates) {
    if (seenCandidates.has(sitemapUrl)) continue;
    seenCandidates.add(sitemapUrl);
    if (collectedLinks.length >= rawCollectionLimit) break;

    const links = await parseSitemapRecursive(sitemapUrl, origin, timeoutMs, rawCollectionLimit, visitedSitemaps);
    for (const link of links) {
      if (collectedLinks.length >= rawCollectionLimit) break;
      if (!seenLinks.has(link)) {
        seenLinks.add(link);
        collectedLinks.push(link);
      }
    }
  }

  // Rank by navigation quality: removes product/SKU URLs and sorts
  // navigational pages (about, pricing, contact…) to the front.
  const rankedLinks = rankPageLinks(collectedLinks, origin);

  internalLinksLogger.debug(`Sitemap strategy: ${collectedLinks.length} raw → ${rankedLinks.length} after ranking.`, {
    sitemapsTried: seenCandidates.size,
    robotsSitemaps: robotsSitemaps.length,
    rawCollectionLimit,
    requestedLinks: maxLinks,
  });

  return { links: rankedLinks.slice(0, maxLinks), found: rankedLinks.length > 0 };
}

// ── Strategy 2: Cheerio HTML crawl ───────────────────────────────────────────

/**
 * Crawl the site using native fetch + Cheerio (no browser).
 * Fast and sufficient for the vast majority of server-rendered sites.
 * Skips pages that declare a canonical URL pointing elsewhere.
 */
async function crawlWithCheerio(
  baseUrl: string,
  timeoutMs: number,
  maxLinks: number,
  maxDepth: number,
  delayMs: number,
): Promise<string[]> {
  // Discover the effective origin after any redirect.
  const firstFetch = await fetchHtml(baseUrl, timeoutMs);
  const effectiveOrigin = firstFetch ? new URL(firstFetch.finalUrl).origin : new URL(baseUrl).origin;

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];
  const results: string[] = [];

  const seed = normalizePageUrl(firstFetch?.finalUrl ?? baseUrl);
  visited.add(seed);
  results.push(seed);

  if (firstFetch) {
    const { links } = parseLinksFromHtml(firstFetch.html, firstFetch.finalUrl, effectiveOrigin);
    for (const link of links) {
      if (!visited.has(link)) {
        visited.add(link);
        queue.push({ url: link, depth: 1 });
        results.push(link);
      }
    }
  }

  let queueIndex = 0;
  while (queueIndex < queue.length && results.length < maxLinks) {
    const item = queue[queueIndex++]!;
    if (item.depth >= maxDepth) continue;
    if (delayMs > 0) await sleep(delayMs);

    const fetched = await fetchHtml(item.url, timeoutMs);
    if (!fetched) continue;

    const { links, canonical } = parseLinksFromHtml(fetched.html, fetched.finalUrl, effectiveOrigin);

    // Skip non-canonical pages to avoid auditing duplicate content.
    if (canonical) {
      const normCanonical = normalizePageUrl(canonical);
      const normCurrent = normalizePageUrl(item.url);
      if (normCanonical !== normCurrent && new URL(canonical).origin === effectiveOrigin) {
        internalLinksLogger.debug(`Skipping non-canonical page: ${item.url} → ${canonical}`);
        continue;
      }
    }

    for (const link of links) {
      if (results.length >= maxLinks) break;
      if (!visited.has(link)) {
        visited.add(link);
        results.push(link);
        queue.push({ url: link, depth: item.depth + 1 });
      }
    }
  }

  return results.slice(0, maxLinks);
}

// ── Strategy 3: Puppeteer (SPA fallback) ────────────────────────────────────

/**
 * Crawl using a SINGLE Puppeteer browser instance reused across all pages.
 * Blocks images/fonts/media to speed up navigation.
 * Used only as a last resort for JavaScript-heavy SPAs where Cheerio finds nothing.
 */
async function crawlWithPuppeteer(
  baseUrl: string,
  timeoutMs: number,
  maxLinks: number,
  maxDepth: number,
  delayMs: number,
): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];
  const results: string[] = [];

  const seed = normalizePageUrl(baseUrl);
  visited.add(seed);
  results.push(seed);
  queue.push({ url: baseUrl, depth: 0 });

  // Launch ONE browser and reuse it for all pages.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );

    // Block non-essential resources so navigation is faster.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        void req.abort();
      } else {
        void req.continue();
      }
    });

    let queueIndex = 0;
    while (queueIndex < queue.length && results.length < maxLinks) {
      const item = queue[queueIndex++]!;
      if (item.depth >= maxDepth) continue;
      if (queueIndex > 1 && delayMs > 0) await sleep(delayMs);

      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

        const nonHtmlSrc = NON_HTML_ASSET_PATTERN.source;
        const links = await page.evaluate((pageOrigin: string, nonHtmlSrc: string) => {
          const re = new RegExp(nonHtmlSrc, 'i');
          const found = new Set<string>();
          document.querySelectorAll('a[href]').forEach((anchor) => {
            const href = anchor.getAttribute('href') || '';
            if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            try {
              const parsed = new URL(href, window.location.href);
              if (parsed.origin !== pageOrigin) return;
              parsed.hash = '';
              parsed.search = '';
              const clean = parsed.href.replace(/\/$/, '');
              if (clean !== pageOrigin && !re.test(clean)) found.add(clean);
            } catch { /* skip */ }
          });
          return Array.from(found);
        }, origin, nonHtmlSrc);

        for (const link of links) {
          if (results.length >= maxLinks) break;
          if (!visited.has(link)) {
            visited.add(link);
            results.push(link);
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch (error) {
        internalLinksLogger.debug(`Puppeteer navigation failed for ${item.url}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  return results.slice(0, maxLinks);
}

// ── Strategy 3: Camoufox via scanner service ─────────────────────────────────

/**
 * Calls the Python scanner service's /extract-links endpoint.
 *
 * Camoufox runs Firefox with randomised browser fingerprints, which bypasses
 * the bot-detection that defeats plain HTTP (Cheerio) and headless Chromium
 * (Puppeteer).  Best Buy, Amazon, and similar heavily-protected sites can often
 * be crawled this way when every other strategy fails.
 *
 * Returns null when the scanner service is unreachable (e.g., not yet started
 * in development) so the caller can fall through to Puppeteer gracefully.
 */
async function crawlWithCamoufox(
  baseUrl: string,
  maxLinks: number,
  maxDepth: number,
  delayMs: number,
): Promise<CamoufoxCrawlResult | null> {
  const timeoutMs = Math.max(45_000, Math.min(95_000, 35_000 + maxDepth * 20_000));
  const { signal, cancel } = makeAbortController(timeoutMs);
  try {
    const res = await fetch(`${env.scannerServiceUrl}/extract-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, maxLinks: maxLinks * 2, maxDepth, delayMs }),
      signal,
    });
    if (!res.ok) return null;

    const payload = await res.json() as {
      success?: boolean;
      links?: string[];
      finalUrl?: string;
      error?: string;
    };
    if (!payload.success || !Array.isArray(payload.links)) return null;
    return { links: payload.links, finalUrl: payload.finalUrl };
  } catch {
    // Scanner service is down or unreachable — fall through to Puppeteer.
    return null;
  } finally {
    cancel();
  }
}

/**
 * Probes a curated list of common navigation URL paths using lightweight HEAD
 * requests fired concurrently (roughly one RTT total).
 *
 * Returns only URLs that:
 *   1. respond with a 2xx status, AND
 *   2. do NOT redirect to a different origin (which signals a login wall or
 *      catch-all redirect).
 *
 * Used as a fast supplement when the sitemap yields no nav-primary links and
 * Camoufox/Puppeteer are unavailable or blocked.  The probed paths are chosen
 * to match PRIMARY_NAV_KEYWORDS so anything found will score ≥ 70 and be
 * classified as nav-primary in the audit target selection step.
 */
async function probeNavUrls(origin: string, timeoutMs: number): Promise<string[]> {
  const PROBE_PATHS = [
    '/pricing', '/plans', '/plan',
    '/features',
    '/features/agent',
    '/features/apps',
    '/features/deep-research',
    '/features/desktop',
    '/features/images',
    '/features/voice',
    '/enterprise', '/business',
    '/business/business-plan',
    '/about', '/about-us',
    '/contact', '/contact-us', '/contact-sales',
    '/solutions',
    '/services',
    '/help', '/support', '/faq',
    '/careers', '/jobs',
    '/blog',
    '/team',
    '/apps',
    '/codex',
    '/atlas',
    '/plans/free',
    '/plans/plus',
    '/plans/pro',
  ];

  const perUrlTimeout = Math.min(6_000, timeoutMs);
  const baseUrl = new URL(origin);

  const settled = await Promise.allSettled(
    PROBE_PATHS.map(async (path): Promise<string | null> => {
      const url = `${origin}${path}`;

      for (const method of ['HEAD', 'GET'] as const) {
        const { signal, cancel } = makeAbortController(perUrlTimeout);
        try {
          const res = await fetch(url, {
            method,
            redirect: 'follow',
            signal,
            headers: method === 'GET'
              ? { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }
              : undefined,
          });
          cancel();
          if (!res.ok) continue;
          // If the response redirected us off-origin (login wall, external CDN) skip it.
          if (res.url && !isSameAuditableSite(new URL(res.url), baseUrl)) return null;
          return url;
        } catch {
          cancel();
        }
      }

      return null;
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeLinks(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const link of group) {
      const canonical = canonicalizePageUrl(link);
      if (!canonical.url || seen.has(canonical.key)) continue;
      seen.add(canonical.key);
      result.push(canonical.url);
    }
  }
  return result;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export class InternalLinksExtractor {
  private readonly config: Required<InternalLinksExtractorOptions>;

  constructor(options: InternalLinksExtractorOptions = {}) {
    this.config = {
      maxLinks: options.maxLinks ?? 25,
      maxDepth: options.maxDepth ?? 3,
      delayMs: options.delayMs ?? 1000,
      timeout: options.timeout ?? 15_000,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  public async extractInternalLinks(baseUrl: string): Promise<InternalLinksExtractionResult> {
    const { maxLinks, maxDepth, delayMs, timeout } = this.config;
    const discoveryLimit = Math.max(maxLinks, env.fullAuditTotalPageLimit, 100);
    const homepageUrl = normalizePageUrl(baseUrl);
    const origin = new URL(baseUrl).origin;

    internalLinksLogger.info('Starting internal link extraction.', {
      url: baseUrl,
      maxLinks,
      maxDepth,
      discoveryLimit,
    });

    /**
     * Final post-processing applied to every strategy result:
     *  1. Always keep homepage at position 0.
     *  2. Score and sort the remaining links — nav pages first, SKUs blocked.
     *  3. Slice to maxLinks.
     */
    const finalizeLinks = (raw: string[], effectiveHomeUrl?: string): string[] => {
      const normalizedHome = normalizePageUrl(effectiveHomeUrl || homepageUrl);
      const effectiveOrigin = new URL(normalizedHome).origin;
      const normalizedHomeKey = comparablePageKey(normalizedHome);
      const withoutHome = mergeLinks(raw).filter((l) => comparablePageKey(l) !== normalizedHomeKey);
      const ranked = rankPageLinks(withoutHome, effectiveOrigin);
      return [normalizedHome, ...ranked].slice(0, maxLinks);
    };

    let camoufoxSeed: CamoufoxCrawlResult | null = null;
    if (env.fullAuditLinkExtractionCamoufoxFirst) {
      try {
        camoufoxSeed = await crawlWithCamoufox(baseUrl, discoveryLimit, maxDepth, delayMs);
        if (camoufoxSeed && camoufoxSeed.links.length >= 3) {
          internalLinksLogger.debug(`Camoufox-first found ${camoufoxSeed.links.length} raw links; continuing with sitemap/probe supplement.`);
        }
      } catch (error) {
        internalLinksLogger.debug('Camoufox-first strategy failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ── Strategy 1: Sitemap ────────────────────────────────────────────────
    //   Fastest source; lists all pages the site declares as indexable.
    //   Checks robots.txt first, then probes standard sitemap paths.
    try {
      const { links: sitemapLinks, found } = await extractLinksFromSitemaps(baseUrl, timeout, discoveryLimit);

      if (found && sitemapLinks.length > 0) {
        // Quality gate: sitemapLinks is already ranked highest-first.
        // If the top link scores < 20, every link is a deep catalogue/product page
        // (depth ≥ 4, no nav keywords) — the sitemap is not giving us auditable
        // navigation pages.  Fall through to Cheerio which will crawl the real nav.
        const topScore = scorePageUrl(sitemapLinks[0]!, origin);
        if (topScore < 20) {
          internalLinksLogger.debug(
            `Sitemap quality gate: top link scores ${topScore} (< 20) — ` +
            `all ${sitemapLinks.length} links are product/category pages. ` +
            'Falling back to Cheerio for real navigation links.',
          );
          // Do NOT return — fall through to Strategy 2 (Cheerio).
        } else {
          const merged = finalizeLinks(mergeLinks([homepageUrl], camoufoxSeed?.links ?? [], sitemapLinks), camoufoxSeed?.finalUrl);

          // Check whether the sitemap provided any genuine navigation pages (score ≥ 70).
          // Sites like chatgpt.com have a sitemap full of translate / writing / gpts pages
          // (depth-1, score ~53) but their real navigation — /features/voice/, /pricing/,
          // /enterprise/, /atlas/ — is rendered by client-side JS and absent from the
          // sitemap.  When no nav-primary link is present we must supplement with a
          // browser-rendered crawl so those pages are discovered.
          const hasNavPrimary = merged.some(
            (link) => comparablePageKey(link) !== comparablePageKey(homepageUrl) && scorePageUrl(link, origin) >= 70,
          );

          if ((merged.length >= maxLinks || merged.length >= 5) && hasNavPrimary) {
            // Sitemap gave us enough links AND they include proper navigation pages.
            const strategy = camoufoxSeed && camoufoxSeed.links.length >= 3 ? 'camoufox+sitemap' : 'sitemap';
            internalLinksLogger.info(`Extraction done via ${strategy}. Total: ${merged.length} links.`);
            return { success: true, links: merged, strategy };
          }

          if (!hasNavPrimary) {
            // Sitemap found content links but none are nav-primary.  Try Camoufox first
            // (JS-rendering reveals the real navbar), then fall back to Cheerio.
            internalLinksLogger.debug(
              `Sitemap returned ${merged.length} links but none score ≥ 70 (nav-primary) — ` +
              'supplementing with Camoufox to discover JS-rendered navigation.',
            );
            const camoufoxResult = camoufoxSeed ?? await crawlWithCamoufox(baseUrl, discoveryLimit, maxDepth, delayMs);
            if (camoufoxResult && camoufoxResult.links.length >= 3) {
              const combined = finalizeLinks(mergeLinks(merged, camoufoxResult.links), camoufoxResult.finalUrl);
              const hasCamoufoxNavPrimary = combined.some(
                (link) => comparablePageKey(link) !== comparablePageKey(homepageUrl) && scorePageUrl(link, origin) >= 70,
              );
              if (hasCamoufoxNavPrimary) {
                internalLinksLogger.info(`Extraction done via sitemap+camoufox. Total: ${combined.length} links.`);
                return { success: true, links: combined, strategy: 'sitemap+camoufox' };
              }
              internalLinksLogger.debug(
                `Camoufox added ${camoufoxResult.links.length} links but still no nav-primary pages; continuing to nav probes.`,
              );
            }
            // Camoufox unavailable or found too few — run Cheerio crawl and nav
            // URL probing concurrently as a fallback.  Probing fires HEAD requests
            // to /pricing, /features, /enterprise, etc. and finds any that respond
            // 2xx without redirecting off-origin.  This is cheap (one parallel RTT)
            // and doesn't require browser rendering or bypassing bot protection.
            const [cheerioLinks, probedLinks] = await Promise.all([
              crawlWithCheerio(baseUrl, timeout, discoveryLimit, maxDepth, delayMs),
              probeNavUrls(origin, timeout),
            ]);
            const combined = finalizeLinks(mergeLinks(merged, [...cheerioLinks, ...probedLinks]));
            const hasProbeNavPrimary = probedLinks.some((l) => scorePageUrl(l, origin) >= 70);
            const strategy = hasProbeNavPrimary ? 'sitemap+probe' : 'sitemap+cheerio';
            internalLinksLogger.info(`Extraction done via ${strategy} (no nav-primary in sitemap/Camoufox). Total: ${combined.length} links.`);
            return { success: true, links: combined, strategy };
          }

          // Sitemap has nav-primary links but fewer than desired — supplement with Cheerio.
          internalLinksLogger.debug(`Sitemap returned ${merged.length} links; supplementing with Cheerio crawl.`);
          const cheerioLinks = await crawlWithCheerio(baseUrl, timeout, discoveryLimit, maxDepth, delayMs);
          const combined = finalizeLinks(mergeLinks(merged, cheerioLinks));
          internalLinksLogger.info(`Extraction done via sitemap+cheerio. Total: ${combined.length} links.`);
          return { success: true, links: combined, strategy: 'sitemap+cheerio' };
        }
      }
    } catch (error) {
      internalLinksLogger.debug('Sitemap strategy failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // ── Strategy 2: Cheerio crawl ──────────────────────────────────────────
    //   Native fetch + HTML parsing — no browser overhead.
    //   Works for ~80–90 % of server-rendered / hybrid sites.
    try {
      const cheerioLinks = await crawlWithCheerio(baseUrl, timeout, discoveryLimit, maxDepth, delayMs);

      if (cheerioLinks.length >= 3) {
        const combined = mergeLinks(camoufoxSeed?.links ?? [], cheerioLinks);
        const finalized = finalizeLinks(combined, camoufoxSeed?.finalUrl);
        const strategy = camoufoxSeed && camoufoxSeed.links.length >= 3 ? 'camoufox+cheerio' : 'cheerio';
        internalLinksLogger.info(`Extraction done via ${strategy}. Total: ${finalized.length} links.`);
        return { success: true, links: finalized, strategy };
      }

      internalLinksLogger.debug(
        `Cheerio found only ${cheerioLinks.length} links — ` +
        'site may be JS-rendered or bot-protected. Trying Camoufox.',
      );
    } catch (error) {
      internalLinksLogger.debug('Cheerio strategy failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // ── Strategy 3: Camoufox (scanner service) ────────────────────────────
    //   Firefox with randomised fingerprints — bypasses bot-detection that
    //   blocks both plain HTTP (Cheerio) and headless Chromium (Puppeteer).
    //   Best Buy, Amazon, heavily-protected e-commerce sites land here.
    //   Returns null gracefully when scanner service is not running.
    try {
      const camoufoxResult = camoufoxSeed ?? await crawlWithCamoufox(baseUrl, discoveryLimit, maxDepth, delayMs);

      if (camoufoxResult && camoufoxResult.links.length >= 3) {
        const finalized = finalizeLinks(camoufoxResult.links, camoufoxResult.finalUrl);
        internalLinksLogger.info(`Extraction done via Camoufox. Total: ${finalized.length} links.`);
        return { success: true, links: finalized, strategy: 'camoufox' };
      }

      // If Camoufox reached the site but found 0 links, the site uses enterprise-grade
      // bot protection (e.g., Akamai) that blocks even Firefox fingerprinting.
      // Puppeteer (headless Chromium) would fare worse — skip it and save ~20 s.
      if (camoufoxResult !== null && camoufoxResult.links.length === 0) {
        internalLinksLogger.debug(
          'Camoufox connected but found 0 links — strong bot protection detected. ' +
          'Skipping Puppeteer (headless Chromium would not do better).',
        );
        // Fall through directly to homepage-only.
      } else {
        internalLinksLogger.debug(
          `Camoufox returned ${camoufoxResult?.links.length ?? 0} link(s) ` +
          `(${camoufoxResult === null ? 'scanner service unavailable' : 'too few'}) — trying Puppeteer.`,
        );

        // ── Strategy 4: Puppeteer ────────────────────────────────────────
        //   In-process headless Chromium — useful when the scanner service
        //   is down AND the site is a JS SPA (React / Vue / Angular).
        //   Single browser instance is created and REUSED across all pages.
        try {
          const puppeteerLinks = await crawlWithPuppeteer(baseUrl, timeout, discoveryLimit, maxDepth, delayMs);

          if (puppeteerLinks.length > 0) {
            const finalized = finalizeLinks(puppeteerLinks);
            internalLinksLogger.info(`Extraction done via Puppeteer. Total: ${finalized.length} links.`);
            return { success: true, links: finalized, strategy: 'puppeteer' };
          }
        } catch (error) {
          internalLinksLogger.error('Puppeteer strategy failed.', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      internalLinksLogger.debug('Camoufox strategy failed.', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Camoufox threw — try Puppeteer as a last resort.
      try {
        const puppeteerLinks = await crawlWithPuppeteer(baseUrl, timeout, discoveryLimit, maxDepth, delayMs);
        if (puppeteerLinks.length > 0) {
          const finalized = finalizeLinks(puppeteerLinks);
          internalLinksLogger.info(`Extraction done via Puppeteer (after Camoufox error). Total: ${finalized.length} links.`);
          return { success: true, links: finalized, strategy: 'puppeteer' };
        }
      } catch (puppeteerError) {
        internalLinksLogger.error('Puppeteer strategy also failed.', {
          error: puppeteerError instanceof Error ? puppeteerError.message : String(puppeteerError),
        });
      }
    }

    // ── Last resort: homepage only ─────────────────────────────────────────
    //   Returning just the homepage is far better than failing the whole audit.
    internalLinksLogger.warn('All link-extraction strategies failed. Falling back to homepage-only.', { url: baseUrl });
    return { success: true, links: [homepageUrl], strategy: 'homepage-only' };
  }
}

export async function extractInternalLinks(
  baseUrl: string,
  options: InternalLinksExtractorOptions = {},
): Promise<InternalLinksExtractionResult> {
  const extractor = new InternalLinksExtractor(options);
  return extractor.extractInternalLinks(baseUrl);
}
