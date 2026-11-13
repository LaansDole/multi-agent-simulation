import { Pipette, X } from 'lucide-react';
import React, { useRef, useState, useEffect } from 'react';
import { getBrightness, getDarkenedColor, MAX_BRIGHTNESS } from './colorUtils';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color, 
  onChange, 
  disabled = false 
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [suggestedColor, setSuggestedColor] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prevColor, setPrevColor] = useState<string>(color);

  useEffect(() => {
    // If external color changes and we are not in a suggestion state, update prevColor
    if (!suggestedColor) {
      setPrevColor(color);
    }
  }, [color, suggestedColor]);

  const handleLiveColorChange = (newColor: string) => {
    onChange(newColor);
    setSuggestedColor(null);
    setErrorMsg(null);
  };

  const handleCommitColorChange = (newColor: string) => {
    const brightness = getBrightness(newColor);
    if (brightness > MAX_BRIGHTNESS) {
      const suggested = getDarkenedColor(newColor);
      setSuggestedColor(suggested);
      setErrorMsg('Selected color is too light for white text.');
    } else {
      setSuggestedColor(null);
      setErrorMsg(null);
      setPrevColor(newColor);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative group/picker">
        <div
          onClick={() => !disabled && colorInputRef.current?.click()}
          className={`w-8 h-8 rounded-xl shadow-sm flex items-center justify-center transition-all ${
            !disabled ? 'cursor-pointer hover:scale-110 active:scale-90 shadow-black/5' : 'opacity-50'
          }`}
          style={{ backgroundColor: color || '#A855F7' }}
        >
          {!disabled && (
            <Pipette size={14} className="text-white opacity-90" strokeWidth={2.5} />
          )}
        </div>
        <input
          ref={colorInputRef}
          type="color"
          value={color || '#A855F7'}
          onInput={(e) => handleLiveColorChange((e.target as HTMLInputElement).value)}
          onBlur={(e) => handleCommitColorChange((e.target as HTMLInputElement).value)}
          onChange={(e) => handleCommitColorChange((e.target as HTMLInputElement).value)}
          className="absolute inset-0 opacity-0 pointer-events-none"
          disabled={disabled}
        />
      </div>

      {(errorMsg || suggestedColor) && (
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          {errorMsg && (
            <p className="text-[8px] font-black leading-tight text-red-500 uppercase tracking-tight">
              {errorMsg}
            </p>
          )}

          {suggestedColor && (
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
              <button
                onClick={() => {
                  onChange(prevColor);
                  setSuggestedColor(null);
                  setErrorMsg(null);
                }}
                className="flex-1 py-1 px-2 bg-white border border-zinc-200 text-zinc-400 rounded-lg text-[8px] font-black uppercase tracking-wider hover:bg-zinc-50 transition-colors"
                type="button"
              >
                No
              </button>
              <button
                onClick={() => {
                  onChange(suggestedColor);
                  setPrevColor(suggestedColor);
                  setSuggestedColor(null);
                  setErrorMsg(null);
                }}
                className="flex-[2] py-1 px-2 text-white rounded-lg text-[8px] font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-md shadow-black/5"
                style={{ backgroundColor: suggestedColor }}
                type="button"
              >
                Use suggested
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
