/**
 * Unit tests for the sitemap-parsing logic inside InternalLinksExtractor.
 * These tests verify the three bugs triggered by Best Buy's sitemap:
 *   1. .xml.gz URLs must be treated as nested sitemaps, not page links.
 *   2. Paginated / product-catalogue sitemaps must be skipped.
 *   3. Gzip-compressed sitemaps can be fetched and decompressed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

import { extractSitemapLocs, extractInternalLinks, scorePageUrl } from '../src/features/audits/internal-links.ts';

const gzip = promisify(zlib.gzip);

// ── extractSitemapLocs ────────────────────────────────────────────────────────

test('extractSitemapLocs returns all <loc> values', () => {
  const xml = `
    <sitemapindex>
      <sitemap><loc>https://example.com/sitemap_pages.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap_p_0.xml.gz</loc></sitemap>
    </sitemapindex>`;
  assert.deepEqual(extractSitemapLocs(xml), [
    'https://example.com/sitemap_pages.xml',
    'https://example.com/sitemap_p_0.xml.gz',
  ]);
});

test('extractSitemapLocs handles empty or missing content', () => {
  assert.deepEqual(extractSitemapLocs(''), []);
  assert.deepEqual(extractSitemapLocs('<urlset></urlset>'), []);
});

// ── Sitemap integration (mock fetch) ─────────────────────────────────────────

/**
 * Build a mock global.fetch that serves synthetic sitemap and HTML content.
 * Returns a restore function to reset global.fetch afterwards.
 */
function mockFetch(routes: Record<string, { status: number; body: string | Buffer; contentType?: string }>): () => void {
  const original = globalThis.fetch;

  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (!route) {
      return new Response(null, { status: 404 });
    }
    const body = typeof route.body === 'string' ? route.body : route.body;
    return new Response(body as BodyInit, {
      status: route.status,
      headers: { 'Content-Type': route.contentType || 'application/xml' },
    });
  };

  return () => { (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = original; };
}

test('sitemap strategy skips .xml.gz paginated sitemaps (Best Buy scenario)', async () => {
  // Simulate Best Buy's sitemap_index.xml: all nested sitemaps are .xml.gz, all are paginated.
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap_paginated_0.xml.gz</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap_p_0.xml.gz</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap_lts_0.xml.gz</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap_product_0.xml.gz</loc></sitemap>
    </sitemapindex>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapIndex },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
    // homepage for Cheerio fallback
    'https://example.com': {
      status: 200,
      body: `<html><body>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/pricing">Pricing</a>
      </body></html>`,
      contentType: 'text/html',
    },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);

    // None of the discovered links should be .xml.gz files.
    const xmlGzLinks = result.links.filter((l) => l.endsWith('.xml.gz'));
    assert.deepEqual(
      xmlGzLinks,
      [],
      `Expected no .xml.gz links but got: ${xmlGzLinks.join(', ')}`,
    );

    // Should have fallen back to Cheerio and found real pages.
    assert.ok(result.links.includes('https://example.com'), 'homepage should be included');
  } finally {
    restore();
  }
});

test('sitemap strategy allows non-paginated nested sitemaps', async () => {
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap_pages.xml</loc></sitemap>
    </sitemapindex>`;

  const pagesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/about</loc></url>
      <url><loc>https://example.com/contact</loc></url>
      <url><loc>https://example.com/pricing</loc></url>
    </urlset>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapIndex },
    'https://example.com/sitemap_pages.xml': { status: 200, body: pagesXml },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.ok(result.links.includes('https://example.com/about'), 'should include /about from nested sitemap');
    assert.ok(result.links.includes('https://example.com/contact'), 'should include /contact from nested sitemap');
    assert.ok(result.links.includes('https://example.com/pricing'), 'should include /pricing from nested sitemap');
  } finally {
    restore();
  }
});

test('sitemap strategy reads robots.txt for sitemap URLs', async () => {
  const robotsTxt = `User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/custom-sitemap.xml\n`;
  const customSitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/services</loc></url>
    </urlset>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 200, body: robotsTxt, contentType: 'text/plain' },
    'https://example.com/custom-sitemap.xml': { status: 200, body: customSitemap },
    'https://example.com/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.ok(result.links.includes('https://example.com/services'), 'should find /services via robots.txt sitemap');
    // Strategy may be 'sitemap' or 'sitemap+cheerio' depending on how many
    // links were found (< 5 triggers a Cheerio supplement pass).
    assert.ok(result.strategy?.startsWith('sitemap'), `expected sitemap-based strategy, got: ${result.strategy}`);
  } finally {
    restore();
  }
});

test('sitemap strategy reads gzip-compressed .xml.gz sitemaps', async () => {
  const pagesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/about</loc></url>
      <url><loc>https://example.com/services</loc></url>
    </urlset>`;

  // Gzip-compress the XML
  const compressedXml = await gzip(Buffer.from(pagesXml, 'utf8'));

  // Sitemap index pointing to a .xml.gz file that is NOT paginated
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap_nav.xml.gz</loc></sitemap>
    </sitemapindex>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapIndex },
    'https://example.com/sitemap_nav.xml.gz': { status: 200, body: compressedXml, contentType: 'application/x-gzip' },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.ok(result.links.includes('https://example.com/about'), 'should decompress and find /about');
    assert.ok(result.links.includes('https://example.com/services'), 'should decompress and find /services');
  } finally {
    restore();
  }
});

