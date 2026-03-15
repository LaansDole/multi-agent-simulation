<template>
  <div class="spatial-canvas-wrapper" ref="wrapperRef">
    <canvas ref="canvasRef" class="spatial-canvas"></canvas>



    <SpatialControls
      :current-speed="currentSpeed"
      :save-status="saveStatus"
      :sandbox-mode="sandboxMode"
      @reset-layout="resetLayout"
      @speed-change="onSpeedChange"
      @save-layout="onSaveLayout"
      @import-config="onImportConfig"
      @sandbox-toggle="onSandboxToggle"
    />

    <!-- Contagion Sandbox UI -->
    <ContagionHUD
      :visible="sandboxMode"
      :stats="contagionStats"
      :elapsed-time-ms="contagionElapsedTimeMs"
      :is-playing="simulationRunning && !simulationPaused"
      :debug-enabled="contagionDebugEnabled"
      :contagion-log="contagionLogEntries"
      @play="contagionPlay"
      @pause="contagionPause"
      @step="contagionStep"
      @reset="contagionReset"
      @toggle-debug="contagionToggleDebug"
      @clear-log="contagionClearLog"
    />

    <!-- Obstacle info tooltip -->
    <div
      v-if="selectedObstacle"
      class="obstacle-tooltip"
      :style="obstacleTooltipStyle"
    >
      <div class="obstacle-tooltip-header">
        <span class="obstacle-tooltip-name">{{ selectedObstacle.id }}</span>
        <button class="obstacle-delete-btn" @click.stop="executeDeleteObstacle" title="Delete obstacle">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="obstacle-tooltip-row">
        <span class="obstacle-tooltip-label">Type:</span>
        <span class="obstacle-tooltip-value">{{ selectedObstacle.type }}</span>
      </div>
      <div class="obstacle-tooltip-row">
        <span class="obstacle-tooltip-label">Shape:</span>
        <span class="obstacle-tooltip-value">{{ selectedObstacle.shape }}</span>
      </div>
      <div class="obstacle-tooltip-row">
        <span class="obstacle-tooltip-label">Collision:</span>
        <span class="obstacle-tooltip-value">{{ selectedObstacle.collision ? 'Yes' : 'No' }}</span>
      </div>
    </div>

    <!-- Import config confirmation dialog -->
    <div v-if="showImportConfirm" class="delete-confirm-overlay" @click="showImportConfirm = false">
      <div class="delete-confirm-dialog" @click.stop>
        <div class="delete-confirm-title" style="color: #818cf8;">Import Config?</div>
        <div class="delete-confirm-message">
          This will replace all current obstacles with the "{{ pendingImportConfig }}" layout. Continue?
        </div>
        <div class="delete-confirm-actions">
          <button class="delete-confirm-cancel" @click="showImportConfirm = false">Cancel</button>
          <button class="delete-confirm-delete" style="background: #6366f1;" @click="executeImportConfig">Import</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, markRaw, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { Application, Container, Sprite, Graphics, Text, TextStyle, Assets, Rectangle, Circle } from 'pixi.js'
import {
  useSpatialLayout,
  isInteractiveNode,
  AGENT_STATUS,
  STATUS_COLORS,
  STATUS_PULSE,
  CONDITION_COLORS,
  CONDITION_PULSE,
  COMMUNICATION_ANIMATION_DISTANCE,
  MIN_MEETING_GAP,
  MIN_AGENT_SEPARATION
} from '../composables/useSpatialLayout.js'
import { useSpatialConfig } from '../composables/useSpatialConfig.js'
import { useObstacleManager } from '../composables/spatial/useObstacleManager.js'
import { useFloorManager } from '../composables/spatial/useFloorManager.js'
import { useIdleWander } from '../composables/spatial/useIdleWander.js'
import { useCommunicationAnimation } from '../composables/spatial/useCommunicationAnimation.js'
import { useAnimationLoop } from '../composables/spatial/useAnimationLoop.js'
import { useAgentRenderer } from '../composables/spatial/useAgentRenderer.js'
import { usePixiApp } from '../composables/spatial/usePixiApp.js'
import { spriteFetcher } from '../utils/spriteFetcher.js'
import { createPathfinder } from '../utils/pathfinding.js'
import { useContagionEngine } from '../composables/spatial/useContagionEngine.js'
import SpatialControls from './SpatialControls.vue'
import ContagionHUD from './simulation/ContagionHUD.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  activeNodes: { type: Array, default: () => [] },
  workflowFile: { type: String, default: '' },
  visible: { type: Boolean, default: false },
  obstacleEditorRef: { type: Object, default: null }
})

