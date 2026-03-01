<template>
  <div class="spatial-canvas-wrapper" ref="wrapperRef">
    <canvas ref="canvasRef" class="spatial-canvas"></canvas>
    <SpatialControls @reset-layout="resetLayout" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Application, Container, Sprite, Graphics, Text, TextStyle, Assets } from 'pixi.js'
import { useSpatialLayout } from '../composables/useSpatialLayout.js'
import { spriteFetcher } from '../utils/spriteFetcher.js'
import SpatialControls from './SpatialControls.vue'

const props = defineProps({
  /** @type {Array<{id: string}>} */
  nodes: { type: Array, default: () => [] },
  /** @type {Array<{from: string, to: string}>} */
  edges: { type: Array, default: () => [] },
  /** @type {Array<string>} */
  activeNodes: { type: Array, default: () => [] },
  /** @type {string} */
  workflowFile: { type: String, default: '' },
  /** @type {boolean} */
  visible: { type: Boolean, default: false }
})


const wrapperRef = ref(null)
const canvasRef = ref(null)

const {
  agentPositions,
  activeConnections,
  computeLayout,
  setAgentPosition,
  loadPositions,
  resetPositions,
  addConnection,
  cleanupConnections
} = useSpatialLayout()

let app = null
let agentContainer = null
let connectionGraphics = null
let agentSprites = new Map()  // nodeId -> { container, sprite, label, glow }
let animatingAgents = new Map()  // nodeId -> animation state
let resizeObserver = null

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

  // Connection lines layer (behind agents)
  connectionGraphics = new Graphics()
  app.stage.addChild(connectionGraphics)

  // Agent container (on top)
  agentContainer = new Container()
  app.stage.addChild(agentContainer)

  // Start render ticker
  app.ticker.add(renderLoop)

  // Observe wrapper resize
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width: w, height: h } = entry.contentRect
      if (w > 0 && h > 0 && app?.renderer) {
        app.renderer.resize(w, h)
      }
    }
  })
  resizeObserver.observe(wrapper)

  // Build initial scene
  buildScene()
}

function destroyPixi() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  agentSprites.clear()
  animatingAgents.clear()
  if (app) {
    app.destroy(true, { children: true })
    app = null
    agentContainer = null
    connectionGraphics = null
  }
}

// ───────── SCENE BUILDING ─────────

function buildScene() {
  if (!app || !agentContainer) return

  // Clear existing sprites
  agentContainer.removeChildren()
  agentSprites.clear()

  const nodes = props.nodes || []
  const edges = props.edges || []

  if (!nodes.length) return

  const width = app.renderer?.width || 800
  const height = app.renderer?.height || 600

  // Try to load saved positions, otherwise compute layout
  const loaded = loadPositions(props.workflowFile)
  if (!loaded) {
    computeLayout(nodes, edges, width, height)
  }

  // Create agent sprites
  nodes.forEach(node => {
    createAgentSprite(node)
  })
}

async function createAgentSprite(node) {
  if (!agentContainer) return

  const pos = agentPositions.value.get(node.id) || { x: 400, y: 300 }

  // Agent container (holds sprite + label + glow)
  const agentGroup = new Container()
  agentGroup.x = pos.x
  agentGroup.y = pos.y
  agentGroup.eventMode = 'static'
  agentGroup.cursor = 'grab'

  // Glow/active indicator (circle behind sprite)
  const glow = new Graphics()
  glow.circle(0, 0, 28)
  glow.fill({ color: 0x4ade80, alpha: 0 })
  agentGroup.addChild(glow)

  // Load sprite texture from spriteFetcher path
  const spritePath = spriteFetcher.fetchSprite(node.id, 'D', 1)
  let texture
  try {
    texture = await Assets.load(spritePath)
  } catch {
    // Fallback: draw a colored circle
    texture = null
  }

  let sprite
  if (texture) {
    sprite = new Sprite(texture)
    sprite.anchor.set(0.5, 0.5)
    sprite.width = 40
    sprite.height = 48
  } else {
    // Fallback circle
    sprite = new Graphics()
    sprite.circle(0, 0, 20)
    sprite.fill(0x6366f1)
  }
  agentGroup.addChild(sprite)

  // Name label below
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

  // Drag-and-drop
  let dragging = false
  let dragOffset = { x: 0, y: 0 }

  agentGroup.on('pointerdown', (e) => {
    dragging = true
    agentGroup.cursor = 'grabbing'
    const globalPos = e.global
    dragOffset.x = agentGroup.x - globalPos.x
    dragOffset.y = agentGroup.y - globalPos.y
    agentGroup.alpha = 0.85
    // Bring to front
    agentContainer.setChildIndex(agentGroup, agentContainer.children.length - 1)
  })

  agentGroup.on('globalpointermove', (e) => {
    if (!dragging) return
    const globalPos = e.global
    agentGroup.x = globalPos.x + dragOffset.x
    agentGroup.y = globalPos.y + dragOffset.y
  })

  agentGroup.on('pointerup', () => {
    if (!dragging) return
    dragging = false
    agentGroup.cursor = 'grab'
    agentGroup.alpha = 1
    setAgentPosition(node.id, agentGroup.x, agentGroup.y)
  })

  agentGroup.on('pointerupoutside', () => {
    if (!dragging) return
    dragging = false
    agentGroup.cursor = 'grab'
    agentGroup.alpha = 1
    setAgentPosition(node.id, agentGroup.x, agentGroup.y)
  })

  agentContainer.addChild(agentGroup)

  agentSprites.set(node.id, {
    container: agentGroup,
    sprite,
    label,
    glow
  })
}

