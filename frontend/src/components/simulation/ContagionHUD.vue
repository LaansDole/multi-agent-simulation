<template>
  <div class="contagion-hud" v-if="visible">
    <div class="hud-title">
      <span>☣ Outbreak Sandbox</span>
      <button
        class="debug-toggle-btn"
        :class="{ active: debugEnabled }"
        @click="$emit('toggle-debug')"
        title="Toggle debug log"
      >🪲</button>
    </div>
    <div class="hud-stats">
      <div class="stat-item healthy">
        <span class="stat-icon">💚</span>
        <span class="stat-value">{{ stats.healthy }}</span>
        <span class="stat-label">Healthy</span>
      </div>
      <div class="stat-item infected">
        <span class="stat-icon">🔴</span>
        <span class="stat-value">{{ stats.infected }}</span>
        <span class="stat-label">Infected</span>
      </div>
      <div class="stat-item recovered">
        <span class="stat-icon">🔵</span>
        <span class="stat-value">{{ stats.recovered }}</span>
        <span class="stat-label">Recovered</span>
      </div>
      <div class="stat-item deceased">
        <span class="stat-icon">⚫</span>
        <span class="stat-value">{{ stats.deceased }}</span>
        <span class="stat-label">Deceased</span>
      </div>
    </div>
    <div class="hud-timer">⏱ {{ formattedTime }}</div>
    <SimulationControls
      :visible="visible"
      :is-playing="isPlaying"
      @play="$emit('play')"
      @pause="$emit('pause')"
      @step="$emit('step')"
      @reset="$emit('reset')"
    />
    <!-- Sandbox interaction mode selector -->
    <div class="tool-mode-selector">
      <span class="tool-mode-label">Tool</span>
      <div class="tool-mode-buttons">
        <button
          class="tool-mode-button"
          :class="{ selected: interactionMode === 'pointer' }"
          @click="$emit('update:interaction-mode', 'pointer')"
          title="Select / Drag agents"
        >
          🖱️ Pointer
        </button>
        <button
          class="tool-mode-button"
          :class="{ selected: interactionMode === 'infect' }"
          @click="$emit('update:interaction-mode', 'infect')"
          title="Click to infect"
        >
          🦠 Infect
        </button>
        <button
          class="tool-mode-button"
          :class="{ selected: interactionMode === 'cure' }"
          @click="$emit('update:interaction-mode', 'cure')"
          title="Click to cure"
        >
          💊 Cure
        </button>
      </div>
    </div>
    <!-- Debug log panel -->
    <div v-if="debugEnabled" class="debug-log-panel">
      <div class="debug-log-header">
        <span class="debug-log-title">Debug Log</span>
        <button class="debug-clear-btn" @click="$emit('clear-log')" title="Clear log">✕</button>
      </div>
      <div class="debug-log-entries" ref="logScrollRef">
        <div
          v-for="(entry, idx) in displayLog"
          :key="idx"
          class="debug-log-entry"
          :class="`log-${entry.category}`"
        >
          <span class="log-time">{{ formatLogTime(entry.ts) }}</span>
          <span class="log-cat">[{{ entry.category }}]</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
        <div v-if="!displayLog.length" class="debug-log-empty">No log entries yet</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import SimulationControls from './SimulationControls.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  stats: {
    type: Object,
    default: () => ({ healthy: 0, infected: 0, recovered: 0, deceased: 0 })
  },
  elapsedTimeMs: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  debugEnabled: { type: Boolean, default: false },
  contagionLog: { type: Array, default: () => [] },
  interactionMode: { type: String, default: 'pointer' }
})

defineEmits(['play', 'pause', 'step', 'reset', 'toggle-debug', 'clear-log', 'update:interaction-mode'])

const logScrollRef = ref(null)

const formattedTime = computed(() => {
  const totalSeconds = Math.floor(props.elapsedTimeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const displayLog = computed(() => {
  // Show last 50 entries, newest at bottom
  return props.contagionLog.slice(-50)
})

function formatLogTime(ts) {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

// Auto-scroll to bottom when new entries arrive
watch(() => props.contagionLog.length, async () => {
  await nextTick()
  if (logScrollRef.value) {
    logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight
  }
})
</script>

<style scoped>
.contagion-hud {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 12px 16px;
  background: rgba(15, 15, 25, 0.9);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  min-width: 180px;
  z-index: 20;
}

.hud-title {
  font-size: 13px;
  font-weight: 600;
  color: #ef4444;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.debug-toggle-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;
}

.debug-toggle-btn:hover {
  opacity: 0.8;
  border-color: rgba(255, 255, 255, 0.3);
}

.debug-toggle-btn.active {
  opacity: 1;
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
}

.hud-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.stat-icon {
  font-size: 10px;
  width: 16px;
  text-align: center;
}

.stat-value {
  font-weight: 700;
  font-size: 14px;
  min-width: 28px;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  color: #94a3b8;
  font-size: 11px;
}

.stat-item.healthy .stat-value { color: #22c55e; }
.stat-item.infected .stat-value { color: #ef4444; }
.stat-item.recovered .stat-value { color: #3b82f6; }
.stat-item.deceased .stat-value { color: #6b7280; }

.hud-timer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

/* ── Debug log panel ── */
.debug-log-panel {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(245, 158, 11, 0.3);
}

.debug-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.debug-log-title {
  font-size: 11px;
  font-weight: 600;
  color: #f59e0b;
  letter-spacing: 0.3px;
}

.debug-clear-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.debug-clear-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.debug-log-entries {
  max-height: 200px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 10px;
  line-height: 1.5;
}

.debug-log-entries::-webkit-scrollbar {
  width: 4px;
}

.debug-log-entries::-webkit-scrollbar-track {
  background: transparent;
}

.debug-log-entries::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.debug-log-entry {
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-time {
  color: #4b5563;
  margin-right: 4px;
}

.log-cat {
  font-weight: 600;
  margin-right: 4px;
}

.log-msg {
  color: #d1d5db;
}

/* Category colors */
.log-lifecycle .log-cat { color: #818cf8; }
.log-infection .log-cat { color: #ef4444; }
.log-tick .log-cat { color: #22c55e; }
.log-tick-skip .log-cat { color: #6b7280; }
.log-heartbeat .log-cat { color: #06b6d4; }
.log-snapshot .log-cat { color: #f59e0b; }

.debug-log-empty {
  color: #4b5563;
  font-style: italic;
  padding: 4px 0;
}

/* ── Tool mode selector ── */
.tool-mode-selector {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-mode-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.3px;
  display: block;
  margin-bottom: 6px;
}

.tool-mode-buttons {
  display: flex;
  gap: 4px;
}

.tool-mode-button {
  flex: 1;
  padding: 5px 6px;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tool-mode-button:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: #e0e7ff;
}

.tool-mode-button.selected {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  font-weight: 600;
}
</style>
