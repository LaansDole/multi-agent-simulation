<template>
  <div class="obstacle-editor" :class="{ active: isEditorActive }" ref="editorRef">
    <!-- Preview ghost overlay -->
    <div
      v-if="isEditorActive && mousePosition"
      class="preview-ghost"
      :class="selectedShape"
      :style="previewGhostStyle"
    ></div>
    
    <!-- Toggle button (visible when palette is collapsed) -->
    <button
      v-if="!showPalette"
      class="toggle-button"
      title="Open Obstacle Editor"
      @click="showPalette = true"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
      </svg>
      <span>Obstacles</span>
    </button>

    <div v-if="showPalette" class="palette">
      <div class="palette-header">
        <span class="palette-title">Add Obstacle</span>
        <div class="palette-header-actions">
          <button
            class="header-action-btn close-action"
            @click="closePalette"
            title="Close editor"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div class="palette-items">
        <button
          v-for="item in paletteItems"
          :key="item.id"
          class="palette-item"
          :class="{ 
            selected: selectedItemId === item.id,
            active: isEditorActive && selectedItemId === item.id 
          }"
          @click="selectItem(item)"
        >
          <div class="palette-icon">
            <img
              v-if="item.sprite"
              :src="item.sprite"
              :alt="item.name"
              class="palette-sprite"
            />
            <div v-else class="palette-color" :style="{ backgroundColor: item.color }"></div>
          </div>
          <span class="palette-label">{{ item.name }}</span>
        </button>
      </div>
      
      <div v-if="isEditorActive" class="shape-selector">
        <button
          v-for="shape in shapes"
          :key="shape"
          class="shape-button"
          :class="{ selected: selectedShape === shape }"
          @click="selectedShape = shape"
        >
          {{ shape }}
        </button>
      </div>

      <div v-if="isEditorActive && selectedItemId === 'wall'" class="direction-selector">
        <span class="direction-label">Direction</span>
        <div class="direction-buttons">
          <button
            class="direction-button"
            :class="{ selected: wallDirection === 'horizontal' }"
            @click="wallDirection = 'horizontal'"
          >
            ━ Horizontal
          </button>
          <button
            class="direction-button"
            :class="{ selected: wallDirection === 'vertical' }"
            @click="wallDirection = 'vertical'"
          >
            ┃ Vertical
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="isEditorActive" class="instructions">
      Click on canvas to place {{ selectedItemName }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSpatialConfig } from '../composables/useSpatialConfig.js'
import { createObstacle } from '../types/spatial.js'

const GRID_SIZE = 40

