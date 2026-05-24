import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.ts';
import { buildCandidateUrls, precheckCandidateUrl } from '../src/features/audits/precheck.service.ts';

// ── buildCandidateUrls ────────────────────────────────────────────────────────

test('buildCandidateUrls adds www and non-www variants for bare apex domain', () => {
  assert.deepEqual(buildCandidateUrls('example.com'), {
    input: 'example.com',
    candidateUrls: [
      'https://www.example.com',
      'https://example.com',
      'http://www.example.com',
      'http://example.com',
    ],
  });
});

test('buildCandidateUrls treats www-prefixed input the same as bare domain', () => {
  assert.deepEqual(buildCandidateUrls('www.example.com'), {
    input: 'www.example.com',
    candidateUrls: [
      'https://www.example.com',
      'https://example.com',
      'http://www.example.com',
      'http://example.com',
    ],
  });
});

test('buildCandidateUrls adds www variants for explicit-protocol apex domain', () => {
  assert.deepEqual(buildCandidateUrls('https://example.com'), {
    input: 'https://example.com',
    candidateUrls: ['https://www.example.com', 'https://example.com'],
  });
});

test('buildCandidateUrls does not add www variants for subdomains', () => {
  assert.deepEqual(buildCandidateUrls('blog.example.com'), {
    input: 'blog.example.com',
    candidateUrls: ['https://blog.example.com', 'http://blog.example.com'],
  });
});

test('buildCandidateUrls preserves an explicit protocol with path', () => {
  assert.deepEqual(buildCandidateUrls('https://example.com/path'), {
    input: 'https://example.com/path',
    candidateUrls: ['https://example.com/path'],
  });
});

test('buildCandidateUrls does not add www variants when URL has a path', () => {
  assert.deepEqual(buildCandidateUrls('example.com/page'), {
    input: 'example.com/page',
    candidateUrls: ['https://example.com/page', 'http://example.com/page'],
  });
});

test('buildCandidateUrls returns empty candidates for empty input', () => {
  assert.deepEqual(buildCandidateUrls(''), {
    input: '',
    candidateUrls: [],
  });
});

// ── precheckCandidateUrl ──────────────────────────────────────────────────────

test('precheckCandidateUrl resolves via direct HTTP HEAD check', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', { status: 200 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.deepEqual(result, {
    ok: true,
    finalUrl: 'https://example.com',
    status: 200,
    redirected: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.com');
  assert.equal(calls[0].method, 'HEAD');
});

test('precheckCandidateUrl falls back to GET when HEAD returns 405', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', {
      status: init?.method === 'HEAD' ? 405 : 200,
    });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls[1].method, 'GET');
});

test('precheckCandidateUrl classifies 502 Bad Gateway as a failure', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    // HEAD → 502 triggers GET retry; GET also 502
    return new Response('', { status: init?.method === 'POST' ? 503 : 502 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, false);
  assert.ok((result as { error: string }).error.includes('502'));
});

test('precheckCandidateUrl falls back to scanner-service when HTTP check fails', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });

    // All direct HTTP attempts throw a network error
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    }

    // Scanner POST succeeds
    return new Response(JSON.stringify({
      success: true,
      finalUrl: 'https://example.com/',
      status: 200,
      redirected: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.deepEqual(result, {
    ok: true,
    finalUrl: 'https://example.com/',
    status: 200,
    redirected: false,
  });
  assert.equal(calls[0].method, 'HEAD');
  assert.match(calls[calls.length - 1].url, /\/precheck$/);
  assert.equal(calls[calls.length - 1].method, 'POST');
});

test('precheckCandidateUrl returns failure when both HTTP and scanner fail', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    return new Response(JSON.stringify({ success: false, error: 'scanner unavailable' }), {
      status: 503,
    });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, false);
});

test('precheckCandidateUrl uses scanner finalUrl when scanner succeeds', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw new Error('connection refused');
    }
    return new Response(JSON.stringify({
      success: true,
      finalUrl: 'https://www.example.com/',
      status: 200,
      redirected: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.finalUrl, 'https://www.example.com/');
    assert.equal(result.redirected, true);
  }
});
