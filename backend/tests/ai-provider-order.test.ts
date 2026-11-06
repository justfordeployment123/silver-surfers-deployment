import assert from 'node:assert/strict';
import test from 'node:test';

import { requestAiTextWithFallback } from '../src/features/ai/ai-text-provider.ts';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, statusText: ok ? 'OK' : 'Error',
  json: async () => body,
  text: async () => JSON.stringify(body),
}) as Response;

test('uses OpenAI first when both providers are configured', async () => {
  const calls: string[] = [];
  const result = await requestAiTextWithFallback({ systemPrompt: 'system', userPrompt: 'user', maxTokens: 100 }, {
    openAiApiKey: 'openai-key', anthropicApiKey: 'anthropic-key',
    fetchImpl: async (url) => { calls.push(String(url)); return jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }); },
  });
  assert.equal(result.provider, 'openai');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /openai/i);
});

test('falls back to Anthropic when OpenAI fails', async () => {
  const calls: string[] = [];
  const result = await requestAiTextWithFallback({ systemPrompt: 'system', userPrompt: 'user', maxTokens: 100 }, {
    openAiApiKey: 'openai-key', anthropicApiKey: 'anthropic-key',
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('openai')) return jsonResponse({ error: 'failed' }, false, 500);
      return jsonResponse({ content: [{ type: 'text', text: '{"ok":true}' }] });
    },
  });
  assert.equal(result.provider, 'anthropic');
  assert.equal(calls.length, 2);
});

test('fails clearly when no AI provider is configured', async () => {
  await assert.rejects(
    requestAiTextWithFallback({ systemPrompt: 'system', userPrompt: 'user', maxTokens: 100 }, { openAiApiKey: '', anthropicApiKey: '' }),
    /No AI provider API key/i,
  );
});
