import test from 'node:test';
import assert from 'node:assert/strict';

import { extractSitemapLocs, scorePageUrl } from '../src/features/audits/internal-links.ts';

test('extractSitemapLocs reads page and nested sitemap URLs from XML loc tags', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
      <loc>https://example.com/sitemap-pages.xml</loc>
    </sitemap>
    <sitemap>
      <loc> https://example.com/pricing </loc>
    </sitemap>
  </sitemapindex>`;

  assert.deepEqual(extractSitemapLocs(xml), [
    'https://example.com/sitemap-pages.xml',
    'https://example.com/pricing',
  ]);
});

test('scorePageUrl hard-blocks Shopify Web Pixels Manager fragments and UUID stubs', () => {
  const baseOrigin = 'https://example.com';
  const blockedPaths = [
    'https://example.com/previewImage',
    'https://example.com/cdn/shop/t/1/assets/widget.js',
    'https://example.com/wpm/123',
    'https://example.com/next',
    'https://example.com/open',
    'https://example.com/close',
    'https://example.com/b2d05acc-8c4a-4e62-9f2f-1234567890ab',
    'https://example.com/products/abcde12345abcde12345ab',
  ];

  for (const url of blockedPaths) {
    assert.equal(scorePageUrl(url, baseOrigin), -1, `expected ${url} to score -1`);
  }
});

test('scorePageUrl does not over-block similar-looking real pages', () => {
  const baseOrigin = 'https://example.com';
  const allowedPaths = [
    'https://example.com/next-steps',
    'https://example.com/open-source',
    'https://example.com/closing-remarks',
    'https://example.com/about',
  ];

  for (const url of allowedPaths) {
    assert.ok(scorePageUrl(url, baseOrigin) > 0, `expected ${url} to keep a positive score`);
  }
});
