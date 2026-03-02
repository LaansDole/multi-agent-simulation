<template>
  <div class="spatial-canvas-wrapper" ref="wrapperRef">
    <canvas ref="canvasRef" class="spatial-canvas"></canvas>

    <!-- HTML overlay for emote text badges -->
    <div class="emote-overlay" ref="emoteOverlayRef">
      <div
        v-for="badge in visibleBadges"
        :key="badge.nodeId"
        class="emote-badge"
        :style="badge.style"
      >
        {{ badge.text }}
      </div>
    </div>

    <SpatialControls
      :current-speed="currentSpeed"
      :save-status="saveStatus"
      @reset-layout="resetLayout"
      @speed-change="onSpeedChange"
      @save-layout="onSaveLayout"
      @import-config="onImportConfig"
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
import { ref, reactive, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { Application, Container, Sprite, Graphics, Text, TextStyle, Assets, Rectangle, Circle } from 'pixi.js'
import {
  useSpatialLayout,
  isInteractiveNode,
  AGENT_STATUS,
  STATUS_COLORS,
  STATUS_PULSE,
  COMMUNICATION_ANIMATION_DISTANCE,
  MIN_MEETING_GAP,
  MIN_AGENT_SEPARATION
} from '../composables/useSpatialLayout.js'
import { useSpatialConfig } from '../composables/useSpatialConfig.js'
import { spriteFetcher } from '../utils/spriteFetcher.js'
import { createPathfinder } from '../utils/pathfinding.js'
import SpatialControls from './SpatialControls.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  activeNodes: { type: Array, default: () => [] },
  workflowFile: { type: String, default: '' },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['agent-selected', 'obstacle-selected', 'canvas-click', 'canvas-mousemove', 'config-changed'])

const wrapperRef = ref(null)
const canvasRef = ref(null)
const emoteOverlayRef = ref(null)

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
  setAgentMessage,
  getAgentEmote,
  setSpeed,
  getSpeedValue,
  addTrailParticle,
  cleanupTrailParticles,
  enqueueAnimation,
  dequeueAnimation,
  getStaggerDelay
} = useSpatialLayout()

let app = null
let gridGraphics = null
let trailGraphics = null
let connectionGraphics = null
let agentContainer = null
let obstacleContainer = null
let agentSprites = new Map()  // nodeId -> { container, sprite, label, glow, emoteText, interactive }
let obstacleSprites = new Map()  // obstacleId -> { container, graphics, shape, data, selected }
let selectedObstacleId = ref(null)
let showDeleteConfirm = ref(false)
let showImportConfirm = ref(false)
let pendingImportConfig = ref('')
let animatingAgents = new Map()
let pathfinder = null
let resizeObserver = null
let queueTimerId = null

const GRID_SIZE = 40
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3.0
const ZOOM_STEP = 0.1
let currentZoom = 1.0

let saveDebounceTimer = null

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function checkAgentCollision(obstacleX, obstacleY, shape, size) {
  const collisionRadius = 30
  let obstacleRadius

  if (shape === 'rectangle') {
    const width = size.width || 50
    const height = size.height || 50
    obstacleRadius = Math.sqrt(width * width + height * height) / 2
  } else {
    obstacleRadius = size.radius || 25
  }

  for (const [, ag] of agentSprites) {
    if (!ag.interactive) continue
    const dx = ag.container.x - obstacleX
    const dy = ag.container.y - obstacleY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < obstacleRadius + collisionRadius) {
      return true
    }
  }
  return false
}

// Reactive badges for HTML overlay
const visibleBadges = reactive([])

// Selected obstacle info
const selectedObstacle = computed(() => {
  if (!selectedObstacleId.value) return null
  const obs = obstacleSprites.get(selectedObstacleId.value)
  return obs?.data || null
})

const obstacleTooltipStyle = computed(() => {
  if (!selectedObstacle.value || !app?.renderer) {
    return { display: 'none' }
  }
  const obs = obstacleSprites.get(selectedObstacleId.value)
  if (!obs) return { display: 'none' }

  const canvasRect = canvasRef.value?.getBoundingClientRect()
  if (!canvasRect) return { display: 'none' }

  const scaleX = canvasRect.width / app.renderer.width
  const scaleY = canvasRect.height / app.renderer.height

  const bounds = obs.container.getBounds()
  const left = (bounds.x + bounds.width / 2) * scaleX
  const top = bounds.y * scaleY - 10

  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

// ───────── PIXI APP LIFECYCLE ─────────

async function initPixi() {
  if (app) return

  const wrapper = wrapperRef.value
  const canvas = canvasRef.value
  if (!wrapper || !canvas) return

  const width = wrapper.clientWidth || 800
  const height = wrapper.clientHeight || 600

  app = new Application()
  await app.init({
    canvas,
    width,
    height,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  })

  // Grid layer (bottommost)
  gridGraphics = new Graphics()
  app.stage.addChild(gridGraphics)
  drawGrid()

  // Obstacle layer (between grid and agents)
  obstacleContainer = new Container()
  app.stage.addChild(obstacleContainer)

  // Add background click handler for deselection
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', (e) => {
    if (e.target === app.stage) {
      deselectObstacle()
      // Emit canvas click coordinates for obstacle placement
      const worldPos = app.stage.toLocal(e.global)
      emit('canvas-click', { x: worldPos.x, y: worldPos.y })
    }
  })

  // Track mouse movement for obstacle preview
  app.stage.on('pointermove', (e) => {
    const worldPos = app.stage.toLocal(e.global)
    emit('canvas-mousemove', { x: worldPos.x, y: worldPos.y })
  })

  // Trail particles layer
  trailGraphics = new Graphics()
  app.stage.addChild(trailGraphics)

  // Connection lines layer
  connectionGraphics = new Graphics()
  app.stage.addChild(connectionGraphics)

  // Agent container (on top)
  agentContainer = new Container()
  app.stage.addChild(agentContainer)

  app.ticker.add(renderLoop)

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width: w, height: h } = entry.contentRect
      if (w > 0 && h > 0 && app?.renderer) {
        app.renderer.resize(w, h)
        drawGrid()
        drawObstacles()
        initPathfinder(w, h)
      }
    }
  })
  resizeObserver.observe(wrapper)

  // Scroll-wheel zoom
  canvas.addEventListener('wheel', handleWheel, { passive: false })

  buildScene()
  initPathfinder(width, height)
}

