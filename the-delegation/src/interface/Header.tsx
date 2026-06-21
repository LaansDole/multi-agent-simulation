import { Info, Maximize2, Settings } from 'lucide-react';
import React, { useState } from 'react';
import packageJson from '../../package.json';
import { useCoreStore } from '../integration/store/coreStore';
import InfoModal from './InfoModal';

const version = packageJson.version;

const Header: React.FC = () => {
  const { backendStatus, setViewMode } = useCoreStore();
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 bg-white shrink-0 relative z-40">
      {/* Left: Project Title */}
      <div className="flex items-center min-w-0">
        <img
          src="images/the-delegation.svg"
          alt="The Delegation"
          className="h-10 w-auto shrink-0"
        />

        <div className="flex items-center gap-3 self-start mt-3 ml-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="text-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
            >
              <Info size={14} strokeWidth={2} />
            </button>
            <span className="text-[10px] font-medium text-zinc-400 font-mono">v{version}</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <a
              href="https://x.com/arturitu"
              target="_blank"
              rel="noopener"
              className="text-[10px] font-medium text-zinc-400 hover:text-darkDelegation transition-colors truncate"
            >
              @arturitu
            </a>
            <a
              href="https://github.com/arturitu/the-delegation"
              target="_blank"
              rel="noopener"
              className="text-zinc-300 hover:text-darkDelegation transition-colors shrink-0"
              title="View on GitHub"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Right: Global Controls */}
      <div className="flex items-center gap-3">

        <button
          onClick={() => setViewMode('design')}
          className="flex items-center gap-2 px-3 py-1 bg-darkDelegation hover:bg-darkDelegation text-white rounded-lg transition-all shadow-lg shadow-black/10 active:scale-95 cursor-pointer h-9 shrink-0 ml-1"
          title="Manage Teams"
        >
          <Settings size={14} className="group-hover:rotate-45 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-wider ml-1 hidden sm:inline">Manage Teams</span>
        </button>

        <div className="w-px h-4 bg-zinc-200" />

        <div className="flex items-center gap-3">
          <button
            onClick={handleFullscreen}
            className="text-zinc-400 hover:text-darkDelegation transition-colors p-1"
            title="Fullscreen Browser"
          >
            <Maximize2 size={16} />
          </button>
          
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border border-zinc-100 rounded-xl select-none"
            title={`DevAll backend: ${
              {
                connected: 'Backend Connected',
                connecting: 'Connecting...',
                reconnecting: 'Reconnecting...',
                error: 'Connection Error',
                disconnected: 'Disconnected',
              }[backendStatus] || 'Disconnected'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === 'connecting' || backendStatus === 'reconnecting'
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{
                backgroundColor:
                  {
                    connected: '#10b981',
                    connecting: '#f59e0b',
                    reconnecting: '#f59e0b',
                    error: '#ef4444',
                    disconnected: '#71717a',
                  }[backendStatus] || '#71717a',
              }}
            />
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
              {
                {
                  connected: 'Connected',
                  connecting: 'Connecting',
                  reconnecting: 'Reconnecting',
                  error: 'Error',
                  disconnected: 'Offline',
                }[backendStatus] || 'Offline'
              }
            </span>
          </div>
        </div>
      </div>

      {isInfoOpen && (
        <InfoModal key="info-modal" onClose={() => setIsInfoOpen(false)} />
      )}
    </header>
  );
};

export default Header;
