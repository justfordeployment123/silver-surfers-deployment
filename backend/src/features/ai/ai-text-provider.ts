import { env } from '../../config/env.ts';

export type AiProvider = 'openai' | 'anthropic';

interface AiTextRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}

interface ProviderRuntime {
  openAiApiKey?: string;
  anthropicApiKey?: string;
  fetchImpl?: typeof fetch;
}

export async function requestAiTextWithFallback(
  request: AiTextRequest,
  runtime: ProviderRuntime = {},
): Promise<{ text: string; provider: AiProvider; model: string }> {
  const openAiApiKey = runtime.openAiApiKey ?? env.openAiApiKey;
  const anthropicApiKey = runtime.anthropicApiKey ?? env.anthropicApiKey;
  const fetchImpl = runtime.fetchImpl || fetch;
  const failures: string[] = [];

  if (openAiApiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.openAiTimeoutMs);
    try {
      const response = await fetchImpl(`${env.openAiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
        body: JSON.stringify({
          model: env.openAiModel,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${await response.text().catch(() => response.statusText)}`);
      const payload = await response.json() as any;
      const text = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('OpenAI returned an empty response.');
      return { text, provider: 'openai', model: env.openAiModel };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (anthropicApiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.anthropicTimeoutMs);
    try {
      const response = await fetchImpl(`${env.anthropicBaseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': env.anthropicVersion },
        body: JSON.stringify({
          model: env.anthropicModel,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.3,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Anthropic API error (${response.status}): ${await response.text().catch(() => response.statusText)}`);
      const payload = await response.json() as any;
      const text = Array.isArray(payload?.content)
        ? payload.content.filter((item: any) => item?.type === 'text').map((item: any) => item.text).join('\n').trim()
        : '';
      if (!text) throw new Error('Anthropic returned an empty response.');
      return { text, provider: 'anthropic', model: env.anthropicModel };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!openAiApiKey && !anthropicApiKey) throw new Error('No AI provider API key is configured.');
  throw new Error(`All configured AI providers failed. ${failures.join(' | ')}`);
}