function initPathfinder(width, height) {
  const config = spatialConfig.value
  const obstacles = config?.obstacles || []
  pathfinder = createPathfinder({ width, height, cellSize: GRID_SIZE, obstacles })
}

function destroyPixi() {
  if (queueTimerId) {
    clearTimeout(queueTimerId)
    queueTimerId = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  const canvas = canvasRef.value
  if (canvas) {
    canvas.removeEventListener('wheel', handleWheel)
  }
  agentSprites.clear()
  obstacleSprites.clear()
  animatingAgents.clear()
  visibleBadges.splice(0)
  selectedObstacleId.value = null
  currentZoom = 1.0
  if (app) {
    app.destroy(true, { children: true })
    app = null
    agentContainer = null
    obstacleContainer = null
    connectionGraphics = null
    trailGraphics = null
    gridGraphics = null
  }
}

// ───────── ZOOM ─────────

function handleWheel(e) {
  e.preventDefault()
  if (!app?.stage) return

  const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta))
  if (newZoom === currentZoom) return

  // Get mouse position relative to canvas
  const rect = canvasRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  // Adjust stage position to zoom toward cursor
  const stage = app.stage
  const worldX = (mouseX - stage.x) / currentZoom
  const worldY = (mouseY - stage.y) / currentZoom

  currentZoom = newZoom
  stage.scale.set(currentZoom, currentZoom)
  stage.x = mouseX - worldX * currentZoom
  stage.y = mouseY - worldY * currentZoom
}

// ───────── BACKGROUND GRID ─────────

function drawGrid() {
  if (!gridGraphics || !app?.renderer) return
  gridGraphics.clear()

  const w = app.renderer.width
  const h = app.renderer.height

  for (let x = 0; x <= w; x += GRID_SIZE) {
    gridGraphics.moveTo(x, 0)
    gridGraphics.lineTo(x, h)
  }
  for (let y = 0; y <= h; y += GRID_SIZE) {
    gridGraphics.moveTo(0, y)
    gridGraphics.lineTo(w, y)
  }
  gridGraphics.stroke({ width: 1, color: 0x2a2a4a, alpha: 0.3 })
}

// ───────── OBSTACLES ─────────

/**
 * Parse a hex color string to integer.
 * @param {string} hex - Hex color string (e.g., '#ff0000')
 * @returns {number} Color as integer
 */
function parseHexColor(hex) {
  if (!hex || typeof hex !== 'string') return 0x666666
  const cleanHex = hex.replace('#', '')
  return parseInt(cleanHex, 16)
}

/**
 * Get alpha value based on obstacle type.
 * @param {string} type - Obstacle type (wall, furniture, decoration)
 * @returns {number} Alpha value (0-1)
 */
function getObstacleAlpha(type) {
  switch (type) {
    case 'wall':
      return 1.0
    case 'furniture':
      return 0.6
    case 'decoration':
      return 0.4
    default:
      return 0.7
  }
}

