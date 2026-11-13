import React, { useRef } from 'react';
import { Image as ImageIcon, Plus, X, UploadCloud } from 'lucide-react';
import { useCoreStore } from '../../integration/store/coreStore';
import { useActiveTeam } from '../../integration/store/teamStore';
import { USER_COLOR } from '../../theme/brand';

export const ReferenceImages: React.FC = () => {
  const { referenceImages, addReferenceImage, removeReferenceImage } = useCoreStore();
  const activeTeam = useActiveTeam();
  const maxImages = (activeTeam.outputType === 'video' && activeTeam.outputModel === 'veo-3.1-lite-generate-preview') ? 1 : 3;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const processFiles = (files: FileList | null) => {
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        if (referenceImages.length >= maxImages) break;

        const reader = new FileReader();
        reader.onloadend = () => {
          addReferenceImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`space-y-3 p-3 rounded-2xl transition-all duration-300 border ${isDragging ? 'bg-zinc-50 border-zinc-200 border-dashed scale-[1.02]' : 'bg-transparent border-transparent'
        }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <UploadCloud size={12} className={isDragging ? 'text-darkDelegation animate-bounce' : 'text-zinc-400'} />
          <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isDragging ? 'text-darkDelegation' : 'text-zinc-400'
            }`}>Reference Images</span>
        </div>
        <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-tighter">
          {referenceImages.length}/{maxImages} Slots
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {/* Existing Images */}
        {referenceImages.map((img, idx) => (
          <div
            key={idx}
            className="group relative aspect-square rounded-xl overflow-hidden border border-zinc-100 bg-zinc-50 shadow-sm animate-in zoom-in-95 duration-200"
          >
            <img
              src={img}
              alt={`Reference ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeReferenceImage(idx);
                }}
                className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all active:scale-90"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        ))}

        {/* Add Button */}
        {referenceImages.length < maxImages && (
          <button
            onClick={triggerUpload}
            className={`aspect-square rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 group active:scale-95 ${isDragging ? 'border-zinc-300 bg-white' : 'border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50'
              }`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors border shadow-sm ${isDragging ? 'bg-darkDelegation border-darkDelegation' : 'bg-zinc-50 group-hover:bg-white border-transparent group-hover:border-zinc-100'
              }`}>
              <Plus size={14} className={isDragging ? 'text-white' : 'text-zinc-400 group-hover:text-darkDelegation'} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-tighter transition-colors ${isDragging ? 'text-darkDelegation' : 'text-zinc-300 group-hover:text-zinc-500'
              }`}>Add</span>
          </button>
        )}

        {/* Empty Slots */}
        {Array.from({ length: Math.max(0, maxImages - referenceImages.length - (referenceImages.length < maxImages ? 1 : 0)) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-square rounded-xl border border-zinc-50 bg-zinc-50/30 flex items-center justify-center opacity-40"
          >
            <ImageIcon size={14} className="text-zinc-200" />
          </div>
        ))}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        className="hidden"
      />

      <p className={`text-[9px] font-medium leading-tight transition-colors ${isDragging ? 'text-darkDelegation font-bold' : 'text-zinc-400'
        }`}>
        {isDragging ? 'Drop images to add as reference' : 'Add visual references (or drop them here) to guide the team.'}
      </p>
    </div>
  );
};
