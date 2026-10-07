// Shared by assessment-agent.service.ts (Module 10) and assessment-report.ts
// (Module 12) — both need the exact same defensive response-text/JSON
// extraction that features/audits/ai-reporting.ts defines privately for
// itself. Factored out here (rather than duplicated twice, or imported
// across feature folders from audits/) since these two assessment files are
// the only other Anthropic callers in the codebase and live in the same
// feature folder together.

export function extractResponseText(payload: any): string {
  const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
  for (const part of contentBlocks) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      return part.text;
    }
  }

  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === 'string' && part.text.trim()) {
          return part.text;
        }
      }
    }
  }
  return '';
}

export function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
