import { Send, Sparkles, X } from 'lucide-react';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgenticSystem, MAX_AGENTS } from '../../data/agents';
import { AVAILABLE_MODELS, GEMINI_TEXT_MODEL } from '../../core/llm/constants';
import type { LLMMessage, LLMProvider } from '../../core/llm/types';
import { OpenAIProvider } from '../../core/llm/providers/openaiProvider';
import { GeminiProvider } from '../../core/llm/providers/geminiProvider';
import { runGenerationTurn } from '../../core/llm/workflowGenerator';
import { useCoreStore } from '../../integration/store/coreStore';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../../theme/brand';
import { Avatar } from '../components/Avatar';
import { useEscapeToClose } from '../components/useEscapeToClose';
import { TeamFlowViewport } from '../components/TeamFlowViewport';

const STORAGE_KEY = 'generator-llm-config';
const INPUT_MAX_HEIGHT_PX = 6 * 20 + 26;

/** Keys are stored per provider so a key is only ever sent to the endpoint it was entered for. */
interface StoredCredentials {
  provider: 'openai' | 'gemini';
  model: string;
  openai: { baseUrl: string; apiKey: string };
  gemini: { apiKey: string };
}

interface ChatBubble {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

/**
 * Reads saved credentials field by field, so a missing, `null`, or older-shaped entry falls back instead of crashing render.
 * The old flat `{ apiKey, baseUrl }` shape is ignored: its key may belong to either provider.
 */
function loadCredentials(defaultModel: string): StoredCredentials {
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    // corrupt entry: use defaults
  }
  const obj = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const str = (o: unknown, key: string): string => {
    const v = o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
    return typeof v === 'string' ? v : '';
  };
  return {
    provider: obj.provider === 'gemini' ? 'gemini' : 'openai',
    model: str(obj, 'model') || defaultModel,
    openai: { baseUrl: str(obj.openai, 'baseUrl'), apiKey: str(obj.openai, 'apiKey') },
    gemini: { apiKey: str(obj.gemini, 'apiKey') },
  };
}

interface GenerateFromTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (system: AgenticSystem) => void;
}

