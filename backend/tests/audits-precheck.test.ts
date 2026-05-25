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
    accessible: true,
    finalUrl: 'https://example.com',
    status: 200,
    redirected: false,
    finalState: 'PASS',
    checkStatus: 'HEALTHY',
    health: 'OK',
    reason: 'Website responded successfully.',
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
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.finalState, 'PASS');
    assert.equal(result.checkStatus, 'HEALTHY');
  }
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
  assert.equal((result as { checkStatus: string }).checkStatus, 'SERVER_ERROR');
});

test('precheckCandidateUrl falls back to TCP reachability when HTTP check fails', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl, {
    tcpProbe: async () => true,
  });

  assert.deepEqual(result, {
    ok: true,
    accessible: false,
    finalUrl: 'https://example.com',
    redirected: false,
    finalState: 'PARTIAL',
    checkStatus: 'TCP_REACHABLE',
    health: 'HTTP_ERROR',
    reason: 'Host accepted TCP connection, but no usable HTTP response was received.',
  });
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls.length, 1);
});

test('precheckCandidateUrl returns failure when both HTTP and TCP checks fail', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    throw new Error('unexpected call');
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl, {
    tcpProbe: async () => false,
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'NOT_REACHABLE');
});

test('precheckCandidateUrl accepts common bot-protection statuses as reachable', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('', { status: 403 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.status, 403);
    assert.equal(result.finalUrl, 'https://example.com');
    assert.equal(result.finalState, 'PROTECTED');
    assert.equal(result.checkStatus, 'PROTECTED');
    assert.equal(result.health, 'PROTECTED');
  }
});

test('precheckCandidateUrl rejects 404 pages as not auditable', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('', { status: 404 });
  };

  const result = await precheckCandidateUrl('https://example.com/missing', fetchImpl, {
    tcpProbe: async () => true,
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'NOT_FOUND');
});

test('precheckCandidateUrl allows 503 only when bot-protection signals are present', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('Access denied by Akamai', { status: 503 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.status, 503);
    assert.equal(result.finalState, 'PROTECTED');
    assert.equal(result.checkStatus, 'PROTECTED');
  }
});

test('precheckCandidateUrl marks SSL failures with TCP reachability as partial', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
  };

  const result = await precheckCandidateUrl('https://expired.badssl.com', fetchImpl, {
    tcpProbe: async () => true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, false);
    assert.equal(result.finalState, 'PARTIAL');
    assert.equal(result.checkStatus, 'SSL_ERROR');
    assert.equal(result.health, 'SSL_ERROR');
  }
});

test('precheckCandidateUrl rejects redirects to a different domain', async () => {
  const fetchImpl: typeof fetch = async () => {
    const response = new Response('', {
      status: 403,
      headers: { server: 'cloudflare' },
    });
    Object.defineProperty(response, 'url', { value: 'https://parked.example/cart' });
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };

  const result = await precheckCandidateUrl('http://bestbuy.com.com', fetchImpl);

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'REDIRECTED_DOMAIN_MISMATCH');
});

test('precheckCandidateUrl does not let TCP fallback rescue a domain-mismatch redirect', async () => {
  const fetchImpl: typeof fetch = async () => {
    const response = new Response('', { status: 403 });
    Object.defineProperty(response, 'url', { value: 'https://parked.example/cart' });
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };

  let tcpCalled = false;
  const result = await precheckCandidateUrl('http://bestbuy.com.com', fetchImpl, {
    tcpProbe: async () => {
      tcpCalled = true;
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'REDIRECTED_DOMAIN_MISMATCH');
  assert.equal(tcpCalled, false);
});