// ── scorePageUrl: pcmcat blocking ─────────────────────────────────────────────

test('scorePageUrl blocks Best Buy pcmcat category page URLs', () => {
  const origin = 'https://www.bestbuy.com';

  // Standard pcmcat pattern  (depth-4 category landing page)
  assert.equal(
    scorePageUrl('https://www.bestbuy.com/site/3d-printers/3d-printer-filament/pcmcat335400050008.c', origin),
    -1,
    'pcmcat ID segment must be hard-blocked',
  );

  // Another pcmcat variant with longer ID
  assert.equal(
    scorePageUrl('https://www.bestbuy.com/site/4k-ultra-hd-ecosystem/4k-ultra-hd-audio/pcmcat748301920615.c', origin),
    -1,
    'longer pcmcat ID must also be hard-blocked',
  );

  // pcmid variant
  assert.equal(
    scorePageUrl('https://www.bestbuy.com/site/category/pcmid123456789', origin),
    -1,
    'pcmid ID segment must be hard-blocked',
  );

  assert.equal(
    scorePageUrl('https://www.bestbuy.com/site/a-v-cables-connectors/coax-a-v-cables/abcat0107017.c', origin),
    -1,
    'abcat ID segment must be hard-blocked',
  );

  assert.equal(
    scorePageUrl('https://www.bestbuy.com/site/electronics/gift-cards/cat09000.c', origin),
    -1,
    'cat ID segment must be hard-blocked',
  );
});

test('scorePageUrl does not block normal pages that happen to start with "pcm"', () => {
  const origin = 'https://example.com';

  // Short pcm segment — "pcm" alone with no trailing digits is NOT a catalogue ID
  const score = scorePageUrl('https://example.com/pcm-audio-solutions', origin);
  assert.ok(score > 0, `expected positive score for /pcm-audio-solutions, got ${score}`);
});

// ── scorePageUrl: hex hash / UUID blocking ────────────────────────────────────

test('scorePageUrl blocks ChatGPT GPT pages with hex hash IDs', () => {
  const origin = 'https://chatgpt.com';

  // Standard ChatGPT GPT URL — segment contains a 32-char hex hash
  assert.equal(
    scorePageUrl('https://chatgpt.com/g/g-690d07f5098881919da2ff75e38fb89c-team-india-cricket-gpt', origin),
    -1,
    'GPT page with hex hash segment must be hard-blocked',
  );

  // Another GPT page variant
  assert.equal(
    scorePageUrl('https://chatgpt.com/g/g-690a5196c1708191b0f0d4569efa37d6-india-gpt', origin),
    -1,
    'GPT page with different hex hash must also be blocked',
  );
});

test('scorePageUrl blocks standard UUID path segments', () => {
  const origin = 'https://example.com';

  assert.equal(
    scorePageUrl('https://example.com/share/550e8400-e29b-41d4-a716-446655440000', origin),
    -1,
    'UUID path segment must be hard-blocked',
  );
});

