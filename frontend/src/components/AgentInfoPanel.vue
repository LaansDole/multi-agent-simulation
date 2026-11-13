<template>
  <transition name="panel-slide">
    <div v-if="agent" class="agent-info-panel">
      <div class="panel-header">
        <div class="agent-header-row">
          <img
            v-if="avatarSrc"
            :src="avatarSrc"
            class="agent-avatar"
            :alt="agent.nodeId"
          />
          <div class="agent-identity">
            <span class="agent-name">{{ agent.nodeId }}</span>
            <span class="agent-type">{{ agent.node?.type || 'unknown' }}</span>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-label">Status</div>
        <div class="status-row">
          <span class="status-dot" :style="{ background: statusColor }"></span>
          <span class="status-text">{{ statusLabel }}</span>
        </div>
      </div>

      <div v-if="agentDescription" class="panel-section">
        <div class="section-label">Description</div>
        <div class="description-text">{{ agentDescription }}</div>
      </div>

      <div v-if="agentRole" class="panel-section">
        <div class="section-label" @click="roleExpanded = !roleExpanded" style="cursor: pointer;">
          Role
          <span class="expand-icon">{{ roleExpanded ? '▾' : '▸' }}</span>
        </div>
        <div v-show="roleExpanded" class="role-text">{{ agentRole }}</div>
        <div v-show="!roleExpanded" class="role-preview">{{ rolePreview }}</div>
      </div>

      <div v-if="currentEmote" class="panel-section">
        <div class="section-label">Current Emote</div>
        <div class="emote-display">
          <span class="emote-emoji">{{ currentEmote.emoji }}</span>
          <span v-if="currentEmote.badge" class="emote-badge-text">{{ currentEmote.badge }}</span>
        </div>
      </div>

      <div class="panel-section output-section">
        <div class="section-label">Output History</div>
        <div class="output-list" ref="outputListRef">
          <div
            v-for="(entry, idx) in outputHistory"
            :key="idx"
            class="output-entry"
          >
            <div class="output-time">{{ formatTime(entry.timestamp) }}</div>
            <div class="output-text">{{ entry.text }}</div>
          </div>
          <div v-if="!outputHistory.length" class="output-empty">
            No output yet
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <button class="close-btn-footer" @click="$emit('close')" title="Close panel">
          ✕ Close Panel
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, watch, nextTick, ref } from 'vue'
import {
  useSpatialLayout,
  AGENT_STATUS,
  STATUS_COLORS
} from '../composables/useSpatialLayout.js'
import { spriteFetcher } from '../utils/spriteFetcher.js'

const props = defineProps({
  agent: { type: Object, default: null }
})

defineEmits(['close'])

const outputListRef = ref(null)
const roleExpanded = ref(false)

const {
  getAgentStatus,
  getAgentEmote,
  getAgentOutputHistory
} = useSpatialLayout()

const avatarSrc = computed(() => {
  if (!props.agent) return null
  return spriteFetcher.fetchSprite(props.agent.nodeId, 'D', 1)
})

const agentDescription = computed(() => {
  return props.agent?.node?.description || ''
})

const agentRole = computed(() => {
  return props.agent?.node?.config?.role || ''
})

const rolePreview = computed(() => {
  const role = agentRole.value
  if (!role) return ''
  const firstLine = role.split('\n')[0].trim()
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
})

const statusLabel = computed(() => {
  if (!props.agent) return 'Unknown'
  const s = getAgentStatus(props.agent.nodeId)
  return s.charAt(0).toUpperCase() + s.slice(1)
})

const statusColor = computed(() => {
  if (!props.agent) return '#6b7280'
  const s = getAgentStatus(props.agent.nodeId)
  const hex = STATUS_COLORS[s] || STATUS_COLORS[AGENT_STATUS.IDLE]
  return '#' + hex.toString(16).padStart(6, '0')
})

const currentEmote = computed(() => {
  if (!props.agent) return null
  return getAgentEmote(props.agent.nodeId)
})

const outputHistory = computed(() => {
  if (!props.agent) return []
  return getAgentOutputHistory(props.agent.nodeId)
})

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Reset role expanded state when switching agents
watch(() => props.agent?.nodeId, () => {
  roleExpanded.value = false
})

// Auto-scroll to bottom when new output arrives
watch(outputHistory, async () => {
  await nextTick()
  if (outputListRef.value) {
    outputListRef.value.scrollTop = outputListRef.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.agent-info-panel {
  width: 300px;
  height: 100%;
  background: #12122a;
  border-left: 1px solid rgba(129, 140, 248, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(129, 140, 248, 0.15);
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(129, 140, 248, 0.15);
}

.close-btn-footer {
  width: 100%;
  padding: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #9ca3af;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
}

.close-btn-footer:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.agent-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agent-avatar {
  width: 40px;
  height: 48px;
  image-rendering: pixelated;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
}

.agent-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: 15px;
  font-weight: 600;
  color: #e0e7ff;
}

.agent-type {
  font-size: 11px;
  color: #818cf8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #9ca3af;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #e0e7ff;
}

.panel-section {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(129, 140, 248, 0.08);
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.expand-icon {
  font-size: 9px;
  color: #818cf8;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 13px;
  color: #d1d5db;
}

.description-text {
  font-size: 12px;
  color: #d1d5db;
  line-height: 1.5;
}

.role-text {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 160px;
  overflow-y: auto;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.role-text::-webkit-scrollbar {
  width: 3px;
}

.role-text::-webkit-scrollbar-thumb {
  background: rgba(129, 140, 248, 0.2);
  border-radius: 2px;
}

.role-preview {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
  cursor: pointer;
}

.emote-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.emote-emoji {
  font-size: 20px;
}

.emote-badge-text {
  font-size: 12px;
  color: #c4b5fd;
  font-style: italic;
}

.output-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: none;
}

.output-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.output-list::-webkit-scrollbar {
  width: 4px;
}

.output-list::-webkit-scrollbar-thumb {
  background: rgba(129, 140, 248, 0.3);
  border-radius: 2px;
}

.output-entry {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border-left: 2px solid rgba(129, 140, 248, 0.3);
}

.output-time {
  font-size: 9px;
  color: #6b7280;
  margin-bottom: 3px;
}

.output-text {
  font-size: 12px;
  color: #d1d5db;
  line-height: 1.5;
  word-break: break-word;
}

.output-empty {
  font-size: 12px;
  color: #4b5563;
  font-style: italic;
  text-align: center;
  padding: 16px;
}

/* Slide transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
