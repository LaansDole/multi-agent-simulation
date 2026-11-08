import type { LLMConfig, LLMMessage, LLMProvider, LLMResponse, LLMToolDefinition } from '../types.ts';
import { fetchOrThrow } from './networkError.ts';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

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

/** Calls an OpenAI-compatible /chat/completions endpoint (OpenAI itself, or any local/compatible server). */
export class OpenAIProvider implements LLMProvider {
  constructor(private config: LLMConfig) {}

  async generateCompletion(
    messages: LLMMessage[],
    _tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName?: string
  ): Promise<LLMResponse> {
    const baseUrl = (this.config.baseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
    const body = {
      model: modelName || this.config.model,
      messages: [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetchOrThrow(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || ''}`,
      },
      body: JSON.stringify(body),
    });

    const raw: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const choices = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).error : undefined;
      const message = readString(choices, 'message') || response.statusText;
      throw new Error(`OpenAI-compatible request failed (${response.status}): ${message}`);
    }

    const choicesArr = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).choices : undefined;
    const firstChoice = Array.isArray(choicesArr) ? choicesArr[0] : undefined;
    const messageObj = firstChoice && typeof firstChoice === 'object' ? (firstChoice as Record<string, unknown>).message : undefined;
    const content = readString(messageObj, 'content') ?? null;
    const usageObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).usage : undefined;

    return {
      content,
      usage: usageObj
        ? {
            promptTokens: readNumber(usageObj, 'prompt_tokens') || 0,
            completionTokens: readNumber(usageObj, 'completion_tokens') || 0,
            totalTokens: readNumber(usageObj, 'total_tokens') || 0,
          }
        : undefined,
      raw,
    };
  }
}
