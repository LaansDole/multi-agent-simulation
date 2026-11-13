import type { LLMConfig, LLMMessage, LLMProvider, LLMResponse, LLMToolDefinition } from '../types.ts';
import { fetchOrThrow } from './networkError.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function readNumber(obj: unknown, key: string): number | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

function readArray(obj: unknown, key: string): unknown[] | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : undefined;
  }
  return undefined;
}

/** Calls the Gemini generateContent REST endpoint directly from the browser (BYOK). */
export class GeminiProvider implements LLMProvider {
  constructor(private config: LLMConfig) {}

  async generateCompletion(
    messages: LLMMessage[],
    _tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName?: string
  ): Promise<LLMResponse> {
    const model = modelName || this.config.model;
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetchOrThrow(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.config.apiKey || '')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const raw: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = readString(raw && typeof raw === 'object' ? (raw as Record<string, unknown>).error : undefined, 'message') || response.statusText;
      throw new Error(`Gemini request failed (${response.status}): ${message}`);
    }

    const candidates = readArray(raw, 'candidates');
    const firstCandidate = candidates?.[0];
    const candidateContent = firstCandidate && typeof firstCandidate === 'object' ? (firstCandidate as Record<string, unknown>).content : undefined;
    const parts = readArray(candidateContent, 'parts');
    const content = parts?.map((p) => readString(p, 'text') || '').join('') || null;

    const usageMeta = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).usageMetadata : undefined;

    return {
      content,
      usage: usageMeta
        ? {
            promptTokens: readNumber(usageMeta, 'promptTokenCount') || 0,
            completionTokens: readNumber(usageMeta, 'candidatesTokenCount') || 0,
            totalTokens: readNumber(usageMeta, 'totalTokenCount') || 0,
          }
        : undefined,
      raw,
    };
  }
}
