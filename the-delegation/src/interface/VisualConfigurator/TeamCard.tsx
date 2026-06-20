import { Edit2, Pipette, Trash2, Users, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAllAgents } from '../../data/agents';
import { DEFAULT_MODELS, AVAILABLE_MODELS, ModelType } from '../../core/llm/constants';
import { USER_COLOR } from '../../theme/brand';
import { useTeamStore } from '../../integration/store/teamStore';
import { useSceneManager } from '../../simulation/SceneContext';
import { getBrightness, getDarkenedColor } from './colorUtils';
import { ColorPicker } from './ColorPicker';
import { InfoBubble } from '../components/InfoBubble';
import { TeamOutputBadge } from '../components/TeamOutputBadge';

interface TeamCardProps {
  system: AgenticSystem;
  isSelected: boolean;
  isActive: boolean;
  isPredefined: boolean;
  mode: 'view' | 'edit';
  onSelectTeam: (id: string) => void;
  onModeChange: (mode: 'view' | 'edit') => void;
}

interface EditData extends Partial<AgenticSystem> {
  leadAgentModel?: string;
  leadAgentBaseUrl?: string;
  leadAgentApiKey?: string;
  provider?: string;
}

export const TeamCard: React.FC<TeamCardProps> = ({
  system,
  isSelected,
  isActive,
  isPredefined,
  mode,
  onSelectTeam,
  onModeChange,
}) => {
  const { setActiveTeam, updateSystem, deleteCustomSystem, selectedAgentSetId } = useTeamStore();
  const scene = useSceneManager();
  const colorInputRef = useRef<HTMLInputElement>(null);

  const [localEditData, setLocalEditData] = useState<EditData>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hasColorSuggestion, setHasColorSuggestion] = useState(false);

  const isEditing = mode === 'edit' && isSelected;
  const agentCount = useMemo(() => getAllAgents(system).length, [system]);

  useEffect(() => {
    if (isEditing) {
      setLocalEditData({
        teamName: system.teamName || '',
        teamType: system.teamType || '',
        teamDescription: system.teamDescription || 'A custom agentic team.',
        color: system.color || '#A855F7',
        outputType: system.outputType || 'text',
        outputModel: system.outputModel || DEFAULT_MODELS.text,
        outputAutoApprove: system.outputAutoApprove !== undefined ? system.outputAutoApprove : (system.outputType === 'text'),
        leadAgentModel: system.leadAgent.model || DEFAULT_MODELS.text,
        leadAgentBaseUrl: system.leadAgent.baseUrl || '',
        leadAgentApiKey: system.leadAgent.apiKey || '',
        provider: system.leadAgent.provider || '',
      });
      setErrorMsg(null);
      setShowDeleteConfirm(false);
      setHasColorSuggestion(false);
    } else {
      setErrorMsg(null);
      setShowDeleteConfirm(false);
      setHasColorSuggestion(false);
    }
  }, [isEditing, system]);

  const hasUnsavedChanges = useMemo(() => {
    return localEditData.teamName !== (system.teamName || '') ||
      localEditData.teamType !== (system.teamType || '') ||
      localEditData.teamDescription !== (system.teamDescription || '') ||
      localEditData.color !== (system.color || '#A855F7') ||
      localEditData.outputType !== (system.outputType || 'text') ||
      localEditData.outputModel !== (system.outputModel || DEFAULT_MODELS.text) ||
      localEditData.outputAutoApprove !== (system.outputAutoApprove) ||
      localEditData.leadAgentModel !== (system.leadAgent.model || DEFAULT_MODELS.text) ||
      localEditData.provider !== (system.leadAgent.provider) ||
      localEditData.leadAgentBaseUrl !== (system.leadAgent.baseUrl || '') ||
      localEditData.leadAgentApiKey !== (system.leadAgent.apiKey || '');
  }, [localEditData, system]);

  const isFormValid = !!(localEditData.teamName?.trim() &&
    localEditData.teamType?.trim() &&
    localEditData.teamDescription?.trim() &&
    !hasColorSuggestion);

  const handleSwitch = (e: React.MouseEvent) => {
    e.stopPropagation();
    scene?.resetScene();
    setActiveTeam(system.id);
  };

  const handleSave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isFormValid) {
      setErrorMsg('Please fill Name, Type and Description or delete the team.');
      return;
    }
    const updatedLeadAgent = {
      ...system.leadAgent,
      model: localEditData.leadAgentModel || system.leadAgent.model,
      provider: localEditData.provider || system.leadAgent.provider,
      baseUrl: localEditData.leadAgentBaseUrl || system.leadAgent.baseUrl,
      apiKey: localEditData.leadAgentApiKey || system.leadAgent.apiKey,
    };
    const { leadAgentModel, ...systemChanges } = localEditData;
    const finalChanges = {
      ...systemChanges,
      leadAgent: updatedLeadAgent
    };
    updateSystem(system.id, finalChanges);
    onModeChange('view');
  };

  const handleCloseEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFormValid) {
      if (hasColorSuggestion) {
        setErrorMsg('Please choose a darker color (use suggestion or pick another) before saving.');
      } else {
        setErrorMsg('Please fill Name, Type and Description or delete the team.');
      }
      return;
    }
    if (hasUnsavedChanges) {
      setErrorMsg('Unsaved changes will be lost. Save or close again to discard.');
      if (errorMsg?.includes('Unsaved changes')) {
        onModeChange('view');
      }
      return;
    }
    onModeChange('view');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
    setErrorMsg('Delete this team?');
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (system.id === selectedAgentSetId) {
      scene?.resetScene();
      setActiveTeam(DEFAULT_AGENTIC_SET_ID);
    }
    deleteCustomSystem(system.id);
    onModeChange('view');
  };

  const handleColorChange = (newColor: string) => {
    setLocalEditData(prev => ({ ...prev, color: newColor }));

    // Check if new color is too light to update form validity status
    const brightness = getBrightness(newColor);
    setHasColorSuggestion(brightness > 180);
    setErrorMsg(null);
  };

  return (
    <div
      onClick={() => onSelectTeam(system.id)}
      className={`group relative p-3.5 rounded-2xl transition-all cursor-pointer border-[3px] ${isSelected ? 'bg-zinc-50/50 shadow-sm' : 'bg-white hover:border-zinc-200/50'
        }`}
      style={{
        borderColor: isSelected
          ? system.color
          : (isActive ? `${system.color}50` : 'transparent')
      }}
    >
      {isEditing && (
        <div className="mb-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <h3 className="text-[9px] font-black uppercase tracking-[0.1em] text-darkDelegation">Edit Team</h3>
            </div>
            <button onClick={handleCloseEdit} className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400">
              <X size={14} strokeWidth={3} />
            </button>
          </div>
          {errorMsg && (
            <div className="flex items-center justify-between gap-2 p-2 bg-red-50 border border-red-100 rounded-xl mb-2">
              <p className="text-[9px] font-bold text-red-600 leading-tight uppercase tracking-tight">
                {errorMsg}
              </p>
              {showDeleteConfirm && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); setErrorMsg(null); }} className="px-2 py-0.5 bg-white border border-red-100 text-red-400 rounded-md text-[8px] font-black uppercase tracking-wider">Cancel</button>
                  <button onClick={confirmDelete} className="px-2 py-0.5 bg-red-500 text-white rounded-md text-[8px] font-black uppercase tracking-wider">OK</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isSelected && !isEditing && (
        <button
          onClick={(e) => { e.stopPropagation(); onModeChange('edit'); }}
          className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-darkDelegation text-[9px] font-black uppercase tracking-widest transition-all opacity-0 group-hover:opacity-100 z-10"
        >
          <Edit2 size={12} strokeWidth={2.5} />
          Edit Team
        </button>
      )}

      <div className="flex flex-col">
        {/* Header Row: Badge + Name/Type */}
        <div className="flex items-start gap-3.5 mb-3">
          {!isEditing && (
            <div className="relative shrink-0">
              <div
                className="h-9 px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-black/5"
                style={{ backgroundColor: system.color }}
              >
                <Users size={14} className="text-white opacity-90" strokeWidth={3} />
                <span className="text-xs font-black text-white leading-none">
                  {agentCount}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            {isEditing ? (
              <div className="space-y-1 mb-2">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Team Color</label>
                <div className="px-1">
                  <ColorPicker
                    color={localEditData.color || '#A855F7'}
                    onChange={handleColorChange}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <h4 className={`text-[11px] font-black leading-tight uppercase tracking-wider truncate mb-0.5 ${system.teamName ? 'text-darkDelegation' : 'text-zinc-300'}`}>{system.teamName || 'Untitled Team'}</h4>
                <p className={`text-[9px] font-bold uppercase tracking-[0.1em] ${system.teamType ? 'text-zinc-400' : 'text-zinc-200'}`}>{system.teamType || 'Unspecified Type'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Body Content: Spans full width */}
        <div className="flex flex-col flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2 mb-3" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-1">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Team Name</label>
                <input
                  value={localEditData.teamName || ''}
                  onChange={(e) => { setLocalEditData(prev => ({ ...prev, teamName: e.target.value })); setErrorMsg(null); }}
                  className="w-full bg-white border border-zinc-100 text-[13px] font-medium rounded-xl px-2.5 py-1.5 outline-none transition-colors"
                  style={{ '--tw-focus-border-color': USER_COLOR } as React.CSSProperties}
                  onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                  onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Team Type</label>
                <input
                  value={localEditData.teamType || ''}
                  onChange={(e) => { setLocalEditData(prev => ({ ...prev, teamType: e.target.value })); setErrorMsg(null); }}
                  className="w-full bg-white border border-zinc-100 text-[13px] font-medium rounded-xl px-2.5 py-1.5 outline-none transition-colors"
                  onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                  onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Description</label>
                <textarea
                  value={localEditData.teamDescription || ''}
                  onChange={(e) => { setLocalEditData(prev => ({ ...prev, teamDescription: e.target.value })); setErrorMsg(null); }}
                  className="w-full bg-white border border-zinc-100 text-[13px] font-medium rounded-xl p-2.5 outline-none resize-none h-20 leading-snug transition-colors"
                  onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                  onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Lead Agent Provider</label>
                <select
                  value={localEditData.provider || (localEditData.leadAgentModel?.startsWith('gemini') ? 'gemini' : 'openai')}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalEditData(prev => {
                      if (val === 'gemini' && !prev.leadAgentModel?.startsWith('gemini')) {
                        return { ...prev, provider: val, leadAgentModel: 'gemini-3-flash-preview' };
                      }
                      return { ...prev, provider: val };
                    });
                  }}
                  className="w-full bg-white border border-zinc-100 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer lowercase"
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Lead Agent Model</label>
                <div className="space-y-1.5">
                  {(localEditData.provider || 'openai') === 'openai' ? (
                    <>
                      <input
                        type="text"
                        value={localEditData.leadAgentModel || ''}
                        onChange={(e) => {
                          setLocalEditData(prev => ({ ...prev, leadAgentModel: e.target.value }));
                        }}
                        placeholder="Model name (e.g. qwen2.5-7b, llama-3-8b)"
                        className="w-full bg-white border border-zinc-100 text-[11px] font-medium rounded-xl px-2.5 py-1.5 outline-none transition-colors"
                        onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                        onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                      />
                      <input
                        type="text"
                        value={localEditData.leadAgentBaseUrl ?? ''}
                        onChange={(e) => setLocalEditData(prev => ({ ...prev, leadAgentBaseUrl: e.target.value }))}
                        placeholder="Base URL (e.g. http://localhost:1234/v1)"
                        className="w-full bg-white border border-zinc-100 text-[10px] font-medium rounded-xl px-2.5 py-1.5 outline-none transition-colors"
                        onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                        onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                      />
                      <input
                        type="password"
                        value={localEditData.leadAgentApiKey ?? ''}
                        onChange={(e) => setLocalEditData(prev => ({ ...prev, leadAgentApiKey: e.target.value }))}
                        placeholder="API Key (e.g. lm-studio)"
                        className="w-full bg-white border border-zinc-100 text-[10px] font-medium rounded-xl px-2.5 py-1.5 outline-none transition-colors"
                        onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                        onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                      />
                    </>
                  ) : (
                    <select
                      value={localEditData.leadAgentModel || 'gemini-3-flash-preview'}
                      onChange={(e) => setLocalEditData(prev => ({ ...prev, leadAgentModel: e.target.value }))}
                      className="w-full bg-white border border-zinc-100 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer lowercase"
                    >
                      {(AVAILABLE_MODELS.text as readonly string[]).filter(m => m.startsWith('gemini') || m === 'custom-local').map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Output Type</label>
                  <select
                    value={localEditData.outputType || 'text'}
                    onChange={(e) => {
                      const newType = e.target.value as keyof typeof DEFAULT_MODELS;
                      setLocalEditData(prev => ({
                        ...prev,
                        outputType: newType,
                        outputModel: DEFAULT_MODELS[newType] || prev.outputModel,
                        outputAutoApprove: newType === 'text'
                      }));
                    }}
                    className="w-full bg-white border border-zinc-100 text-[11px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
                  >
                    <option value="text">TEXT</option>
                    <option value="image">IMAGE</option>
                    <option value="music">MUSIC</option>
                    <option value="video">VIDEO</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black uppercase text-zinc-400 ml-1">Output Model</label>
                  <div className="space-y-1.5">
                    <select
                      value={localEditData.outputModel ? ((!((AVAILABLE_MODELS[localEditData.outputType as ModelType] || []) as readonly string[]).includes(localEditData.outputModel) || localEditData.outputModel === 'custom-local') ? 'custom-local' : localEditData.outputModel) : DEFAULT_MODELS.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom-local') {
                          setLocalEditData(prev => ({ ...prev, outputModel: 'custom-local' }));
                        } else {
                          setLocalEditData(prev => ({ ...prev, outputModel: val }));
                        }
                      }}
                      className="w-full bg-white border border-zinc-100 text-[10px] font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer lowercase"
                    >
                      {(AVAILABLE_MODELS[localEditData.outputType as ModelType] || []).map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                      {!((AVAILABLE_MODELS[localEditData.outputType as ModelType] || []) as readonly string[]).includes('custom-local') && (
                        <option value="custom-local">custom-local</option>
                      )}
                    </select>
                    {(localEditData.outputModel && (!((AVAILABLE_MODELS[localEditData.outputType as ModelType] || []) as readonly string[]).includes(localEditData.outputModel) || localEditData.outputModel === 'custom-local')) && (
                      <input
                        type="text"
                        value={localEditData.outputModel === 'custom-local' ? '' : localEditData.outputModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLocalEditData(prev => ({ ...prev, outputModel: val || 'custom-local' }));
                        }}
                        placeholder="Enter custom model name"
                        className="w-full bg-white border border-zinc-100 text-[10px] font-medium rounded-xl px-2.5 py-1 outline-none transition-colors"
                        onFocus={(e) => e.target.style.borderColor = USER_COLOR}
                        onBlur={(e) => e.target.style.borderColor = '#f4f4f5'}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-100/50 rounded-xl mt-0.5">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black uppercase text-darkDelegation tracking-wider">Auto-Approve Output</span>
                    <InfoBubble text="When enabled, the team will generate the final asset immediately after finishing all tasks without waiting for your review." />
                  </div>
                  <span className="text-[7px] text-zinc-400 font-bold leading-tight">Generate asset without review</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalEditData(prev => ({ ...prev, outputAutoApprove: !prev.outputAutoApprove }))}
                  className={`w-8 h-4 rounded-full transition-all relative ${localEditData.outputAutoApprove !== false ? 'bg-darkDelegation shadow-[0_0_8px_rgba(0,0,0,0.15)]' : 'bg-zinc-200'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${localEditData.outputAutoApprove !== false ? 'left-[16px]' : 'left-[4px]'}`} />
                </button>
              </div>

              <button onClick={handleSave} disabled={!isFormValid} className={`w-full py-2.5 mt-1 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all shadow-lg ${isFormValid ? 'bg-darkDelegation text-white shadow-black/10' : 'bg-zinc-50 text-zinc-300 shadow-none cursor-not-allowed'}`}>Save Changes</button>
            </div>
          ) : (
            <div className="space-y-0.5 mb-2.5 px-2">
              <TeamOutputBadge system={system} className="mt-1" />

              <p className={`text-[10px] leading-relaxed font-medium mt-2 line-clamp-2 ${system.teamDescription ? 'text-zinc-500/80' : 'text-zinc-300 italic'}`}>{system.teamDescription || 'No description provided.'}</p>
            </div>
          )}

          <div className={`flex items-center justify-between mt-auto pt-2 ${isEditing ? 'border-t border-zinc-100/30' : ''}`}>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 text-[8px] font-black text-zinc-400 rounded-lg">
              <Users size={10} strokeWidth={3} />
              {agentCount} {agentCount === 1 ? 'AGENT' : 'AGENTS'}
            </div>
            <div className="flex items-center gap-2">
              {isActive && !isEditing && (
                <div className="px-2 py-0.5 rounded-full text-white text-[7px] font-black uppercase tracking-[0.15em]" style={{ backgroundColor: system.color }}>Active</div>
              )}
              {isSelected && !isActive && !isEditing && (
                <button onClick={handleSwitch} className="px-3 py-1.5 bg-darkDelegation text-white rounded-full text-[9px] font-black uppercase tracking-wider shadow-md">Switch</button>
              )}
              {isEditing && (
                <button onClick={handleDelete} className="flex items-center gap-1.5 px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all">
                  <Trash2 size={12} />
                  Delete Team
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
