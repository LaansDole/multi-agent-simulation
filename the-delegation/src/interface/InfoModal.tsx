import React from 'react';
import { X } from 'lucide-react';

interface InfoModalProps {
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl animate-in fade-in duration-500"
      />
      <div
        className="relative w-full max-w-xl bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        {/* Close Button X */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100 rounded-full transition-all active:scale-95 cursor-pointer"
        >
          <X size={20} strokeWidth={2.5} />
        </button>

        <div className="max-w-md mx-auto">
          <div className="flex justify-center mb-8">
            <img
              src="images/the-delegation.svg"
              alt="The Delegation Logo"
              width={256}
              className="h-auto"
            />
          </div>

          <h2 className="text-3xl font-black text-darkDelegation leading-[1.2] mb-6 tracking-tight text-center">
            A no-code 3D playground to explore Agentic AI systems
          </h2>

          <div className="space-y-6 text-zinc-500 text-[15px] leading-relaxed text-center sm:text-left">
            <p>
              The Delegation is an experimental workspace where you stop prompting and start delegating to a team of autonomous AI agents in a living 3D office.
            </p>
            <p>
              Designed for enthusiasts, educators, and creative developers to understand multi-agent collaboration, making complex AI processes transparent, collaborative, and human-centered.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center gap-6">
            <a
              href="https://github.com/arturitu/the-delegation"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 px-8 py-3.5 bg-zinc-100 text-zinc-600 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              View on GitHub
            </a>

            <div className="pt-4 border-t border-zinc-50 w-full flex flex-col items-center">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] text-center leading-loose">
                Developed with ❤️ by <a href="https://unboring.net" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-darkDelegation transition-colors underline decoration-zinc-100 underline-offset-4">Arturo Paracuellos (unboring.net)</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;


