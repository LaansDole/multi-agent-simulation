import { Maximize2, Settings } from 'lucide-react';
import React from 'react';
import { useCoreStore } from '../integration/store/coreStore';
import { useUiStore } from '../integration/store/uiStore';
import WorkflowBrowser from './WorkflowBrowser';

const Header: React.FC = () => {
  const { backendStatus, setViewMode } = useCoreStore();
  const isWorkflowBrowserOpen = useUiStore((s) => s.isWorkflowBrowserOpen);
  const setWorkflowBrowserOpen = useUiStore((s) => s.setWorkflowBrowserOpen);

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
    <header className="h-14 border-b border-zinc-100 flex items-center justify-end px-6 bg-white shrink-0 relative z-40">
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

        <button
          onClick={() => setWorkflowBrowserOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-all active:scale-95 cursor-pointer h-9 shrink-0"
          title="Browse and import YAML workflows"
        >
          <span className="text-[10px] font-black uppercase tracking-wider">Browse Workflows</span>
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
      <WorkflowBrowser isOpen={isWorkflowBrowserOpen} onClose={() => setWorkflowBrowserOpen(false)} />
    </header>
  );
};

export default Header;
