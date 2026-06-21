import { ExternalLink, X, Sparkles } from 'lucide-react';
import React from 'react';
import { GEMINI_PRICING } from '../core/llm/pricing';
import { DEFAULT_MODELS } from '../core/llm/constants';

interface PricingModalProps {
  onClose: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ onClose }) => {
  const reasoningModels = Object.entries(GEMINI_PRICING)
    .filter(([_, p]) => p.inputPer1M !== undefined)
    .sort(([a], [b]) => (a === DEFAULT_MODELS.text ? -1 : (b === DEFAULT_MODELS.text ? 1 : 0)));
  const outputModels = Object.entries(GEMINI_PRICING).filter(([_, p]) => p.inputPer1M === undefined);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl"
      />
      <div
        className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-12 border border-zinc-100 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mx-auto">
          {/* Header */}
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-darkDelegation tracking-tight mb-2">
              Gemini API Pricing
            </h2>
            <div className="flex flex-col items-center gap-3">
              <a
                href="https://ai.google.dev/gemini-api/docs/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 hover:border-blue-200 rounded-full transition-all duration-200"
              >
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-600">Official Pricing Page</span>
                <ExternalLink size={11} className="text-blue-500" />
              </a>
              <p className="text-zinc-500 text-xs font-medium leading-relaxed">
                Official Google Gemini API pricing (March 2026).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Column 1: Reasoning & Image */}
            <div className="space-y-10">
              {/* Reasoning Models */}
              <div className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 px-1 border-l-2 border-blue-500 pl-3">Reasoning Models</h3>
                <div className="space-y-3">
                  {reasoningModels.map(([model, pricing]) => {
                    const isDefault = model === DEFAULT_MODELS.text;
                    return (
                      <div key={model} className={`relative px-5 py-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                        isDefault ? 'bg-blue-50/80 border-blue-100 shadow-sm' : 'bg-zinc-50 border-zinc-100/60'
                      }`}>
                        {isDefault && (
                          <div className="absolute -top-2 left-4 flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase rounded-full tracking-widest shadow-sm">
                            <Sparkles size={8} className="fill-white" />
                            Default
                          </div>
                        )}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <p className="text-xs font-bold text-darkDelegation lowercase">
                            {model}
                          </p>
                          {isDefault && <Sparkles size={10} className="text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-5 text-xs font-mono font-bold">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tighter">In</span>
                            <span className="text-darkDelegation">${pricing.inputPer1M?.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tighter">Out</span>
                            <span className="text-darkDelegation">${pricing.outputPer1M?.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Image Models */}
              {['image'].map(type => {
                const typeModels = outputModels.filter(([_, p]) => p.perImage !== undefined)
                  .sort(([a], [b]) => {
                    const defaultModel = DEFAULT_MODELS.image;
                    return (a === defaultModel ? -1 : (b === defaultModel ? 1 : 0));
                  });

                if (typeModels.length === 0) return null;

                return (
                  <div key={type} className="space-y-6">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 px-1 border-l-2 border-amber-400 pl-3">
                      {type} models
                    </h4>
                    <div className="space-y-3">
                      {typeModels.map(([model, pricing]) => {
                        const isDefault = model === DEFAULT_MODELS.image;
                        return (
                          <div key={model} className={`relative px-5 py-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                            isDefault ? 'bg-amber-50/80 border-amber-100 shadow-sm' : 'bg-zinc-50 border-zinc-100/60'
                          }`}>
                            {isDefault && (
                              <div className="absolute -top-2 left-4 flex items-center gap-1.5 px-2 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase rounded-full tracking-widest shadow-sm">
                                <Sparkles size={8} className="fill-white" />
                                Default
                              </div>
                            )}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <p className="text-xs font-bold text-darkDelegation lowercase">
                                {model}
                              </p>
                              {isDefault && <Sparkles size={10} className="text-amber-500" />}
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tight">Img</span>
                              <span className="text-sm font-mono font-bold text-darkDelegation">
                                ${pricing.perImage?.toFixed(3)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column 2: Video & Music */}
            <div className="space-y-10">
              {['video', 'music'].map(type => {
                const typeModels = outputModels.filter(([_, p]) => {
                  if (type === 'music') return p.perSong !== undefined;
                  return p.perSecond !== undefined;
                }).sort(([a], [b]) => {
                  const defaultModel = DEFAULT_MODELS[type as keyof typeof DEFAULT_MODELS];
                  return (a === defaultModel ? -1 : (b === defaultModel ? 1 : 0));
                });

                if (typeModels.length === 0) return null;

                const colors = type === 'video' 
                  ? { border: 'border-rose-500', bg: 'bg-rose-50/80', badge: 'bg-rose-600', borderLight: 'border-rose-100', icon: 'text-rose-500' }
                  : { border: 'border-lime-400', bg: 'bg-lime-50/80', badge: 'bg-lime-500', borderLight: 'border-lime-100', icon: 'text-lime-600' };

                return (
                  <div key={type} className="space-y-6">
                    <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 px-1 border-l-2 ${colors.border} pl-3`}>
                      {type} models
                    </h4>
                    <div className="space-y-3">
                      {typeModels.map(([model, pricing]) => {
                        const isDefault = model === (DEFAULT_MODELS as any)[type];
                        const label = pricing.perSong !== undefined ? (model === 'lyria-3-clip-preview' ? '30 Sec Song' : 'Song') : 'Sec';

                        return (
                          <div key={model} className={`relative px-5 py-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
                            isDefault ? `${colors.bg} ${colors.borderLight} shadow-sm` : 'bg-zinc-50 border-zinc-100/60'
                          }`}>
                            {isDefault && (
                              <div className={`absolute -top-2 left-4 flex items-center gap-1.5 px-2 py-0.5 ${colors.badge} text-white text-[8px] font-black uppercase rounded-full tracking-widest shadow-sm`}>
                                <Sparkles size={8} className="fill-white" />
                                Default
                              </div>
                            )}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <p className="text-xs font-bold text-darkDelegation lowercase">
                                {model}
                              </p>
                              {isDefault && <Sparkles size={10} className={colors.icon} />}
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-zinc-400 font-medium uppercase text-[10px] tracking-tight">
                                {label}
                              </span>
                              <span className="text-sm font-mono font-bold text-darkDelegation">
                                ${(pricing.perSong || pricing.perSecond || 0).toFixed(3)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
