
import React, { useState } from 'react';
import { X, Code, Copy, Check } from 'lucide-react';

interface SystemDebugOverlayProps {
  system: any;
  onClose?: () => void;
}

export const SystemDebugOverlay: React.FC<SystemDebugOverlayProps> = ({ system, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(system, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-2 py-1 bg-red-50 text-red-500 rounded border border-red-100 text-[8px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center gap-1.5"
      >
        <Code size={10} />
        Debug System
      </button>

      {isOpen && (
        <div className="fixed inset-4 bg-white border border-zinc-200 shadow-2xl rounded-2xl z-[1000] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
            <div className="flex items-center gap-3">
              <Code size={14} className="text-zinc-400" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                System Debug Data — <span className="text-darkDelegation">{system.teamName || 'Untitled'}</span>
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[9px] font-bold text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 px-2 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-darkDelegation transition-colors"
                title="Close overlay"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <pre className="flex-1 overflow-auto p-6 text-[11px] font-mono whitespace-pre-wrap bg-darkDelegation text-green-400 selection:bg-green-500/20">
            {JSON.stringify(system, null, 2)}
          </pre>

          <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex justify-end">
            <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-400 italic">
              Provisional Debug Tool • Close with ESC or button
            </p>
          </div>
        </div>
      )}
    </>
  );
};
