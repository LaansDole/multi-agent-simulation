import { FileText, Search, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { BackendClient } from '../integration/api/BackendClient';
import { importWorkflow } from '../integration/api/YamlImporter';
import { useWorkflowStore } from '../integration/store/workflowStore';
import { useEscapeToClose } from './components/useEscapeToClose';
import { filterWorkflows } from './workflowFilter';

interface WorkflowBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkflowBrowser: React.FC<WorkflowBrowserProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const setImportedWorkflow = useWorkflowStore((s) => s.setImportedWorkflow);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const client = new BackendClient();
    setLoading(true);
    setError(null);
    client
      .listWorkflows()
      .then((names) => setFiles(names))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleImport = async (filename: string) => {
    setImporting(filename);
    setError(null);
    try {
      const client = new BackendClient();
      const graph = await client.fetchWorkflowGraph(filename);
      const result = importWorkflow(graph);
      setImportedWorkflow(result, graph);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  useEscapeToClose(onClose, isOpen);

  if (!isOpen) return null;

  const shown = filterWorkflows(files, query);

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query) {
      // First Escape clears the query; the window-level useEscapeToClose never sees it.
      e.stopPropagation();
      setQuery('');
    } else if (e.key === 'Enter' && shown.length === 1 && importing === null) {
      handleImport(shown[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-4xl shadow-2xl overflow-hidden border border-zinc-100">
        <div className="px-8 pt-8 pb-10">
          <div className="flex items-start justify-between mb-6">
            <h3 className="text-2xl font-black text-darkDelegation leading-tight">Import Workflow</h3>
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors">
              <X size={20} />
            </button>
          </div>

          <p className="text-sm text-zinc-500 leading-relaxed mb-6">
            Select a YAML workflow from the DevAll backend to import and run.
            Agent nodes are mapped to the available 3D characters; non-agent
            nodes appear in the graph and logs.
          </p>

          <div className="relative mb-3">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              ref={searchRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search workflows"
              aria-label="Search workflows"
              className="w-full pl-10 pr-10 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm text-zinc-700 placeholder:text-zinc-400 outline-none focus:border-zinc-300 transition-colors"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 rounded-full text-zinc-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {query && shown.length > 0 && (
            <p className="text-xs text-zinc-400 mb-3">{shown.length} of {files.length}</p>
          )}

          {loading && <p className="text-sm text-zinc-400">Loading workflows...</p>}
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {shown.map((filename) => (
              <button
                key={filename}
                onClick={() => handleImport(filename)}
                disabled={importing !== null}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-left transition-all disabled:opacity-50"
              >
                <FileText size={18} className="text-zinc-400 shrink-0" />
                <span className="text-sm font-medium text-zinc-700 truncate">{filename}</span>
                {importing === filename && <span className="ml-auto text-xs text-zinc-400">Importing...</span>}
              </button>
            ))}
            {!loading && files.length === 0 && !error && (
              <p className="text-sm text-zinc-400">No workflows found.</p>
            )}
            {files.length > 0 && shown.length === 0 && (
              <p className="text-sm text-zinc-400">No workflows match "{query}"</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBrowser;