const emit = defineEmits(['agent-selected', 'obstacle-selected', 'canvas-click', 'canvas-drag-start', 'canvas-drag', 'canvas-drag-end', 'config-changed'])

const wrapperRef = ref(null)
const canvasRef = ref(null)


const {
  config: spatialConfig,
  loadConfig,
  updateObstaclePosition,
  removeObstacle,
  saveConfig,
  downloadConfig,
  saveStatus,
  markConfigChanged
} = useSpatialConfig()

const {
  agentPositions,
  activeConnections,
  trailParticles,
  currentSpeed,
  isProcessingQueue,
  computeLayout,
  setAgentPosition,
  loadPositions,
  resetPositions,
  addConnection,
  cleanupConnections,
  setAgentStatus,
  getAgentStatus,
  getAgentCondition,
  setAgentMessage,
  getAgentEmote,
  setSpeed,
  getSpeedValue,
  addTrailParticle,
  cleanupTrailParticles,
  enqueueAnimation,
  dequeueAnimation,
  getStaggerDelay,
  setNodeTypes
} = useSpatialLayout()

// ───────── SHARED CANVAS CONTEXT ─────────
// Reactive context object shared across all spatial composables.
const ctx = reactive({
  app: null,
  gridGraphics: null,
  trailGraphics: null,
  connectionGraphics: null,
  agentContainer: null,
  obstacleContainer: null,
  floorContainer: null,
  placementGhostGraphics: null,
  agentSprites: markRaw(new Map()),
  obstacleSprites: markRaw(new Map()),
  animatingAgents: markRaw(new Map()),
  pathfinder: null,
  spatialConfig
})

let showImportConfirm = ref(false)
let pendingImportConfig = ref('')

// Convenience aliases for backward-compatible access
const getApp = () => ctx.app
const getAgentSprites = () => ctx.agentSprites
const getAnimatingAgents = () => ctx.animatingAgents



const GRID_SIZE = 40



let saveDebounceTimer = null

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}



// ───────── OBSTACLE MANAGER COMPOSABLE ─────────
const spatialConfigForObstacles = {
  get value() { return spatialConfig.value },
  updateObstaclePosition,
  removeObstacle
}

const {
  selectedObstacleId,
  selectedObstacle,
  obstacleTooltipStyle,
  showDeleteConfirm,
  drawObstacles,
  deselectObstacle,
  executeDeleteObstacle,
  updatePlacementGhost: obstacleUpdatePlacementGhost,
  cleanup: cleanupObstacles
} = useObstacleManager({
  ctx,
  canvasRef,
  spatialConfig: spatialConfigForObstacles,
  emit,
  initPathfinder,
  scheduleConfigSave,
  snapToGrid
})

// ───────── FLOOR MANAGER COMPOSABLE ─────────
const {
  drawFloors,
  updateContaminationOverlays,
  cleanup: cleanupFloors
} = useFloorManager({
  ctx
})

// ───────── CONTAGION ENGINE COMPOSABLE ─────────
const {
  sandboxMode,
  simulationRunning,
  simulationPaused,
  elapsedTimeMs: contagionElapsedTimeMs,
  stats: contagionStats,
  debugEnabled: contagionDebugEnabled,
  contagionLog: contagionLogEntries,
  toggleSandboxMode,
  play: contagionPlay,
  pause: contagionPause,
  stepSimulation: contagionStep,
  resetSimulation: contagionReset,
  seedInfection,
  updateContagion,
  toggleDebugLog: contagionToggleDebug,
  clearLog: contagionClearLog
} = useContagionEngine()

function onSandboxToggle() {
  toggleSandboxMode()
}

// ───────── IDLE WANDER COMPOSABLE ─────────
const {
  buildEdgeAdjacency,
  initIdleWanderTimers,
  resetWanderCooldown,
  updateIdleWanders,
  cleanup: cleanupIdleWander
} = useIdleWander({
  ctx,
  getAgentStatus,
  getSpeedValue,
  agentPositions,
  AGENT_STATUS_IDLE: AGENT_STATUS.IDLE
})