export const GenerateFromTextModal: React.FC<GenerateFromTextModalProps> = ({ isOpen, onClose, onCreated }) => {
  useEscapeToClose(onClose, isOpen);
  const defaultTextModel = useCoreStore((s) => s.defaultTextModel);
  const openaiModels = useCoreStore((s) => s.openaiModels);
  const modelListId = useId();

  const [creds, setCreds] = useState<StoredCredentials>(() => loadCredentials(defaultTextModel));
  const [carryCredentials, setCarryCredentials] = useState(true);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [system, setSystem] = useState<AgenticSystem | null>(null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  // Bumped on every open/close; a turn that resolves after its session ended must not write into the next one.
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  }, [creds, isOpen]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isGenerating]);

  // Fresh session each time the modal opens.
  useEffect(() => {
    sessionRef.current++;
    if (isOpen) {
      setMessages([]);
      setSystem(null);
      setInput('');
      setIsGenerating(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const { baseUrl } = creds.openai;
  const apiKey = creds.provider === 'gemini' ? creds.gemini.apiKey : creds.openai.apiKey;
  // OpenAI-compatible local servers often take no key; Gemini always needs one.
  const canGenerate =
    creds.model.trim().length > 0 && (creds.provider === 'openai' || apiKey.trim().length > 0) && !isGenerating;

  const handleGenerate = async () => {
    const instruction = input.trim();
    if (!instruction || !canGenerate) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: instruction }]);
    setIsGenerating(true);
    const session = sessionRef.current;

    try {
      const provider: LLMProvider =
        creds.provider === 'gemini'
          ? new GeminiProvider({ apiKey, model: creds.model })
          : new OpenAIProvider({ apiKey, baseUrl, model: creds.model });

      const history: LLMMessage[] = messages
        .filter((m): m is ChatBubble & { role: 'user' | 'assistant' } => m.role !== 'error')
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await runGenerationTurn(provider, creds.model, history, system, instruction, MAX_AGENTS, defaultTextModel);
      if (session !== sessionRef.current) return;
      setSystem(result.system);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.assistantText }]);
    } catch (e) {
      if (session !== sessionRef.current) return;
      const message = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [...prev, { role: 'error', content: message }]);
    } finally {
      if (session === sessionRef.current) setIsGenerating(false);
    }
  };

  const handleDone = () => {
    if (!system) return;
    const finalSystem: AgenticSystem = carryCredentials
      ? {
          ...system,
          leadAgent: {
            ...system.leadAgent,
            provider: creds.provider,
            model: creds.model,
            ...(creds.provider === 'openai' ? { baseUrl: baseUrl || undefined } : {}),
            apiKey: apiKey || undefined,
          },
        }
      : system;
    onCreated(finalSystem);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full h-full max-w-5xl max-h-[88vh] bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-200/50 flex flex-col"
      >
        {/* Header */}
        <div className="border-b border-zinc-100 px-6 py-4 flex items-start justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: USER_COLOR_LIGHT, color: USER_COLOR }}>
              <Sparkles size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h3 id={titleId} className="text-sm font-black text-darkDelegation uppercase tracking-widest">Generate Team from Text</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">Describe the team you want; refine it over a few turns, then use it.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Credentials */}
        <div className="px-6 py-3 border-b border-zinc-50 bg-zinc-50/60 flex flex-wrap items-end gap-2 shrink-0">
          <div className="space-y-1">
            <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Provider</label>
            <select
              value={creds.provider}
              onChange={(e) => {
                const provider = e.target.value as 'openai' | 'gemini';
                setCreds((c) => ({ ...c, provider, model: provider === 'gemini' ? GEMINI_TEXT_MODEL : defaultTextModel }));
              }}
              className="bg-white border border-zinc-200 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer lowercase"
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Model</label>
            {creds.provider === 'openai' ? (
              <>
                <input
                  type="text"
                  value={creds.model}
                  list={modelListId}
                  onChange={(e) => setCreds((c) => ({ ...c, model: e.target.value }))}
                  placeholder="Model name"
                  className="w-40 bg-white border border-zinc-200 text-[11px] font-medium rounded-xl px-2.5 py-1.5 outline-none"
                />
                <datalist id={modelListId}>
                  {openaiModels.map((m) => <option key={m} value={m} />)}
                </datalist>
              </>
            ) : (
              <select
                value={creds.model}
                onChange={(e) => setCreds((c) => ({ ...c, model: e.target.value }))}
                className="bg-white border border-zinc-200 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer lowercase"
              >
                {AVAILABLE_MODELS.text.filter((m) => m.startsWith('gemini')).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
          </div>
          {creds.provider === 'openai' && (
            <div className="space-y-1">
              <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setCreds((c) => ({ ...c, openai: { ...c.openai, baseUrl: e.target.value } }))}
                placeholder="https://api.openai.com/v1"
                className="w-48 bg-white border border-zinc-200 text-[10px] font-medium rounded-xl px-2.5 py-1.5 outline-none"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                const value = e.target.value;
                setCreds((c) =>
                  c.provider === 'gemini' ? { ...c, gemini: { apiKey: value } } : { ...c, openai: { ...c.openai, apiKey: value } }
                );
              }}
              placeholder={creds.provider === 'gemini' ? 'Required' : 'Optional for local servers'}
              className="w-40 bg-white border border-zinc-200 text-[10px] font-medium rounded-xl px-2.5 py-1.5 outline-none"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 ml-auto mb-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={carryCredentials}
              onChange={(e) => setCarryCredentials(e.target.checked)}
              className="rounded"
            />
            Carry these credentials to the lead agent
          </label>
        </div>

        {/* Body: chat thread + live preview */}
        <div className="flex-1 min-h-0 flex">
          <div className="w-[26rem] shrink-0 border-r border-zinc-100 flex flex-col min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <p className="text-[11px] text-zinc-400 italic px-2">
                  e.g. "A research team with a lead, a researcher who gathers sources, and a writer who drafts the report."
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-[95%]`}>
                    {msg.role !== 'error' && (
                      <div className="shrink-0 mt-0.5">
                        <Avatar type={msg.role === 'assistant' ? 'lead' : 'user'} color={msg.role === 'assistant' ? USER_COLOR : USER_COLOR} size={24} />
                      </div>
                    )}
                    <div
                      className={`px-3.5 py-2 rounded-[16px] text-[13px] leading-relaxed border ${msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'} ${msg.role === 'error' ? 'bg-red-50 border-red-100 text-red-600 w-full' : ''}`}
                      style={
                        msg.role === 'user'
                          ? { backgroundColor: USER_COLOR_LIGHT, borderColor: USER_COLOR_SOFT, color: '#27272a' }
                          : msg.role === 'assistant'
                            ? { backgroundColor: '#fafafa', borderColor: '#f4f4f5', color: '#27272a' }
                            : undefined
                      }
                    >
                      {msg.role === 'assistant' ? (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isGenerating && (
                <div className="flex items-center gap-2.5 px-2">
                  <Avatar type="lead" color={USER_COLOR} size={24} />
                  <span className="text-[11px] text-zinc-400 italic">Thinking...</span>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-zinc-50 shrink-0">
              <div className="relative flex items-center gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={system ? 'Describe a change...' : 'Describe the team you want...'}
                  className="flex-1 bg-white border border-zinc-200 rounded-2xl px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 transition-all resize-none"
                  style={{
                    borderColor: input.trim() ? USER_COLOR : undefined,
                    boxShadow: input.trim() ? `0 0 0 2px ${USER_COLOR_LIGHT}` : undefined,
                  }}
                />
                <button
                  onClick={handleGenerate}
                  aria-label="Send"
                  disabled={!input.trim() || !canGenerate}
                  style={{ backgroundColor: !input.trim() || !canGenerate ? undefined : USER_COLOR }}
                  className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${!input.trim() || !canGenerate ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' : 'text-white shadow-lg hover:brightness-90'}`}
                >
                  <Send size={15} strokeWidth={3} />
                </button>
              </div>
              {creds.provider === 'gemini' && !apiKey.trim() && (
                <p className="text-[9px] text-zinc-400 mt-1.5 ml-1">Enter a Gemini API key above to start.</p>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 bg-zinc-50/50">
            {system ? (
              <TeamFlowViewport system={system} />
            ) : (
              <div className="h-full flex items-center justify-center text-center p-8">
                <p className="text-[11px] text-zinc-400 uppercase font-bold tracking-widest">
                  The team preview appears here once generated.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-100 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:bg-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={!system}
            style={{ backgroundColor: system ? USER_COLOR : undefined }}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${system ? 'text-white shadow-lg hover:brightness-90' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}
          >
            Use this Team
          </button>
        </div>
      </div>
    </div>
  );
};