async function drawObstacles() {
  if (!obstacleContainer || !app?.renderer) return

  // Clear selection when redrawing
  selectedObstacleId.value = null

  // Clear existing obstacles
  obstacleContainer.removeChildren()
  obstacleSprites.clear()

  const config = spatialConfig.value
  const obstacles = config?.obstacles || []
  if (!obstacles.length) return

  const obstaclePromises = obstacles.map(async (obstacle) => {
    const { id, shape, position, size, color, type, sprite: spriteFile } = obstacle
    if (!shape || !position || !size) return

    const alpha = getObstacleAlpha(type)
    const colorInt = parseHexColor(color)

    const obstacleGroup = new Container()
    obstacleGroup.x = position.x
    obstacleGroup.y = position.y
    obstacleGroup.eventMode = 'static'
    obstacleGroup.cursor = 'pointer'

    const graphics = new Graphics()
    let sprite = null

    if (spriteFile) {
      try {
        const spritePath = `/sprites/obstacles/${spriteFile}`
        const texture = await Assets.load(spritePath)
        
        if (texture) {
          sprite = new Sprite(texture)
          
          if (shape === 'rectangle') {
            const width = size.width || 50
            const height = size.height || 50
            sprite.width = width
            sprite.height = height
          } else if (shape === 'circle') {
            const radius = size.radius || 25
            const diameter = radius * 2
            sprite.width = diameter
            sprite.height = diameter
            sprite.anchor.set(0.5, 0.5)
            sprite.x = 0
            sprite.y = 0
          }
          
          obstacleGroup.addChild(sprite)
        }
      } catch (error) {
        console.warn(`Failed to load sprite for obstacle ${id}:`, error)
        sprite = null
      }
    }

    if (!sprite) {
      if (shape === 'rectangle') {
        const width = size.width || 50
        const height = size.height || 50

        graphics.rect(0, 0, width, height)
        graphics.fill({ color: colorInt, alpha })

        graphics.rect(0, 0, width, height)
        graphics.stroke({ width: 2, color: colorInt, alpha: alpha * 0.8 })

        obstacleGroup.hitArea = new Rectangle(0, 0, width, height)
      } else if (shape === 'circle') {
        const radius = size.radius || 25

        graphics.circle(0, 0, radius)
        graphics.fill({ color: colorInt, alpha })

        graphics.circle(0, 0, radius)
        graphics.stroke({ width: 2, color: colorInt, alpha: alpha * 0.8 })

        obstacleGroup.hitArea = new Circle(0, 0, radius)
      }

      obstacleGroup.addChild(graphics)
    } else {
      if (shape === 'rectangle') {
        const width = size.width || 50
        const height = size.height || 50
        obstacleGroup.hitArea = new Rectangle(0, 0, width, height)
      } else if (shape === 'circle') {
        const radius = size.radius || 25
        obstacleGroup.hitArea = new Circle(0, 0, radius)
      }
    }

    // Selection highlight (initially hidden)
    const highlight = new Graphics()
    highlight.visible = false
    obstacleGroup.addChild(highlight)

    // Click handler
    obstacleGroup.on('pointerdown', (e) => {
      e.stopPropagation()
      selectObstacle(id, obstacle, obstacleGroup, highlight, graphics, shape, size)
    })

    // Drag handler
    setupObstacleDrag(obstacleGroup, id, shape, size, graphics, highlight)

    obstacleContainer.addChild(obstacleGroup)

    obstacleSprites.set(id, {
      container: obstacleGroup,
      graphics,
      highlight,
      shape,
      data: obstacle
    })
  })

  await Promise.all(obstaclePromises)
}

function selectObstacle(id, obstacleData, container, highlight, graphics, shape, size) {
  // Deselect previous
  if (selectedObstacleId.value && selectedObstacleId.value !== id) {
    const prev = obstacleSprites.get(selectedObstacleId.value)
    if (prev) {
      prev.highlight.visible = false
    }
  }

  // Toggle selection
  if (selectedObstacleId.value === id) {
    selectedObstacleId.value = null
    highlight.visible = false
    emit('obstacle-selected', null)
  } else {
    selectedObstacleId.value = id

    // Draw highlight
    highlight.clear()
    const glowColor = 0x818cf8

    if (shape === 'rectangle') {
      const width = size.width || 50
      const height = size.height || 50
      const padding = 6

      highlight.rect(-padding, -padding, width + padding * 2, height + padding * 2)
      highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

      highlight.rect(-padding - 2, -padding - 2, width + padding * 2 + 4, height + padding * 2 + 4)
      highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
    } else if (shape === 'circle') {
      const radius = size.radius || 25
      const padding = 6

      highlight.circle(0, 0, radius + padding)
      highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

      highlight.circle(0, 0, radius + padding + 3)
      highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
    }

    highlight.visible = true
    emit('obstacle-selected', obstacleData)
  }
}

function deselectObstacle() {
  if (selectedObstacleId.value) {
    const prev = obstacleSprites.get(selectedObstacleId.value)
    if (prev) {
      prev.highlight.visible = false
    }
    selectedObstacleId.value = null
    emit('obstacle-selected', null)
  }
}

function handleKeyDown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObstacleId.value) {
    e.preventDefault()
    executeDeleteObstacle()
  }
}

function confirmDeleteObstacle() {
  if (!selectedObstacleId.value) return

  const obstacle = obstacleSprites.get(selectedObstacleId.value)
  if (!obstacle) return

  const { shape, data } = obstacle
  let isLarge = false

  if (shape === 'rectangle') {
    const width = data.size?.width || 50
    const height = data.size?.height || 50
    isLarge = width > 100 || height > 100
  } else if (shape === 'circle') {
    const radius = data.size?.radius || 25
    isLarge = radius > 50
  }

  if (isLarge) {
    showDeleteConfirm.value = true
  } else {
    executeDeleteObstacle()
  }
}

function executeDeleteObstacle() {
  if (!selectedObstacleId.value) return

  const obstacleId = selectedObstacleId.value

  const obstacle = obstacleSprites.get(obstacleId)
  if (obstacle && obstacleContainer) {
    obstacleContainer.removeChild(obstacle.container)
    obstacleSprites.delete(obstacleId)
  }

  removeObstacle(obstacleId)

  selectedObstacleId.value = null
  showDeleteConfirm.value = false

  if (app?.renderer) {
    initPathfinder(app.renderer.width, app.renderer.height)
  }

  emit('obstacle-selected', null)
  emit('config-changed', spatialConfig.value)
}

// ───────── SCENE BUILDING ─────────