// ───────── COMMUNICATION ANIMATION COMPOSABLE ─────────
const {
  triggerCommunication,
  updateAgentStatus,
  cleanup: cleanupCommunication
} = useCommunicationAnimation({
  ctx,
  getSpeedValue,
  setAgentStatus,
  getAgentStatus,
  enqueueAnimation,
  dequeueAnimation,
  getStaggerDelay,
  addConnection,
  isProcessingQueue,
  agentPositions,
  resetWanderCooldown,
  AGENT_STATUS,
  COMMUNICATION_ANIMATION_DISTANCE,
  MIN_MEETING_GAP
})

// ───────── ANIMATION LOOP COMPOSABLE ─────────
const {
  renderLoop
} = useAnimationLoop({
  ctx,
  canvasRef,
  agentPositions,
  trailParticles,
  activeConnections,
  getAgentStatus,
  getAgentCondition,
  getAgentEmote,
  addTrailParticle,
  cleanupTrailParticles,
  cleanupConnections,
  updateIdleWanders,
  resetWanderCooldown,
  STATUS_COLORS,
  STATUS_PULSE,
  AGENT_STATUS,
  CONDITION_COLORS,
  CONDITION_PULSE,
  MIN_AGENT_SEPARATION,
  updateContagion,
  updateContaminationOverlays,
  sandboxMode
})

// ───────── AGENT RENDERER COMPOSABLE ─────────
const {
  buildScene,
  drawStatusGlow
} = useAgentRenderer({
  ctx,
  props,
  emit,
  agentPositions,
  loadPositions,
  computeLayout,
  setAgentPosition,
  getAgentStatus,
  isInteractiveNode,
  buildEdgeAdjacency,
  initIdleWanderTimers,
  normalizeWorkflowName,
  spatialConfig,
  STATUS_COLORS,
  AGENT_STATUS,
  sandboxMode,
  seedInfection,
  setNodeTypes
})

// ───────── PIXI APP LIFECYCLE COMPOSABLE ─────────
const {
  initPixi,
  destroyPixi,
  drawGrid,
  handleKeyDown,
  handleKeyUp,
  resetZoom
} = usePixiApp({
  ctx,
  wrapperRef,
  canvasRef,
  renderLoop,
  buildScene,
  drawObstacles,
  deselectObstacle,
  obstacleUpdatePlacementGhost,
  cleanupCommunication,
  cleanupObstacles,
  cleanupFloors,
  cleanupIdleWander,
  initPathfinder,
  emit,
  props,
  selectedObstacleId,
  executeDeleteObstacle,
  GRID_SIZE
})


function initPathfinder(width, height) {
  const config = spatialConfig.value
  const obstacles = config?.obstacles || []
  ctx.pathfinder = createPathfinder({ width, height, cellSize: GRID_SIZE, obstacles })
}


function normalizeWorkflowName(name) {
  if (!name) return name
  return name.replace(/\.yaml$/, '')
}

function scheduleConfigSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer)
  }
  saveDebounceTimer = setTimeout(() => {
    markConfigChanged()
    saveConfig()
    emit('config-changed', spatialConfig.value)
  }, 500)
}


function updateAgentMessage(agentId, message) {
  const ag = ctx.agentSprites.get(agentId)
  if (ag && ag.interactive) {
    setAgentMessage(agentId, message)
  }
}

function onSpeedChange(speedId) {
  setSpeed(speedId)
}

async function onSaveLayout(configName) {
  await saveConfig(configName)
}

async function onImportConfig(configName) {
  const config = spatialConfig.value
  const hasObstacles = config?.obstacles?.length > 0

  if (hasObstacles) {
    pendingImportConfig.value = configName
    showImportConfirm.value = true
  } else {
    pendingImportConfig.value = configName
    await executeImportConfig()
  }
}

async function executeImportConfig() {
  showImportConfirm.value = false
  const configName = pendingImportConfig.value
  if (!configName) return

  // Clear localStorage to force re-fetch from server
  try {
    const key = `devall_spatial_${configName}`
    localStorage.removeItem(key)
  } catch (e) {
    // ignore
  }

  // Clear cache and reload config from the JSON file
  const { clearCache } = useSpatialConfig()
  clearCache(configName)
  await loadConfig(configName)
  drawFloors()
  drawObstacles()

  if (ctx.app?.renderer) {
    initPathfinder(ctx.app.renderer.width, ctx.app.renderer.height)
  }

  // Mark as unsaved so the user can explicitly save when ready.
  // Do NOT emit 'config-changed' here — that triggers auto-save to disk.
  markConfigChanged()
  pendingImportConfig.value = ''
}