// ───────── RENDER LOOP ─────────

function renderLoop() {
  updateActiveStates()
  updateAnimations()
  drawConnections()
  cleanupConnections()
}

function updateActiveStates() {
  const active = new Set(props.activeNodes || [])
  agentSprites.forEach((ag, nodeId) => {
    const isActive = active.has(nodeId)
    ag.glow.clear()
    if (isActive) {
      ag.glow.circle(0, 0, 28)
      ag.glow.fill({ color: 0x4ade80, alpha: 0.35 })
      // Pulse effect
      const pulse = 1 + 0.06 * Math.sin(Date.now() / 300)
      ag.container.scale.set(pulse, pulse)
    } else {
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

    if (progress < 0.5) {
      // Move toward target (first half)
      const moveProgress = progress * 2
      const eased = easeInOutQuad(moveProgress)
      ag.container.x = anim.startX + (anim.targetX - anim.startX) * eased
      ag.container.y = anim.startY + (anim.targetY - anim.startY) * eased
    } else {
      // Return to origin (second half)
      const returnProgress = (progress - 0.5) * 2
      const eased = easeInOutQuad(returnProgress)
      ag.container.x = anim.targetX + (anim.startX - anim.targetX) * eased
      ag.container.y = anim.startY + (anim.startY - anim.targetY) * (1 - eased) + (anim.targetY - anim.startY) * (1 - eased)
      ag.container.x = anim.targetX + (anim.startX - anim.targetX) * eased
      ag.container.y = anim.targetY + (anim.startY - anim.targetY) * eased
    }

    // Update walking sprite frame
    const frameIndex = Math.floor(elapsed / 250) % 4
    let targetFrame
    if (frameIndex === 0 || frameIndex === 2) targetFrame = 1
    else if (frameIndex === 1) targetFrame = 2
    else targetFrame = 3

    if (anim.currentFrame !== targetFrame) {
      anim.currentFrame = targetFrame
      const direction = anim.targetX >= anim.startX ? 'R' : 'L'
      const newSpritePath = spriteFetcher.fetchSprite(nodeId, direction, targetFrame)
      Assets.load(newSpritePath).then(tex => {
        if (ag.sprite instanceof Sprite) {
          ag.sprite.texture = tex
        }
      }).catch(() => {})
    }

    if (progress >= 1) {
      toRemove.push(nodeId)
      // Restore original position
      const origPos = agentPositions.value.get(nodeId)
      if (origPos) {
        ag.container.x = origPos.x
        ag.container.y = origPos.y
      }
      // Reset sprite to idle stance
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

    // Draw glowing connection line
    connectionGraphics.moveTo(sx, sy)
    connectionGraphics.lineTo(tx, ty)
    connectionGraphics.stroke({ width: 3, color: 0x818cf8, alpha })

    // Draw arrow at midpoint
    const mx = (sx + tx) / 2
    const my = (sy + ty) / 2
    const angle = Math.atan2(ty - sy, tx - sx)
    const arrowSize = 8

    connectionGraphics.moveTo(
      mx + arrowSize * Math.cos(angle),
      my + arrowSize * Math.sin(angle)
    )
    connectionGraphics.lineTo(
      mx + arrowSize * Math.cos(angle + 2.5),
      my + arrowSize * Math.sin(angle + 2.5)
    )
    connectionGraphics.moveTo(
      mx + arrowSize * Math.cos(angle),
      my + arrowSize * Math.sin(angle)
    )
    connectionGraphics.lineTo(
      mx + arrowSize * Math.cos(angle - 2.5),
      my + arrowSize * Math.sin(angle - 2.5)
    )
    connectionGraphics.stroke({ width: 2, color: 0x818cf8, alpha })

    // Animated particle along connection
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

// ───────── PUBLIC API ─────────

/**
 * Trigger communication animation: source moves toward target.
 */
function triggerCommunication(sourceId, targetId) {
  const sourceAg = agentSprites.get(sourceId)
  const targetAg = agentSprites.get(targetId)
  if (!sourceAg || !targetAg) return

  const duration = 2000

  animatingAgents.set(sourceId, {
    startTime: Date.now(),
    duration,
    startX: sourceAg.container.x,
    startY: sourceAg.container.y,
    targetX: targetAg.container.x,
    targetY: targetAg.container.y,
    currentFrame: 1
  })

  addConnection(sourceId, targetId, duration)
}

function resetLayout() {
  const nodes = props.nodes || []
  const edges = props.edges || []
  resetPositions(nodes, edges)

  // Update sprite positions
  agentSprites.forEach((ag, nodeId) => {
    const pos = agentPositions.value.get(nodeId)
    if (pos) {
      ag.container.x = pos.x
      ag.container.y = pos.y
    }
  })
}

// Expose methods for parent to call
defineExpose({
  triggerCommunication,
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
    } else {
      buildScene()
      // Re-resize
      const wrapper = wrapperRef.value
      if (wrapper && app?.renderer) {
        app.renderer.resize(wrapper.clientWidth, wrapper.clientHeight)
      }
    }
  }
})

watch(() => props.workflowFile, () => {
  if (props.visible && app) {
    buildScene()
  }
})

// ───────── LIFECYCLE ─────────

onMounted(async () => {
  if (props.visible) {
    await nextTick()
    await initPixi()
  }
})

onUnmounted(() => {
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
</style>