function buildScene() {
  if (!app || !agentContainer) return

  agentContainer.removeChildren()
  agentSprites.clear()
  visibleBadges.splice(0)

  const nodes = props.nodes || []
  const edges = props.edges || []
  if (!nodes.length) return

  const width = app.renderer?.width || 800
  const height = app.renderer?.height || 600

  const loaded = loadPositions(normalizeWorkflowName(props.workflowFile))
  if (!loaded) {
    const obstacles = spatialConfig.value?.obstacles || []
    computeLayout(nodes, edges, width, height, obstacles)
  }

  nodes.forEach(node => {
    const interactive = isInteractiveNode(node)
    if (interactive) {
      createInteractiveSprite(node)
    } else {
      createStaticMarker(node)
    }
  })
}

/**
 * Create a full interactive agent sprite (agent/human nodes).
 */
async function createInteractiveSprite(node) {
  if (!agentContainer) return

  const pos = agentPositions.value.get(node.id) || { x: 400, y: 300 }

  const agentGroup = new Container()
  agentGroup.x = pos.x
  agentGroup.y = pos.y
  agentGroup.eventMode = 'static'
  agentGroup.cursor = 'pointer'

  // Status glow
  const glow = new Graphics()
  const status = getAgentStatus(node.id)
  drawStatusGlow(glow, status)
  agentGroup.addChild(glow)

  // Load sprite
  const spritePath = spriteFetcher.fetchSprite(node.id, 'D', 1)
  let texture
  try {
    texture = await Assets.load(spritePath)
  } catch {
    texture = null
  }

  let sprite
  if (texture) {
    sprite = new Sprite(texture)
    sprite.anchor.set(0.5, 0.5)
    sprite.width = 40
    sprite.height = 48
  } else {
    sprite = new Graphics()
    sprite.circle(0, 0, 20)
    sprite.fill(0x6366f1)
  }
  agentGroup.addChild(sprite)

  // Name label
  const label = new Text({
    text: node.id,
    style: new TextStyle({
      fontSize: 11,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: 0xffffff,
      align: 'center',
      fontWeight: '500'
    })
  })
  label.anchor.set(0.5, 0)
  label.y = 28
  agentGroup.addChild(label)

  // Emoji emote text (PixiJS, hidden by default)
  const emoteText = new Text({
    text: '',
    style: new TextStyle({
      fontSize: 24,
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif',
      align: 'center'
    })
  })
  emoteText.anchor.set(0.5, 1)
  emoteText.y = -42
  emoteText.visible = false
  agentGroup.addChild(emoteText)

  // Drag-and-drop
  setupDrag(agentGroup, node.id)

  // Click to open agent info panel
  agentGroup.on('pointerdown', () => {
    emit('agent-selected', { nodeId: node.id, node })
  })

  agentContainer.addChild(agentGroup)

  agentSprites.set(node.id, {
    container: agentGroup,
    sprite,
    label,
    glow,
    emoteText,
    interactive: true
  })
}

/**
 * Create a small static marker for non-agent nodes.
 */
function createStaticMarker(node) {
  if (!agentContainer) return

  const pos = agentPositions.value.get(node.id) || { x: 400, y: 300 }

  const markerGroup = new Container()
  markerGroup.x = pos.x
  markerGroup.y = pos.y
  markerGroup.eventMode = 'static'
  markerGroup.cursor = 'move'

  // Small diamond shape
  const shape = new Graphics()
  shape.moveTo(0, -8)
  shape.lineTo(8, 0)
  shape.lineTo(0, 8)
  shape.lineTo(-8, 0)
  shape.closePath()
  shape.fill({ color: 0x4b5563, alpha: 0.6 })
  shape.stroke({ width: 1, color: 0x6b7280, alpha: 0.4 })
  markerGroup.addChild(shape)

  // Smaller muted label
  const label = new Text({
    text: node.id,
    style: new TextStyle({
      fontSize: 9,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: 0x9ca3af,
      align: 'center',
      fontWeight: '400'
    })
  })
  label.anchor.set(0.5, 0)
  label.y = 12
  markerGroup.addChild(label)

  // Draggable
  setupDrag(markerGroup, node.id)

  agentContainer.addChild(markerGroup)

  agentSprites.set(node.id, {
    container: markerGroup,
    sprite: shape,
    label,
    glow: null,
    emoteText: null,
    interactive: false
  })
}

// ───────── DRAG SETUP ─────────

function setupDrag(container, nodeId) {
  let dragging = false
  let dragOffset = { x: 0, y: 0 }

  container.on('pointerdown', (e) => {
    dragging = true
    container.cursor = 'grabbing'
    const globalPos = e.global
    dragOffset.x = container.x - globalPos.x
    dragOffset.y = container.y - globalPos.y
    container.alpha = 0.85
    agentContainer.setChildIndex(container, agentContainer.children.length - 1)
  })

  container.on('globalpointermove', (e) => {
    if (!dragging) return
    const globalPos = e.global
    container.x = globalPos.x + dragOffset.x
    container.y = globalPos.y + dragOffset.y
  })

  const onPointerUp = () => {
    if (!dragging) return
    dragging = false
    const ag = agentSprites.get(nodeId)
    container.cursor = ag?.interactive ? 'pointer' : 'move'
    container.alpha = 1
    setAgentPosition(nodeId, container.x, container.y)
  }

  container.on('pointerup', onPointerUp)
  container.on('pointerupoutside', onPointerUp)
}