function resetLayout() {
  const nodes = props.nodes || []
  const edges = props.edges || []
  resetPositions(nodes, edges)

  resetZoom()

  ctx.agentSprites.forEach((ag, nodeId) => {
    const pos = agentPositions.value.get(nodeId)
    if (pos) {
      ag.container.x = pos.x
      ag.container.y = pos.y
    }
  })
}

defineExpose({
  triggerCommunication,
  updateAgentStatus,
  updateAgentMessage,
  resetLayout
})

// ───────── WATCHERS ─────────

watch(() => props.nodes, () => {
  if (props.visible && ctx.app) {
    buildScene()
  }
}, { deep: true })

watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await nextTick()
    if (!ctx.app) {
      await initPixi()
      await loadConfig(normalizeWorkflowName(props.workflowFile))
      drawFloors()
      drawObstacles()
    } else {
      await loadConfig(normalizeWorkflowName(props.workflowFile))
      buildScene()
      drawFloors()
      drawObstacles()
      const wrapper = wrapperRef.value
      if (wrapper && ctx.app?.renderer) {
        ctx.app.renderer.resize(wrapper.clientWidth, wrapper.clientHeight)
        drawGrid()
        drawFloors()
        drawObstacles()
      }
    }
  } else {
    // Auto-save obstacle config before canvas is destroyed on tab switch
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
      saveDebounceTimer = null
    }
    markConfigChanged()
    saveConfig()
  }
})

watch(() => props.workflowFile, async () => {
  if (props.visible && ctx.app) {
    deselectObstacle()
    await loadConfig(normalizeWorkflowName(props.workflowFile))
    buildScene()
  }
})

// Watch for config changes to re-render obstacles
watch(() => spatialConfig.value, () => {
  if (props.visible && ctx.app) {
    drawFloors()
    drawObstacles()
    if (ctx.app.renderer?.width && ctx.app.renderer?.height) {
      initPathfinder(ctx.app.renderer.width, ctx.app.renderer.height)
    }
  }
}, { deep: true })

// ───────── LIFECYCLE ─────────

onMounted(async () => {
  if (props.visible) {
    await nextTick()
    await initPixi()
    await loadConfig(normalizeWorkflowName(props.workflowFile))
    drawFloors()
    drawObstacles()
  }
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  destroyPixi()
})
</script>

<style scoped>
.spatial-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: #1a1a2e;
}

.spatial-canvas-wrapper.pan-ready,
.spatial-canvas-wrapper.pan-ready * {
  cursor: grab !important;
}

.spatial-canvas-wrapper.panning,
.spatial-canvas-wrapper.panning * {
  cursor: grabbing !important;
}

.spatial-canvas {
  display: block;
  width: 100%;
  height: 100%;
}



.obstacle-tooltip {
  position: absolute;
  transform: translateX(-50%) translateY(-100%);
  background: rgba(30, 30, 58, 0.96);
  border: 1px solid rgba(129, 140, 248, 0.6);
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 140px;
  pointer-events: auto;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: tooltipFadeIn 0.2s ease-out;
}

.obstacle-tooltip-header {
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(129, 140, 248, 0.3);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.obstacle-tooltip-name {
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  color: #e0e7ff;
}

.obstacle-delete-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.obstacle-delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.obstacle-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 11px;
}

.obstacle-tooltip-label {
  color: #9ca3af;
  font-family: 'Inter', system-ui, sans-serif;
}

.obstacle-tooltip-value {
  color: #e0e7ff;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
}

@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-100%) translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(-100%);
  }
}

.delete-confirm-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.delete-confirm-dialog {
  background: rgba(30, 30, 58, 0.98);
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 12px;
  padding: 20px 24px;
  min-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.delete-confirm-title {
  font-size: 16px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  color: #ef4444;
  margin-bottom: 12px;
}

.delete-confirm-message {
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  color: #d1d5db;
  margin-bottom: 20px;
  line-height: 1.5;
}

.delete-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.delete-confirm-cancel {
  background: transparent;
  border: 1px solid #4b5563;
  color: #d1d5db;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-confirm-cancel:hover {
  background: rgba(75, 85, 99, 0.3);
  border-color: #6b7280;
}

.delete-confirm-delete {
  background: #ef4444;
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-confirm-delete:hover {
  background: #dc2626;
}
</style>
