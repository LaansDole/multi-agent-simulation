import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCoreStore } from '../integration/store/coreStore'
import { useActiveTeam } from '../integration/store/teamStore'
import { Loader2, Download } from 'lucide-react'
import { TeamOutputBadge } from './components/TeamOutputBadge'

export function FinalOutputModal() {
  const {
    isFinalOutputOpen,
    setFinalOutputOpen,
    finalOutput,
    finalAssetType,
    finalAssetContent,
    isGeneratingAsset,
    referenceImages
  } = useCoreStore()
  const activeTeam = useActiveTeam()
  const [copied, setCopied] = useState(false)

  if (!isFinalOutputOpen) return null

  const handleCopy = async () => {
    // We always copy finalOutput which contains the text result or the prompt/metadata
    await navigator.clipboard.writeText(finalOutput || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!finalAssetContent) return;

    const link = document.createElement('a');
    if (finalAssetType === 'image') {
      link.href = `data:image/png;base64,${finalAssetContent}`;
      link.download = `agentic-image-${Date.now()}.png`;
    } else if (finalAssetType === 'audio') {
      link.href = `data:audio/mp3;base64,${finalAssetContent}`;
      link.download = `agentic-audio-${Date.now()}.mp3`;
    } else if (finalAssetType === 'video') {
      link.href = finalAssetContent; // It's usually a URL
      link.download = `agentic-video-${Date.now()}.mp4`;
      link.target = "_blank";
    }
    link.click();
  }

  const renderContent = () => {
    if (isGeneratingAsset) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-zinc-300" size={40} strokeWidth={1.5} />
          <p className="text-zinc-400 font-black uppercase tracking-widest text-[10px]">Generating {finalAssetType} asset...</p>
        </div>
      );
    }

    if (finalAssetType === 'text') {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {finalOutput || ''}
        </ReactMarkdown>
      );
    }

    if (finalAssetType === 'image' && finalAssetContent) {
      return (
        <div className="space-y-4">
          <div className="relative group">
            <img
              src={`data:image/png;base64,${finalAssetContent}`}
              alt="Final Generated Asset"
              className="w-full rounded-2xl shadow-xl border border-black/5"
            />
            <button
              onClick={handleDownload}
              className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-black/5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-zinc-600 active:scale-95"
              title="Download Image"
            >
              <Download size={18} />
            </button>
          </div>
          <div className="p-4 bg-zinc-100/50 rounded-xl border border-zinc-100/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">PROMPT USED:</p>
            <p className="text-xs text-zinc-600 italic leading-relaxed">{finalOutput || "No prompt metadata available."}</p>
          </div>
        </div>
      );
    }

    if (finalAssetType === 'audio' && finalAssetContent) {
      return (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-white border border-zinc-100 rounded-2xl shadow-sm">
            <audio controls className="flex-1 h-9">
              <source src={`data:audio/mp3;base64,${finalAssetContent}`} type="audio/mp3" />
              Your browser does not support the audio element.
            </audio>
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-darkDelegation text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95 shrink-0"
            >
              <Download size={14} strokeWidth={2.5} />
              Download Audio
            </button>
          </div>
          <div className="p-4 bg-zinc-100/50 rounded-xl border border-zinc-100/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">LYRICS / PROMPT:</p>
            <p className="text-xs text-zinc-500 italic leading-relaxed">{finalOutput || "No prompt metadata available."}</p>
          </div>
        </div>
      );
    }

    if (finalAssetType === 'video' && finalAssetContent) {
      return (
        <div className="space-y-4">
          <div className="relative group">
            <video controls className="w-full rounded-2xl shadow-xl border border-black/5">
              <source src={finalAssetContent} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <button
              onClick={handleDownload}
              className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-black/5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-zinc-600 active:scale-95 z-10"
              title="Download Video"
            >
              <Download size={18} />
            </button>
          </div>
          <div className="p-4 bg-zinc-100/50 rounded-xl border border-zinc-100/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">SCRIPT / PROMPT:</p>
            <p className="text-xs text-zinc-600 italic leading-relaxed">{finalOutput || "No prompt metadata available."}</p>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-xl p-4"
      onClick={() => setFinalOutputOpen(false)}
    >
      <div
        className="bg-zinc-50 border border-black/10 rounded-[32px] w-180 max-w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-black/5 bg-white">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-darkDelegation flex items-center gap-2">
                {finalAssetType !== 'text' && (
                  <span className="px-2 py-0.5 bg-darkDelegation text-white text-[8px] rounded-md tracking-tighter">
                    {(activeTeam?.outputType || finalAssetType).toUpperCase()}
                  </span>
                )}
                Final {finalAssetType} Deliverable
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Refined and generated by your autonomous team
              </p>
            </div>
            <TeamOutputBadge system={activeTeam} className="hidden sm:flex" />
          </div>
          <button
            onClick={() => setFinalOutputOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="markdown-content text-sm text-zinc-700 leading-relaxed font-sans">
            {renderContent()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-black/5 flex flex-col gap-6 bg-white">
          {referenceImages.length > 0 && (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Visual Inspiration</p>
              <div className="flex gap-2">
                {referenceImages.map((img, idx) => (
                  <div key={idx} className="w-12 h-12 rounded-lg overflow-hidden border border-black/5 bg-zinc-50 shadow-sm">
                    <img src={img} alt="Ref" className="w-full h-full object-cover grayscale opacity-50" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <div className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest leading-none">
              Generated March 2026
            </div>
            <button
              onClick={handleCopy}
              className="px-6 py-3 bg-darkDelegation text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-black active:scale-[0.98] transition-all shadow-lg shadow-black/10"
            >
              {copied ? 'Copied!' : `Copy ${finalAssetType === 'text' ? 'Output' : 'Prompt'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
