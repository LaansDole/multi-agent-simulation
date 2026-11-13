
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { Check, Repeat2, X } from 'lucide-react';
import React from 'react';

export const DirectionalEdge = ({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, label }: any) => {
  const isSuccess = label === 'OK';
  const isRetry = typeof label === 'string' && label.startsWith('KO:');
  
  // Create deterministic offsets based on edge type to guarantee parallel lanes
  // For success loops (A <-> B), we use source/target IDs to flip the offset direction
  const directionFactor = source && target ? (source.localeCompare(target) > 0 ? 1 : -1) : 1;
  const typeOffset = isSuccess ? (30 * directionFactor) : (isRetry ? -30 : 0);
  
  // Add a unique sub-offset based on order-dependent ID hash to separate parallel lines of the SAME type
  const hash = id.split('').reduce((acc: number, char: string, i: number) => acc + (char.charCodeAt(0) * (i + 1)), 0);
  const subOffset = (hash % 5 - 2) * 6; 
  
  const offset = typeOffset + subOffset;

  // Manual boxy path with offset to avoid overlaps
  const centerY = (sourceY + targetY) / 2 + offset;
  
  // Custom boxy path string
  const edgePath = `M ${sourceX},${sourceY} L ${sourceX},${centerY} L ${targetX},${centerY} L ${targetX},${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  // Stagger labels to avoid overlaps in vertical parallel lines
  const staggerY = isSuccess ? 18 : (isRetry ? -18 : 0);
  const labelY = centerY + staggerY;

  const retryCount = isRetry ? label.split(':')[1] : null;

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              opacity: style?.opacity ?? 1,
            }}
            className="flex items-center justify-center transition-opacity duration-300"
          >
            <div className="flex items-center gap-1.5 p-0.5">
              {isSuccess ? (
                <div className="flex items-center justify-center w-6 h-6 rounded-full shadow-md border-2 border-white bg-[#10b981]">
                  <Check size={12} strokeWidth={4} className="text-white" />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full shadow-md border-2 border-white bg-[#ef4444]">
                    <X size={12} strokeWidth={4} className="text-white" />
                  </div>
                  {retryCount && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 h-6 rounded-full shadow-md border-2 border-white bg-white/95">
                      <Repeat2 size={12} strokeWidth={3} className="text-zinc-500" />
                      <span className="text-[11px] font-black text-darkDelegation leading-none">
                        {retryCount}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
