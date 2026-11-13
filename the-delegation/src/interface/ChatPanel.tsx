import { ChevronDown, ChevronRight, Send } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAgentSet, getAllAgents } from '../data/agents';
import { USER_COLOR, USER_COLOR_LIGHT, USER_COLOR_SOFT } from '../theme/brand';
import { useCoreStore } from '../integration/store/coreStore';
import { DYNACLINIC_WORKFLOW, mockScenariosLabel, useMockScenarios } from '../integration/hooks/useMockScenarios';
import { useTeamStore, useActiveTeam } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { useSceneManager } from '../simulation/SceneContext';
import { Avatar } from './components/Avatar';
import { AuditModal } from './AuditModal';
import { FileSearch } from 'lucide-react';

// The chat input grows with its text up to about 12 lines (text-sm: 20px per line, plus padding), then scrolls.
const INPUT_MAX_HEIGHT_PX = 12 * 20 + 26;

const smallButtonClass = 'px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all active:scale-95 cursor-pointer';
const secondaryButtonClass = `${smallButtonClass} border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50`;

// Lead chat only: the imported workflow's graph.demo_scenarios plus a plain-text file import.
// Every action fills the chat input; nothing is sent.
const MockScenariosSection: React.FC<{ onInsert: (text: string) => void; hasSentMessage: boolean }> = ({ onInsert, hasSentMessage }) => {
  const { file, loading, failed, scenarios, retry } = useMockScenarios();
  const { mockScenariosOpen, setMockScenariosOpen } = useUiStore();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!file) return null;
  const open = mockScenariosOpen ?? !hasSentMessage;
  const isDynaClinic = file === DYNACLINIC_WORKFLOW;

  return (
    <div className="mb-2 min-h-0 flex flex-col rounded-2xl border border-zinc-100 bg-zinc-50/60">
      <button
        onClick={() => setMockScenariosOpen(!open)}
        className="w-full shrink-0 flex items-center gap-1.5 px-3 py-2 text-left cursor-pointer"
      >
        {open ? <ChevronDown size={12} strokeWidth={3} /> : <ChevronRight size={12} strokeWidth={3} />}
        <span className="text-[10px] font-black text-darkDelegation uppercase tracking-widest">Mock scenarios</span>
        {scenarios.length > 0 && <span className="text-[10px] font-bold text-zinc-400">{scenarios.length}</span>}
      </button>
      {open && (
        <div className="min-h-0 max-h-[38vh] overflow-y-auto px-3 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[11px] text-zinc-500">{mockScenariosLabel(file)}</p>
            <button onClick={() => fileInputRef.current?.click()} className={secondaryButtonClass}>
              Import plain text
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = ''; // picking the same file again fires onChange again
                picked?.text().then(onInsert);
              }}
            />
          </div>
          {isDynaClinic && (
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Or paste any clinical scenario as plain text, with optional Age/Sex/History/Medications/Allergies/Labs/Imaging lines. Add Question: and options A.-E. for a multiple-choice case.
            </p>
          )}
          {loading && <p className="text-[11px] text-zinc-500">Loading mock scenarios...</p>}
          {failed && (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[11px] text-red-500 leading-snug">
                Could not load mock scenarios from the backend (restart it on the current code).
              </p>
              <button onClick={retry} className={secondaryButtonClass}>Retry</button>
            </div>
          )}
          {!loading && !failed && scenarios.length === 0 && (
            <p className="text-[11px] text-zinc-500">This workflow defines no mock scenarios.</p>
          )}
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="rounded-xl border border-zinc-100 bg-white p-3 space-y-2">
              <p className="text-xs font-bold text-zinc-700 leading-snug">{scenario.title}</p>
              {scenario.teaches && <p className="text-[11px] text-zinc-500 leading-relaxed">{scenario.teaches}</p>}
              <div className="flex gap-2">
                <button onClick={() => onInsert(scenario.text)} className={`${smallButtonClass} bg-darkDelegation hover:bg-black text-white`}>
                  Insert
                </button>
                <button onClick={() => setPreviewId(previewId === scenario.id ? null : scenario.id)} className={secondaryButtonClass}>
                  {previewId === scenario.id ? 'Hide preview' : 'Preview'}
                </button>
              </div>
              {previewId === scenario.id && (
                <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-lg p-2">
                  {scenario.text}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChatPanel: React.FC = () => {
  const {
    isChatting,
    isThinking,
    selectedNpcIndex,
    setIsTyping,
    setActiveAuditTaskId,
    chatDraft,
    setChatDraft
  } = useUiStore();
  const scene = useSceneManager();
  const activeTeam = useActiveTeam();
  const agents = getAllAgents(activeTeam);
  const selectedAgentSetId = activeTeam.id;
  const isLead = selectedNpcIndex === activeTeam.leadAgent.index;

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const agent = selectedNpcIndex !== null ? agents.find(a => a.index === selectedNpcIndex) ?? null : null;

  // Combine store messages with project histories if needed,
  // but unified useCoreStore is the source of truth for history.
  const coreStore = useCoreStore();
  const chatMessages = selectedNpcIndex !== null
    ? (coreStore.agentHistories[selectedNpcIndex] || [])
    : [];


  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    };
  }, []);

  // Text handed over by "Use this case" in the Getting Started card; filled in, not sent.
  useEffect(() => {
    if (chatDraft === null) return;
    setInput(chatDraft);
    setChatDraft(null);
  }, [chatDraft, setChatDraft]);

  // Grow the input with its text (an inserted case stays readable before sending), then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
    el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, [input, isChatting]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isThinking, isChatting]);

  useEffect(() => {
    // Initial scroll when chat opens
    if (isChatting && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [isChatting]);

  const simulateTyping = (text: string) => {
    let currentIndex = 0;
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);

    setIsTyping(true);

    typingIntervalRef.current = setInterval(() => {
      if (currentIndex < text.length) {
        const char = text[currentIndex];
        setInput((prev) => prev + char);
        currentIndex++;
      } else {
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
        setIsTyping(false);
      }
    }, 20); // 20ms per character for a natural feel
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // simulateTyping(pastedText);
    setInput(pastedText);
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    setIsTyping(false);

    const text = input;
    setInput('');
    await scene?.sendMessage(text);
  };

  if (!isChatting || !agent) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden shrink-0 pointer-events-auto">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-1 space-y-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:display-none"
      >
        {chatMessages.filter(msg => !msg.metadata?.internal).map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-[90%]`}>
              {/* Avatar / Icon */}
              <div className="shrink-0 mt-1">
                {msg.role === 'assistant' ? (
                  <Avatar type={agent?.index === activeTeam.leadAgent.index ? 'lead' : 'sub'} color={agent?.color} size={32} />
                ) : (
                  <Avatar type="user" color={USER_COLOR} size={32} />
                )}
              </div>

              <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-4 py-2.5 rounded-[20px] text-[14px] leading-relaxed shadow-sm border ${msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'
                    }`}
                  style={msg.role === 'user' ? {
                    backgroundColor: USER_COLOR_LIGHT,
                    borderColor: USER_COLOR_SOFT,
                    color: '#27272a' // text-darkDelegation
                  } : {
                    backgroundColor: '#fafafa', // bg-zinc-50
                    borderColor: '#f4f4f5', // border-zinc-100
                    color: '#27272a' // text-darkDelegation
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>

                      {msg.metadata?.reviewTaskId && (
                        <div className="mt-4 p-4 bg-white/50 rounded-2xl border border-zinc-200/50 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                          <div className="flex items-center gap-2 pr-2">
                            <div
                              className="p-2 rounded-xl flex-shrink-0"
                              style={{ backgroundColor: USER_COLOR_LIGHT, color: USER_COLOR }}
                            >
                              <FileSearch size={18} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                              {coreStore.tasks.find(t => t.id === msg.metadata.reviewTaskId)?.status === 'on_hold'
                                ? 'Review Requested'
                                : 'Review Processed'}
                            </span>
                          </div>

                          {coreStore.tasks.find(t => t.id === msg.metadata.reviewTaskId)?.status === 'on_hold' && (
                            <button
                              onClick={() => setActiveAuditTaskId(msg.metadata.reviewTaskId)}
                              className="flex-1 min-w-[120px] px-4 py-2 bg-darkDelegation text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-sm whitespace-nowrap"
                            >
                              Review Task
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>

                <div className={`flex items-center gap-2 mt-2 px-1`}>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    {msg.role === 'user' ? 'You' : (agent?.name?.split(' ')[0] || 'AI')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div
            className="flex items-start gap-3"
          >
            <div className="w-4 h-4 text-zinc-300 animate-pulse mt-1">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" />
              </svg>
            </div>
            <div className="bg-zinc-50 px-4 py-3 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="min-h-0 flex flex-col p-2 border-t border-zinc-50">
        {isLead && (
          <MockScenariosSection
            onInsert={setInput}
            hasSentMessage={chatMessages.some((msg) => msg.role === 'user')}
          />
        )}
        <div className="relative shrink-0 flex items-center gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);

                // Show player talking animation while typing
                if (val.length > 0) {
                  setIsTyping(true);
                  if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
                  stopTypingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
                } else {
                  setIsTyping(false);
                }
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message (↵ to send)"
              className="w-full bg-white border border-zinc-200 rounded-2xl px-3 py-3 text-sm focus:outline-none focus:ring-2 transition-all resize-none pr-12 [scrollbar-width:thin]"
              style={{
                borderColor: input.trim() ? USER_COLOR : undefined,
                boxShadow: input.trim() ? `0 0 0 2px ${USER_COLOR_LIGHT}` : undefined
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            style={{ backgroundColor: !input.trim() || isThinking ? undefined : agent.color }}
            className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${!input.trim() || isThinking
              ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
              : 'text-white shadow-lg hover:brightness-90'
              }`}
          >
            <Send size={16} strokeWidth={3} />
          </button>
        </div>
        <p className="shrink-0 text-[8px] text-zinc-400 mt-2 text-center font-medium uppercase tracking-wider">
          Shift + ↵ for new line
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;