test('scorePageUrl does not block normal short slugs that contain hex-valid letters', () => {
  const origin = 'https://example.com';

  // "cafe", "dead", "beef" are valid hex words but short — should NOT be blocked
  const score1 = scorePageUrl('https://example.com/cafe-and-food', origin);
  assert.ok(score1 > 0, `expected positive score for /cafe-and-food, got ${score1}`);

  // Legitimate slug with "face" and other hex letters — too short to trigger
  const score2 = scorePageUrl('https://example.com/about/face-recognition', origin);
  assert.ok(score2 > 0, `expected positive score for /about/face-recognition, got ${score2}`);
});

test('scorePageUrl blocks locale mirror URLs', () => {
  const origin = 'https://chatgpt.com';

  assert.equal(scorePageUrl('https://chatgpt.com/fr-FR', origin), -1);
  assert.equal(scorePageUrl('https://chatgpt.com/am-ET/images', origin), -1);
  assert.equal(scorePageUrl('https://chatgpt.com/zh-CN', origin), -1);
});

test('scorePageUrl blocks generated utility content pages', () => {
  const origin = 'https://chatgpt.com';

  assert.equal(scorePageUrl('https://chatgpt.com/translate/english-to-hindi', origin), -1);
  assert.equal(scorePageUrl('https://chatgpt.com/writing/paraphrase', origin), -1);
  assert.equal(scorePageUrl('https://chatgpt.com/images/i/3d-avatar', origin), -1);
});

// ── sitemap nav-primary supplement: no nav-primary in sitemap → Camoufox ─────

