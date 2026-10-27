import { FileText, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BackendClient } from '../integration/api/BackendClient';
import { importWorkflow } from '../integration/api/YamlImporter';
import { useWorkflowStore } from '../integration/store/workflowStore';
import { useEscapeToClose } from './components/useEscapeToClose';

interface WorkflowBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkflowBrowser: React.FC<WorkflowBrowserProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const setImportedWorkflow = useWorkflowStore((s) => s.setImportedWorkflow);

  useEffect(() => {
    if (!isOpen) return;
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

          {loading && <p className="text-sm text-zinc-400">Loading workflows...</p>}
          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {files.map((filename) => (
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBrowser;