const props = defineProps({
  mousePosition: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['obstacle-added'])

const { config: spatialConfig, setConfig, getConfig, markConfigChanged } = useSpatialConfig()

const isEditorActive = ref(false)
const showPalette = ref(true)
const selectedItemId = ref(null)
const selectedShape = ref('rectangle')
const wallDirection = ref('horizontal')
const editorRef = ref(null)

const paletteItems = [
  { id: 'wall', name: 'Wall', type: 'wall', color: '#64748b', sprite: null, defaultShape: 'rectangle' },
  { id: 'desk', name: 'Desk', type: 'furniture', color: '#8b5cf6', sprite: '/sprites/obstacles/desk.png', defaultShape: 'rectangle' },
  { id: 'chair', name: 'Chair', type: 'furniture', color: '#6366f1', sprite: '/sprites/obstacles/chair.png', defaultShape: 'rectangle' },
  { id: 'computer', name: 'Computer', type: 'decoration', color: '#3b82f6', sprite: '/sprites/obstacles/computer.png', defaultShape: 'rectangle' },
  { id: 'hospital_bed', name: 'Hospital Bed', type: 'furniture', color: '#94a3b8', sprite: '/sprites/obstacles/hospital_bed.png', defaultShape: 'rectangle' }
]

const shapes = ['rectangle', 'circle']

const selectedItem = computed(() => {
  return paletteItems.find(p => p.id === selectedItemId.value)
})

const selectedItemName = computed(() => {
  return selectedItem.value ? selectedItem.value.name : ''
})

const previewGhostStyle = computed(() => {
  if (!props.mousePosition || !selectedItem.value) {
    return { display: 'none' }
  }
  
  const x = snapToGrid(props.mousePosition.x)
  const y = snapToGrid(props.mousePosition.y)
  const size = getDefaultSize(selectedItem.value.id, selectedShape.value)
  const color = selectedItem.value.color
  // Compute offset dynamically from the editor's actual position within the layout
  const editorEl = editorRef.value
  const parentEl = editorEl?.parentElement
  let offsetX = 16, offsetY = 16
  if (editorEl && parentEl) {
    const editorRect = editorEl.getBoundingClientRect()
    const parentRect = parentEl.getBoundingClientRect()
    offsetX = editorRect.left - parentRect.left
    offsetY = editorRect.top - parentRect.top
  }
  const baseStyle = {
    left: `${x - offsetX}px`,
    top: `${y - offsetY}px`,
    backgroundColor: color,
    borderColor: color
  }
  
  if (selectedShape.value === 'circle') {
    return {
      ...baseStyle,
      width: `${(size.radius || 20) * 2}px`,
      height: `${(size.radius || 20) * 2}px`
    }
  }
  
  return {
    ...baseStyle,
    width: `${size.width || 50}px`,
    height: `${size.height || 50}px`
  }
})

function selectItem(item) {
  if (isEditorActive.value && selectedItemId.value === item.id) {
    cancelEditing()
  } else {
    selectedItemId.value = item.id
    selectedShape.value = item.defaultShape || 'rectangle'
    isEditorActive.value = true
  }
}

function cancelEditing() {
  isEditorActive.value = false
  selectedItemId.value = null
  selectedShape.value = 'rectangle'
}

function closePalette() {
  cancelEditing()
  showPalette.value = false
}

function snapToGrid(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function getDefaultSize(itemId, shape) {
  if (shape === 'circle') {
    return { radius: 20 }
  }
  
  switch (itemId) {
    case 'wall':
      return wallDirection.value === 'vertical'
        ? { width: 20, height: 120 }
        : { width: 120, height: 20 }
    case 'desk':
      return { width: 80, height: 60 }
    case 'chair':
      return { width: 40, height: 40 }
    case 'computer':
      return { width: 50, height: 50 }
    case 'hospital_bed':
      return { width: 100, height: 60 }
    default:
      return { width: 50, height: 50 }
  }
}

function addObstacle(x, y) {
  if (!isEditorActive.value || !selectedItem.value) return
  
  const snappedX = snapToGrid(x)
  const snappedY = snapToGrid(y)
  
  const item = selectedItem.value
  const id = `${item.id}-${Date.now()}`
  const shape = selectedShape.value
  const size = getDefaultSize(item.id, shape)
  
  const obstacle = createObstacle({
    id,
    type: item.type,
    shape,
    position: { x: snappedX, y: snappedY },
    size,
    color: item.color,
    collision: item.type !== 'decoration',
    sprite: item.sprite ? item.sprite.split('/').pop() : undefined
  })
  
  const config = getConfig()
  const updatedConfig = {
    ...config,
    obstacles: [...config.obstacles, obstacle]
  }
  
  const workflowName = spatialConfig.value.currentWorkflow || 'default'
  setConfig(workflowName, updatedConfig)
  markConfigChanged()
  
  emit('obstacle-added', obstacle)
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && isEditorActive.value) {
    cancelEditing()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

defineExpose({
  isEditorActive,
  selectType: selectItem,
  cancelEditing,
  addObstacle
})
</script>

<style scoped>
.obstacle-editor {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
}

.obstacle-editor > * {
  pointer-events: auto;
}

.toggle-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(30, 30, 50, 0.92);
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}

.toggle-button:hover {
  background: rgba(50, 50, 80, 0.95);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
}

.preview-ghost {
  position: absolute;
  opacity: 0.5;
  border: 2px dashed;
  border-radius: 4px;
  pointer-events: none;
  z-index: 15;
  animation: ghost-pulse 1s ease-in-out infinite;
}

.preview-ghost.circle {
  border-radius: 50%;
}

@keyframes ghost-pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.7;
  }
}

.palette {
  background: rgba(30, 30, 50, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 240px;
}

.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.palette-title {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  font-family: 'Inter', system-ui, sans-serif;
}

.palette-header-actions {
  display: flex;
  gap: 4px;
}

.header-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.cancel-action:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.close-action:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.palette-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(40, 40, 60, 0.5);
  color: #cbd5e1;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.palette-item:hover {
  background: rgba(60, 60, 90, 0.8);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.palette-item.selected,
.palette-item.active {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}

.palette-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.palette-sprite {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.palette-color {
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.palette-label {
  font-weight: 500;
}

.shape-selector {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.shape-button {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.6);
  color: #94a3b8;
  font-size: 10px;
  font-family: 'Inter', system-ui, sans-serif;
  text-transform: capitalize;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shape-button:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
}

.shape-button.selected {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}

.instructions {
  background: rgba(30, 30, 50, 0.9);
  border: 1px solid rgba(129, 140, 248, 0.4);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 11px;
  color: #c7d2fe;
  font-family: 'Inter', system-ui, sans-serif;
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 8px rgba(129, 140, 248, 0.2);
  }
  50% {
    box-shadow: 0 0 16px rgba(129, 140, 248, 0.4);
  }
}

.direction-selector {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.direction-label {
  font-size: 10px;
  color: #94a3b8;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: block;
  margin-bottom: 6px;
}

.direction-buttons {
  display: flex;
  gap: 6px;
}

.direction-button {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.6);
  color: #94a3b8;
  font-size: 10px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
}

.direction-button:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
}

.direction-button.selected {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}
</style>