test('camoufox-first: scanner-rendered nav links are used before sitemap fallback', async () => {
  // Simulate chatgpt.com: sitemap has content/tool pages (score ~53) but no
  // nav-primary links (score ≥ 70).  Camoufox (mocked via scanner) returns the
  // real JS-rendered navigation with nav-primary URLs.
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/gpts</loc></url>
      <url><loc>https://example.com/images</loc></url>
      <url><loc>https://example.com/shopping</loc></url>
      <url><loc>https://example.com/writing</loc></url>
      <url><loc>https://example.com/research</loc></url>
    </urlset>`;

  // Mock fetch: sitemap returns content-only links; scanner service returns
  // nav-primary links that Camoufox would discover from the JS-rendered nav.
  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapXml },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
    // Scanner /extract-links endpoint (Camoufox) returns JS-rendered nav pages
    'http://localhost:8001/extract-links': {
      status: 200,
      body: JSON.stringify({
        success: true,
        links: [
          'https://example.com/features/voice',
          'https://example.com/pricing',
          'https://example.com/enterprise',
          'https://example.com/atlas',
        ],
        finalUrl: 'https://example.com',
      }),
      contentType: 'application/json',
    },
    // Cheerio homepage (only needed when Camoufox fails — not expected here)
    'https://example.com': {
      status: 200,
      body: '<html><body><a href="/apps">Apps</a></body></html>',
      contentType: 'text/html',
    },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.equal(result.strategy, 'camoufox+sitemap', `expected camoufox+sitemap, got: ${result.strategy}`);

    // Nav-primary pages discovered by Camoufox should appear.
    assert.ok(result.links.includes('https://example.com/features/voice'), 'should include /features/voice from Camoufox');
    assert.ok(result.links.includes('https://example.com/pricing'), 'should include /pricing from Camoufox');

  } finally {
    restore();
  }
});

test('sitemap+probe: when sitemap has no nav-primary and Camoufox unavailable, HEAD probing finds /pricing', async () => {
  // Sitemap: only depth-1 content pages (score 53, no nav-primary).
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/gpts</loc></url>
      <url><loc>https://example.com/images</loc></url>
      <url><loc>https://example.com/shopping</loc></url>
      <url><loc>https://example.com/writing</loc></url>
      <url><loc>https://example.com/research</loc></url>
    </urlset>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapXml },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
    // Scanner /extract-links NOT available (returns 503)
    'http://localhost:8001/extract-links': { status: 503, body: 'unavailable' },
    // Nav URL probes — /pricing and /enterprise respond; others 404
    'https://example.com/pricing':    { status: 200, body: '', contentType: 'text/html' },
    'https://example.com/enterprise': { status: 200, body: '', contentType: 'text/html' },
    'https://example.com/plans':      { status: 404, body: '' },
    'https://example.com/plan':       { status: 404, body: '' },
    'https://example.com/features':   { status: 404, body: '' },
    'https://example.com/business':   { status: 404, body: '' },
    'https://example.com/about':      { status: 404, body: '' },
    'https://example.com/about-us':   { status: 404, body: '' },
    'https://example.com/contact':    { status: 404, body: '' },
    'https://example.com/contact-us': { status: 404, body: '' },
    'https://example.com/solutions':  { status: 404, body: '' },
    'https://example.com/services':   { status: 404, body: '' },
    'https://example.com/help':       { status: 404, body: '' },
    'https://example.com/support':    { status: 404, body: '' },
    'https://example.com/faq':        { status: 404, body: '' },
    'https://example.com/careers':    { status: 404, body: '' },
    'https://example.com/jobs':       { status: 404, body: '' },
    'https://example.com/blog':       { status: 404, body: '' },
    'https://example.com/team':       { status: 404, body: '' },
    // Cheerio homepage (minimal content)
    'https://example.com': {
      status: 200,
      body: '<html><body><a href="/apps">Apps</a></body></html>',
      contentType: 'text/html',
    },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.equal(result.strategy, 'sitemap+probe', `expected sitemap+probe, got: ${result.strategy}`);

    // Nav-primary pages found via HEAD probing should appear.
    assert.ok(result.links.includes('https://example.com/pricing'), 'should include /pricing from probing');
    assert.ok(result.links.includes('https://example.com/enterprise'), 'should include /enterprise from probing');

    // Sitemap content pages should also be present.
    assert.ok(result.links.includes('https://example.com/gpts'), 'should include /gpts from sitemap');
  } finally {
    restore();
  }
});

// ── sitemap quality gate: catalogue-only sitemap falls back to Cheerio ────────

test('sitemap quality gate: when all sitemap links are pcmcat URLs, Cheerio is used instead', async () => {
  // Sitemap contains only Best Buy-style category pages (all will score -1 after pcmcat block).
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/site/appliances/pcmcat1234567.c</loc></url>
      <url><loc>https://example.com/site/tvs/pcmcat9876543.c</loc></url>
      <url><loc>https://example.com/site/laptops/pcmcat1111111.c</loc></url>
    </urlset>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapXml },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
    // Homepage has real navigation links that Cheerio should discover.
    'https://example.com': {
      status: 200,
      body: `<html><body>
        <nav>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/services">Services</a>
        </nav>
      </body></html>`,
      contentType: 'text/html',
    },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 10, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);

    // No pcmcat URLs should appear in results.
    const pcmcatLinks = result.links.filter((l) => l.includes('pcmcat'));
    assert.deepEqual(pcmcatLinks, [], `pcmcat links must not appear: ${pcmcatLinks.join(', ')}`);

    // Real navigation pages found via Cheerio fallback should be present.
    assert.ok(result.links.includes('https://example.com/about'), 'should include /about from Cheerio crawl');
    assert.ok(result.links.includes('https://example.com/contact'), 'should include /contact from Cheerio crawl');
  } finally {
    restore();
  }
});

test('sitemap over-samples raw URLs before filtering junk', async () => {
  const junkUrls = Array.from({ length: 120 }, (_value, index) => (
    `<url><loc>https://example.com/translate/english-to-test-${index}</loc></url>`
  )).join('\n');
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${junkUrls}
      <url><loc>https://example.com/pricing</loc></url>
      <url><loc>https://example.com/features/agent</loc></url>
      <url><loc>https://example.com/contact-sales</loc></url>
    </urlset>`;

  const restore = mockFetch({
    'https://example.com/robots.txt': { status: 404, body: '' },
    'https://example.com/sitemap.xml': { status: 200, body: sitemapXml },
    'https://example.com/sitemap_index.xml': { status: 404, body: '' },
    'https://example.com/sitemap/sitemap.xml': { status: 404, body: '' },
    'https://example.com/sitemaps/sitemap.xml': { status: 404, body: '' },
  });

  try {
    const result = await extractInternalLinks('https://example.com', { maxLinks: 25, maxDepth: 1, delayMs: 0, timeout: 5000 });

    assert.equal(result.success, true);
    assert.ok(result.links.includes('https://example.com/pricing'), 'should include good URL after early junk URLs');
    assert.ok(result.links.includes('https://example.com/features/agent'), 'should include feature URL after early junk URLs');
    assert.equal(result.links.some((link) => link.includes('/translate/')), false, 'translate junk should be filtered');
  } finally {
    restore();
  }
});