// ───────── OBSTACLE DRAG SETUP ─────────

function setupObstacleDrag(container, obstacleId, shape, size, graphics, highlight) {
  let dragging = false
  let dragPending = false
  let dragStartPos = { x: 0, y: 0 }
  let dragOffset = { x: 0, y: 0 }
  const DRAG_THRESHOLD = 5

  container.on('pointerdown', (e) => {
    // Record start position but don't start drag yet
    dragPending = true
    dragging = false
    const globalPos = e.global
    dragStartPos.x = globalPos.x
    dragStartPos.y = globalPos.y
    dragOffset.x = container.x - globalPos.x
    dragOffset.y = container.y - globalPos.y
  })

  container.on('globalpointermove', (e) => {
    if (!dragPending && !dragging) return
    const globalPos = e.global

    // Check if movement exceeds threshold to start actual drag
    if (dragPending && !dragging) {
      const dx = globalPos.x - dragStartPos.x
      const dy = globalPos.y - dragStartPos.y
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

      // Threshold exceeded — start actual drag
      dragging = true
      dragPending = false
      container.cursor = 'grabbing'
      container.alpha = 0.85
      obstacleContainer.setChildIndex(container, obstacleContainer.children.length - 1)

      // Hide tooltip during drag by deselecting
      selectedObstacleId.value = null
    }

    if (!dragging) return

    let newX = globalPos.x + dragOffset.x
    let newY = globalPos.y + dragOffset.y

    newX = snapToGrid(newX)
    newY = snapToGrid(newY)

    container.x = newX
    container.y = newY

    const hasCollision = checkAgentCollision(newX, newY, shape, size)

    highlight.clear()
    const glowColor = hasCollision ? 0xef4444 : 0x818cf8

    if (shape === 'rectangle') {
      const width = size.width || 50
      const height = size.height || 50
      const padding = 6

      highlight.rect(-padding, -padding, width + padding * 2, height + padding * 2)
      highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

      highlight.rect(-padding - 2, -padding - 2, width + padding * 2 + 4, height + padding * 2 + 4)
      highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
    } else if (shape === 'circle') {
      const radius = size.radius || 25
      const padding = 6

      highlight.circle(0, 0, radius + padding)
      highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

      highlight.circle(0, 0, radius + padding + 3)
      highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
    }

    highlight.visible = true
  })

  const onPointerUp = () => {
    const wasDragging = dragging
    dragging = false
    dragPending = false

    if (wasDragging) {
      // Actual drag occurred — finalize position
      container.cursor = 'pointer'
      container.alpha = 1

      const snappedX = snapToGrid(container.x)
      const snappedY = snapToGrid(container.y)

      updateObstaclePosition(obstacleId, { x: snappedX, y: snappedY })
      initPathfinder(app.renderer.width, app.renderer.height)
      scheduleConfigSave()

      highlight.clear()
      highlight.visible = false
    }
    // If no drag occurred (just a click), do nothing here —
    // selectObstacle() already ran on pointerdown, keeping the tooltip visible
  }

  container.on('pointerup', onPointerUp)
  container.on('pointerupoutside', onPointerUp)
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

// ───────── STATUS GLOW ─────────

function drawStatusGlow(glow, status) {
  glow.clear()
  const color = STATUS_COLORS[status] || STATUS_COLORS[AGENT_STATUS.IDLE]
  const alpha = status === AGENT_STATUS.IDLE ? 0.15 : 0.35
  glow.circle(0, 0, 28)
  glow.fill({ color, alpha })
}

// ───────── RENDER LOOP ─────────

function renderLoop() {
  updateActiveStates()
  updateAnimations()
  applyPerFrameSeparation()
  updateEmotes()
  drawTrailParticles()
  drawConnections()
  cleanupConnections()
  cleanupTrailParticles()
}

function updateActiveStates() {
  agentSprites.forEach((ag, nodeId) => {
    if (!ag.interactive || !ag.glow) return

    const status = getAgentStatus(nodeId)
    const color = STATUS_COLORS[status] || STATUS_COLORS[AGENT_STATUS.IDLE]
    const pulseSpeed = STATUS_PULSE[status] || 0

    ag.glow.clear()
    if (pulseSpeed > 0) {
      const pulse = 0.25 + 0.15 * Math.sin(Date.now() / (300 / pulseSpeed))
      ag.glow.circle(0, 0, 28)
      ag.glow.fill({ color, alpha: pulse })

      const scale = 1 + 0.04 * Math.sin(Date.now() / (300 / pulseSpeed))
      ag.container.scale.set(scale, scale)
    } else {
      ag.glow.circle(0, 0, 28)
      ag.glow.fill({ color, alpha: 0.15 })
      ag.container.scale.set(1, 1)
    }
  })
}

function updateAnimations() {
  const now = Date.now()
  const toRemove = []

  animatingAgents.forEach((anim, nodeId) => {
    const ag = agentSprites.get(nodeId)
    if (!ag) {
      toRemove.push(nodeId)
      return
    }

    const elapsed = now - anim.startTime
    const progress = Math.min(elapsed / anim.duration, 1)

    const path = anim.path || []
    let currentX, currentY

    if (progress < 0.5) {
      const moveProgress = progress * 2
      currentX = getPositionAlongPath(path, moveProgress, false).x
      currentY = getPositionAlongPath(path, moveProgress, false).y
    } else {
      const returnProgress = (progress - 0.5) * 2
      currentX = getPositionAlongPath(path, returnProgress, true).x
      currentY = getPositionAlongPath(path, returnProgress, true).y
    }

    const prevX = ag.container.x
    const prevY = ag.container.y
    ag.container.x = currentX
    ag.container.y = currentY

    if (!anim.lastTrailTime || now - anim.lastTrailTime > 100) {
      addTrailParticle(ag.container.x, ag.container.y, 0x818cf8)
      anim.lastTrailTime = now
    }

    const frameIndex = Math.floor(elapsed / 250) % 4
    let targetFrame
    if (frameIndex === 0 || frameIndex === 2) targetFrame = 1
    else if (frameIndex === 1) targetFrame = 2
    else targetFrame = 3

    let direction = 'D'
    const moveX = currentX - prevX
    const moveY = currentY - prevY
    if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
      if (Math.abs(moveX) > Math.abs(moveY)) {
        direction = moveX > 0 ? 'R' : 'L'
      } else {
        direction = moveY > 0 ? 'D' : 'U'
      }
    }

    if (anim.currentFrame !== targetFrame || anim.currentDirection !== direction) {
      anim.currentFrame = targetFrame
      anim.currentDirection = direction
      const newSpritePath = spriteFetcher.fetchSprite(nodeId, direction, targetFrame)
      Assets.load(newSpritePath).then(tex => {
        if (ag.sprite instanceof Sprite) {
          ag.sprite.texture = tex
        }
      }).catch(() => {})
    }

    if (progress >= 1) {
      toRemove.push(nodeId)
      const origPos = agentPositions.value.get(nodeId)
      if (origPos) {
        ag.container.x = origPos.x
        ag.container.y = origPos.y
      }
      const idlePath = spriteFetcher.fetchSprite(nodeId, 'D', 1)
      Assets.load(idlePath).then(tex => {
        if (ag.sprite instanceof Sprite) {
          ag.sprite.texture = tex
        }
      }).catch(() => {})
    }
  })

  toRemove.forEach(id => animatingAgents.delete(id))
}

