// Text defaults to provider `openai` (OpenAI or any OpenAI-compatible base URL); the backend's
// GET /api/models `default` overrides it at runtime (coreStore.defaultTextModel). Image, music
// and video are Gemini-only features (Imagen, Lyria, Veo).
export const DEFAULT_MODELS = {
  text: 'gpt-5-mini',
  image: 'gemini-3.1-flash-image-preview',
  music: 'lyria-3-clip-preview',
  video: 'veo-3.1-lite-generate-preview'
} as const;

/** Text model picked when an agent is switched to the Gemini provider. */
export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';

export const AVAILABLE_MODELS = {
  text: [
    DEFAULT_MODELS.text,
    GEMINI_TEXT_MODEL,
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview',
    'llama3.3',
    'llama3.1',
    'gemma2',
    'qwen2.5',
    'mistral',
    'deepseek-r1',
    'custom-local'
  ],
  image: [
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image'
  ],
  music: [
    'lyria-3-clip-preview',
    'lyria-3-pro-preview'
  ],
  video: [
    'veo-3.1-lite-generate-preview',
    'veo-3.1-fast-generate-preview',
    'veo-3.1-generate-preview'
  ]
} as const;

export type ModelType = keyof typeof AVAILABLE_MODELS;

/** Provider of a model id that has no explicit provider: Google model families are Gemini, anything else OpenAI-compatible. */
export const inferProvider = (model?: string): 'openai' | 'gemini' =>
  model && /^(gemini|imagen|lyria|veo)/i.test(model) ? 'gemini' : 'openai';