/**
 * Get position along a path at given progress (0-1).
 * @param {Array<{x: number, y: number}>} path - Array of waypoints
 * @param {number} progress - Progress value 0-1
 * @param {boolean} reverse - Whether to traverse path in reverse
 * @returns {{x: number, y: number}} Interpolated position
 */
function getPositionAlongPath(path, progress, reverse) {
  if (!path || path.length === 0) {
    return { x: 0, y: 0 }
  }

  const workingPath = reverse ? [...path].reverse() : path

  if (workingPath.length === 1) {
    return workingPath[0]
  }

  const totalSegments = workingPath.length - 1
  const scaledProgress = progress * totalSegments
  const segmentIndex = Math.min(Math.floor(scaledProgress), totalSegments - 1)
  const segmentProgress = scaledProgress - segmentIndex
  const eased = easeInOutQuad(segmentProgress)

  const start = workingPath[segmentIndex]
  const end = workingPath[segmentIndex + 1]

  return {
    x: start.x + (end.x - start.x) * eased,
    y: start.y + (end.y - start.y) * eased
  }
}

/**
 * Per-frame separation force: push animating agents apart
 * when they come within MIN_AGENT_SEPARATION of each other.
 */
function applyPerFrameSeparation() {
  const ids = Array.from(animatingAgents.keys())
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const agA = agentSprites.get(ids[i])
      const agB = agentSprites.get(ids[j])
      if (!agA || !agB) continue

      const dx = agA.container.x - agB.container.x
      const dy = agA.container.y - agB.container.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < MIN_AGENT_SEPARATION && dist > 0) {
        // Push apart along the line between them
        const overlap = (MIN_AGENT_SEPARATION - dist) / 2
        const nx = dx / dist
        const ny = dy / dist
        agA.container.x += nx * overlap
        agA.container.y += ny * overlap
        agB.container.x -= nx * overlap
        agB.container.y -= ny * overlap
      }
    }
  }
}

/**
 * Update emote visuals: emoji bubbles (PixiJS) + text badges (HTML overlay)
 */
function updateEmotes() {
  const newBadges = []

  agentSprites.forEach((ag, nodeId) => {
    if (!ag.interactive || !ag.emoteText) return

    const emote = getAgentEmote(nodeId)

    if (emote && emote.emoji) {
      ag.emoteText.text = emote.emoji
      ag.emoteText.visible = true
    } else {
      ag.emoteText.visible = false
    }

    // Collect text badges for HTML overlay
    if (emote && emote.badge) {
      const canvasRect = canvasRef.value?.getBoundingClientRect()
      if (canvasRect && app?.renderer) {
        // Convert PixiJS coords to screen coords
        const scaleX = canvasRect.width / app.renderer.width
        const scaleY = canvasRect.height / app.renderer.height
        const screenX = ag.container.x * scaleX
        const screenY = (ag.container.y - 80) * scaleY
        newBadges.push({
          nodeId,
          text: emote.badge,
          style: {
            left: `${screenX}px`,
            top: `${screenY}px`,
            transform: 'translateX(-50%)'
          }
        })
      }
    }
  })

  // Update reactive badges array
  visibleBadges.splice(0, visibleBadges.length, ...newBadges)
}

function drawTrailParticles() {
  if (!trailGraphics) return
  trailGraphics.clear()

  const now = Date.now()
  trailParticles.value.forEach(p => {
    const age = now - p.createdAt
    const lifeProgress = Math.min(age / 600, 1)
    const alpha = p.opacity * (1 - lifeProgress)
    const size = p.size * (1 - lifeProgress * 0.5)

    if (alpha > 0.01) {
      trailGraphics.circle(p.x, p.y, size)
      trailGraphics.fill({ color: p.color, alpha })
    }
  })
}

function drawConnections() {
  if (!connectionGraphics) return

  connectionGraphics.clear()
  const now = Date.now()

  activeConnections.value.forEach(conn => {
    const sourceAg = agentSprites.get(conn.source)
    const targetAg = agentSprites.get(conn.target)
    if (!sourceAg || !targetAg) return

    const elapsed = now - conn.startTime
    const progress = Math.min(elapsed / conn.duration, 1)
    const alpha = progress < 0.7 ? 0.6 : 0.6 * (1 - (progress - 0.7) / 0.3)

    const sx = sourceAg.container.x
    const sy = sourceAg.container.y
    const tx = targetAg.container.x
    const ty = targetAg.container.y

    connectionGraphics.moveTo(sx, sy)
    connectionGraphics.lineTo(tx, ty)
    connectionGraphics.stroke({ width: 3, color: 0x818cf8, alpha })

    // Arrow at midpoint
    const mx = (sx + tx) / 2
    const my = (sy + ty) / 2
    const angle = Math.atan2(ty - sy, tx - sx)
    const arrowSize = 8

    connectionGraphics.moveTo(mx + arrowSize * Math.cos(angle), my + arrowSize * Math.sin(angle))
    connectionGraphics.lineTo(mx + arrowSize * Math.cos(angle + 2.5), my + arrowSize * Math.sin(angle + 2.5))
    connectionGraphics.moveTo(mx + arrowSize * Math.cos(angle), my + arrowSize * Math.sin(angle))
    connectionGraphics.lineTo(mx + arrowSize * Math.cos(angle - 2.5), my + arrowSize * Math.sin(angle - 2.5))
    connectionGraphics.stroke({ width: 2, color: 0x818cf8, alpha })

    // Animated particle
    const particleProgress = (elapsed % 1000) / 1000
    const px = sx + (tx - sx) * particleProgress
    const py = sy + (ty - sy) * particleProgress
    connectionGraphics.circle(px, py, 4)
    connectionGraphics.fill({ color: 0xc4b5fd, alpha: alpha * 1.2 })
  })
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// ───────── MIDLINE-CLAMPED MEETING POINTS ─────────

/**
 * Calculate meeting points that never cross the midline.
 * Each agent's meeting point is clamped so they stop before the midpoint.
 */
function calculateMeetingPoints(sx, sy, tx, ty) {
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 1) {
    return {
      sourceMeet: { x: sx, y: sy },
      targetMeet: { x: tx, y: ty }
    }
  }

  // Each agent can move at most to (midpoint - minGap/2)
  const maxMove = Math.max(0, dist / 2 - MIN_MEETING_GAP / 2)
  const desiredMove = dist * COMMUNICATION_ANIMATION_DISTANCE
  const actualMove = Math.min(desiredMove, maxMove)
  const ratio = actualMove / dist

  return {
    sourceMeet: {
      x: sx + dx * ratio,
      y: sy + dy * ratio
    },
    targetMeet: {
      x: tx - dx * ratio,
      y: ty - dy * ratio
    }
  }
}

// ───────── ANIMATION QUEUE PROCESSOR ─────────

function processAnimationQueue() {
  const item = dequeueAnimation()
  if (!item) {
    isProcessingQueue.value = false
    return
  }

  isProcessingQueue.value = true
  executeCommunicationAnimation(item.sourceId, item.targetId)

  queueTimerId = setTimeout(() => {
    processAnimationQueue()
  }, getStaggerDelay())
}

function startQueueProcessing() {
  if (isProcessingQueue.value) return
  processAnimationQueue()
}

// ───────── PUBLIC API ─────────

function triggerCommunication(sourceId, targetId) {
  const sourceAg = agentSprites.get(sourceId)
  const targetAg = agentSprites.get(targetId)
  if (!sourceAg || !targetAg) return
  if (!sourceAg.interactive && !targetAg.interactive) return

  enqueueAnimation(sourceId, targetId)
  startQueueProcessing()
}

function executeCommunicationAnimation(sourceId, targetId) {
  const sourceAg = agentSprites.get(sourceId)
  const targetAg = agentSprites.get(targetId)
  if (!sourceAg || !targetAg) return

  const sx = sourceAg.container.x
  const sy = sourceAg.container.y
  const tx = targetAg.container.x
  const ty = targetAg.container.y

  // Use midline-clamped meeting points
  let { sourceMeet, targetMeet } = calculateMeetingPoints(sx, sy, tx, ty)

  // Adjust meeting points if they fall inside obstacles
  if (pathfinder) {
    if (pathfinder.isBlocked(sourceMeet.x, sourceMeet.y)) {
      sourceMeet = pathfinder.findNearestUnblocked(sourceMeet.x, sourceMeet.y)
    }
    if (pathfinder.isBlocked(targetMeet.x, targetMeet.y)) {
      targetMeet = pathfinder.findNearestUnblocked(targetMeet.x, targetMeet.y)
    }
  }

  // Calculate paths from start to meeting points using pathfinding
  let sourcePath = [{ x: sx, y: sy }, { x: sourceMeet.x, y: sourceMeet.y }]
  let targetPath = [{ x: tx, y: ty }, { x: targetMeet.x, y: targetMeet.y }]

  if (pathfinder) {
    const srcPath = pathfinder.findPath(sx, sy, sourceMeet.x, sourceMeet.y)
    if (srcPath && srcPath.length > 0) {
      sourcePath = srcPath
    }
    const tgtPath = pathfinder.findPath(tx, ty, targetMeet.x, targetMeet.y)
    if (tgtPath && tgtPath.length > 0) {
      targetPath = tgtPath
    }
  }

  // Calculate total path distance for duration
  const calcPathDistance = (path) => {
    let dist = 0
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x
      const dy = path[i].y - path[i - 1].y
      dist += Math.sqrt(dx * dx + dy * dy)
    }
    return dist
  }

  const sourceDistance = calcPathDistance(sourcePath)
  const targetDistance = calcPathDistance(targetPath)
  const maxDistance = Math.max(sourceDistance, targetDistance)

  const speed = getSpeedValue()
  const duration = Math.max(1500, Math.min(maxDistance / speed, 6000))

  if (sourceAg.interactive) {
    setAgentStatus(sourceId, AGENT_STATUS.COMMUNICATING)
    animatingAgents.set(sourceId, {
      startTime: Date.now(),
      duration,
      startX: sx,
      startY: sy,
      meetX: sourceMeet.x,
      meetY: sourceMeet.y,
      path: sourcePath,
      pathIndex: 0,
      currentFrame: 1,
      lastTrailTime: 0
    })
  }

  if (targetAg.interactive) {
    setAgentStatus(targetId, AGENT_STATUS.COMMUNICATING)
    animatingAgents.set(targetId, {
      startTime: Date.now(),
      duration,
      startX: tx,
      startY: ty,
      meetX: targetMeet.x,
      meetY: targetMeet.y,
      path: targetPath,
      pathIndex: 0,
      currentFrame: 1,
      lastTrailTime: 0
    })
  }

  addConnection(sourceId, targetId, duration)

  setTimeout(() => {
    if (sourceAg.interactive && getAgentStatus(sourceId) === AGENT_STATUS.COMMUNICATING) {
      setAgentStatus(sourceId, AGENT_STATUS.IDLE)
    }
    if (targetAg.interactive && getAgentStatus(targetId) === AGENT_STATUS.COMMUNICATING) {
      setAgentStatus(targetId, AGENT_STATUS.IDLE)
    }
  }, duration)
}

function updateAgentStatus(agentId, status) {
  const ag = agentSprites.get(agentId)
  if (ag && ag.interactive) {
    setAgentStatus(agentId, status)
  }
}

function updateAgentMessage(agentId, message) {
  const ag = agentSprites.get(agentId)
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
  drawObstacles()

  if (app?.renderer) {
    initPathfinder(app.renderer.width, app.renderer.height)
  }

  emit('config-changed', spatialConfig.value)
  pendingImportConfig.value = ''
}

function resetLayout() {
  const nodes = props.nodes || []
  const edges = props.edges || []
  resetPositions(nodes, edges)

  // Reset zoom
  if (app?.stage) {
    currentZoom = 1.0
    app.stage.scale.set(1, 1)
    app.stage.x = 0
    app.stage.y = 0
  }

  agentSprites.forEach((ag, nodeId) => {
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
  if (props.visible && app) {
    buildScene()
  }
}, { deep: true })

watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await nextTick()
    if (!app) {
      await initPixi()
      await loadConfig(normalizeWorkflowName(props.workflowFile))
      drawObstacles()
    } else {
      await loadConfig(normalizeWorkflowName(props.workflowFile))
      buildScene()
      drawObstacles()
      const wrapper = wrapperRef.value
      if (wrapper && app?.renderer) {
        app.renderer.resize(wrapper.clientWidth, wrapper.clientHeight)
        drawGrid()
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
  if (props.visible && app) {
    deselectObstacle()
    await loadConfig(normalizeWorkflowName(props.workflowFile))
    buildScene()
  }
})

// Watch for config changes to re-render obstacles
watch(() => spatialConfig.value, () => {
  if (props.visible && app) {
    drawObstacles()
    if (app.renderer?.width && app.renderer?.height) {
      initPathfinder(app.renderer.width, app.renderer.height)
    }
  }
}, { deep: true })

// ───────── LIFECYCLE ─────────

onMounted(async () => {
  if (props.visible) {
    await nextTick()
    await initPixi()
    await loadConfig(normalizeWorkflowName(props.workflowFile))
    drawObstacles()
  }
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
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

.spatial-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.emote-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.emote-badge {
  position: absolute;
  background: rgba(30, 30, 58, 0.92);
  border: 1px solid rgba(129, 140, 248, 0.5);
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  color: #e0e7ff;
  white-space: nowrap;
  pointer-events: none;
  animation: badgeFadeIn 0.25s ease-out;
}

@keyframes badgeFadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
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
