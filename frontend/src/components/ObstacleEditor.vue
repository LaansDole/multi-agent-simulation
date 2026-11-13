<template>
  <div class="obstacle-editor" :class="{ active: isEditorActive }" ref="editorRef">

    
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

    <div v-if="showPalette" class="palette" :style="paletteStyle">
      <div class="palette-header">
        <span class="palette-title">{{ activeMode === 'contamination' ? 'Paint Contamination' : `Add ${activeMode === 'obstacles' ? 'Obstacle' : 'Floor'}` }}</span>
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
      
      <div class="mode-tabs">
        <button
          class="mode-tab"
          :class="{ active: activeMode === 'obstacles' }"
          @click="activeMode = 'obstacles'"
        >
          Obstacles
        </button>
        <button
          class="mode-tab"
          :class="{ active: activeMode === 'floors' }"
          @click="activeMode = 'floors'"
        >
          Floors
        </button>
        <button
          v-if="isSandboxMode"
          class="mode-tab contamination-tab"
          :class="{ active: activeMode === 'contamination' }"
          @click="activeMode = 'contamination'"
        >
          ☣ Contamination
        </button>
      </div>
      
      <div v-if="activeMode === 'obstacles'" class="search-container" style="padding: 0 11% 0 0%;">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search obstacles..."
          class="search-input"
        />
        <button
          v-if="searchQuery"
          class="search-clear-btn"
          @click="searchQuery = ''"
          title="Clear search"
        >
          ✕
        </button>
      </div>
      
      <div v-if="activeMode === 'obstacles'" class="category-tabs">
        <button
          v-for="category in categories"
          :key="category.id"
          class="category-tab"
          :class="{ active: selectedCategory === category.id }"
          @click="selectedCategory = category.id"
        >
          {{ category.name }}
        </button>
      </div>
      
      <button
        v-if="activeMode === 'obstacles'"
        class="upload-custom-btn"
        @click="triggerFileUpload"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Upload Custom
      </button>
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        style="display: none"
        @change="handleFileUpload"
      />
      
      <div v-if="activeMode === 'obstacles'" class="palette-items">
        <div v-if="filteredPaletteItems.length === 0" class="empty-state">
          No obstacles match your search
        </div>
        <button
          v-for="item in filteredPaletteItems"
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
      
      <div v-if="activeMode === 'floors'" class="category-tabs">
        <button
          v-for="category in floorCategories"
          :key="category.id"
          class="category-tab"
          :class="{ active: selectedFloorCategory === category.id }"
          @click="selectedFloorCategory = category.id"
        >
          {{ category.name }}
        </button>
      </div>
      
      <button
        v-if="activeMode === 'floors'"
        class="upload-custom-btn"
        @click="triggerFloorFileUpload"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Upload Custom
      </button>
      <input
        ref="floorFileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        style="display: none"
        @change="handleFloorFileUpload"
      />
      
      <div v-if="activeMode === 'floors'" class="palette-items grid-layout">
        <button
          v-for="item in filteredFloorItems"
          :key="item.id"
          class="palette-item tile-item"
          :class="{ 
            selected: selectedFloorId === item.id,
            active: isFloorEditorActive && selectedFloorId === item.id 
          }"
          @click="selectFloor(item)"
          :title="item.name"
        >
          <div class="tile-preview">
            <img
              :src="item.sprite"
              :alt="item.name"
              class="tile-sprite"
            />
          </div>
          <span class="tile-label">{{ item.name }}</span>
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

      <!-- Tool mode selector -->
      <div class="tool-mode-selector">
        <span class="tool-mode-label">Tool</span>
        <div class="tool-mode-buttons">
          <button
            class="tool-mode-button"
            :class="{ selected: currentToolMode === 'pointer' }"
            @click="setToolMode('pointer')"
            title="Click to place"
          >
            🖱️ Pointer
          </button>
          <button
            class="tool-mode-button"
            :class="{ selected: currentToolMode === 'brush' }"
            @click="setToolMode('brush')"
            title="Drag to paint"
          >
            🖌️ Brush
          </button>
          <button
            class="tool-mode-button"
            :class="{ selected: currentToolMode === 'eraser' }"
            @click="setToolMode('eraser')"
            title="Drag to erase"
          >
            🧹 Eraser
          </button>
        </div>
      </div>
    </div>
    
    <div v-if="isEditorActive" class="instructions">
      {{ instructionText }}
    </div>
    
    <div v-if="isFloorEditorActive" class="instructions">
      {{ floorInstructionText }}
    </div>

    <div v-if="activeMode === 'contamination'" class="instructions">
      {{ contaminationInstructionText }}
    </div>
    
    <div v-if="showUploadModal" class="modal-overlay" @click.self="cancelUpload">
      <div class="modal">
        <div class="modal-header">
          <h3>Configure Custom Obstacle</h3>
          <button class="modal-close" @click="cancelUpload">✕</button>
        </div>
        <div class="modal-body">
          <div class="preview-container">
            <img :src="previewImage" alt="Preview" class="preview-image" />
          </div>
          
          <div class="form-group">
            <label>Name *</label>
            <input
              v-model="customObstacleName"
              type="text"
              placeholder="Enter obstacle name"
              class="form-input"
            />
          </div>
          
          <div class="form-group">
            <label>Type *</label>
            <select v-model="customObstacleType" class="form-select">
              <option value="furniture">Furniture</option>
              <option value="decoration">Decoration</option>
              <option value="industrial">Industrial</option>
              <option value="outdoor">Outdoor</option>
              <option value="wall">Wall</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Collision</label>
            <div class="checkbox-group">
              <input
                v-model="customObstacleCollision"
                type="checkbox"
                id="collision-checkbox"
              />
              <label for="collision-checkbox">Enable collision detection</label>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Default Width</label>
              <input
                v-model.number="customObstacleWidth"
                type="number"
                min="10"
                max="500"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>Default Height</label>
              <input
                v-model.number="customObstacleHeight"
                type="number"
                min="10"
                max="500"
                class="form-input"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" @click="cancelUpload">Cancel</button>
          <button class="modal-btn save" @click="saveCustomObstacle">Save</button>
        </div>
      </div>
    </div>
    
    <div v-if="showFloorUploadModal" class="modal-overlay" @click.self="cancelFloorUpload">
      <div class="modal">
        <div class="modal-header">
          <h3>Configure Custom Tile</h3>
          <button class="modal-close" @click="cancelFloorUpload">✕</button>
        </div>
        <div class="modal-body">
          <div class="preview-container">
            <img :src="floorPreviewImage" alt="Preview" class="preview-image" />
          </div>
          
          <div class="form-group">
            <label>Tile Name *</label>
            <input
              v-model="customFloorName"
              type="text"
              placeholder="Enter tile name"
              class="form-input"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" @click="cancelFloorUpload">Cancel</button>
          <button class="modal-btn save" @click="saveCustomFloor">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSpatialConfig } from '../composables/useSpatialConfig.js'
import { createObstacle } from '../types/spatial.js'
import { useBrushTool } from '../composables/spatial/useBrushTool.js'
import { useContagionEngine } from '../composables/spatial/useContagionEngine.js'

const props = defineProps({
  canvasHeight: { type: Number, default: 600 }
})

const GRID_SIZE = 40

const emit = defineEmits(['obstacle-added'])

const { config: spatialConfig, currentWorkflow, setConfig, getConfig, markConfigChanged } = useSpatialConfig()
const { sandboxMode } = useContagionEngine()
const isSandboxMode = computed(() => sandboxMode.value)

const isEditorActive = ref(false)
const showPalette = ref(true)

const paletteStyle = computed(() => {
  const maxH = Math.max(200, props.canvasHeight * 0.85 - 32)
  return { maxHeight: maxH + 'px' }
})
const selectedItemId = ref(null)
const selectedShape = ref('rectangle')
const wallDirection = ref('horizontal')
const editorRef = ref(null)
const selectedCategory = ref('all')
const activeMode = ref('obstacles')
const isFloorEditorActive = ref(false)
const selectedFloorId = ref(null)
const searchQuery = ref('')
const fileInputRef = ref(null)
const showUploadModal = ref(false)
const previewImage = ref('')
const customObstacleName = ref('')
const customObstacleType = ref('furniture')
const customObstacleCollision = ref(true)
const customObstacleWidth = ref(50)
const customObstacleHeight = ref(50)
const pendingImageData = ref(null)
const floorFileInputRef = ref(null)
const showFloorUploadModal = ref(false)
const floorPreviewImage = ref('')
const customFloorName = ref('')
const pendingFloorImageData = ref(null)

const categories = [
  { id: 'all', name: 'All' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'office', name: 'Office' },
  { id: 'industrial', name: 'Industrial' },
  { id: 'outdoor', name: 'Outdoor' },
  { id: 'custom', name: 'Custom' }
]

const builtInPaletteItems = [
  { id: 'wall', name: 'Wall', type: 'wall', category: 'custom', color: '#64748b', sprite: null, defaultShape: 'rectangle' },
  { id: 'desk', name: 'Desk', type: 'furniture', category: 'furniture', color: '#8b5cf6', sprite: '/sprites/obstacles/desk.png', defaultShape: 'rectangle' },
  { id: 'chair', name: 'Chair', type: 'furniture', category: 'furniture', color: '#6366f1', sprite: '/sprites/obstacles/chair.png', defaultShape: 'rectangle' },
  { id: 'computer', name: 'Computer', type: 'decoration', category: 'office', color: '#3b82f6', sprite: '/sprites/obstacles/computer.png', defaultShape: 'rectangle' },
  { id: 'hospital_bed', name: 'Hospital Bed', type: 'furniture', category: 'furniture', color: '#94a3b8', sprite: '/sprites/obstacles/hospital_bed.png', defaultShape: 'rectangle' },
  { id: 'meeting_table', name: 'Meeting Table', type: 'furniture', category: 'office', color: '#8b5a2b', sprite: '/sprites/obstacles/meeting_table.png', defaultShape: 'rectangle' },
  { id: 'whiteboard', name: 'Whiteboard', type: 'furniture', category: 'office', color: '#f5f5f5', sprite: '/sprites/obstacles/whiteboard.png', defaultShape: 'rectangle' },
  { id: 'water_cooler', name: 'Water Cooler', type: 'furniture', category: 'office', color: '#87ceeb', sprite: '/sprites/obstacles/water_cooler.png', defaultShape: 'rectangle' },
  { id: 'filing_cabinet', name: 'Filing Cabinet', type: 'furniture', category: 'office', color: '#808080', sprite: '/sprites/obstacles/filing_cabinet.png', defaultShape: 'rectangle' },
  { id: 'printer', name: 'Printer', type: 'furniture', category: 'office', color: '#464646', sprite: '/sprites/obstacles/printer.png', defaultShape: 'rectangle' },
  { id: 'conveyor_belt', name: 'Conveyor Belt', type: 'industrial', category: 'industrial', color: '#404040', sprite: '/sprites/obstacles/conveyor_belt.png', defaultShape: 'rectangle' },
  { id: 'shelf_large', name: 'Large Shelf', type: 'industrial', category: 'industrial', color: '#8b5a2b', sprite: '/sprites/obstacles/shelf_large.png', defaultShape: 'rectangle' },
  { id: 'forklift', name: 'Forklift', type: 'industrial', category: 'industrial', color: '#ff8c00', sprite: '/sprites/obstacles/forklift.png', defaultShape: 'rectangle' },
  { id: 'machinery', name: 'Machinery', type: 'industrial', category: 'industrial', color: '#696969', sprite: '/sprites/obstacles/machinery.png', defaultShape: 'rectangle' },
  { id: 'pallet', name: 'Pallet', type: 'industrial', category: 'industrial', color: '#a0522d', sprite: '/sprites/obstacles/pallet.png', defaultShape: 'rectangle' },
  { id: 'tree', name: 'Tree', type: 'outdoor', category: 'outdoor', color: '#228b22', sprite: '/sprites/obstacles/tree.png', defaultShape: 'circle' },
  { id: 'bench', name: 'Bench', type: 'outdoor', category: 'outdoor', color: '#8b4513', sprite: '/sprites/obstacles/bench.png', defaultShape: 'rectangle' },
  { id: 'street_lamp', name: 'Street Lamp', type: 'decoration', category: 'outdoor', color: '#696969', sprite: '/sprites/obstacles/street_lamp.png', defaultShape: 'rectangle' },
  { id: 'vehicle_car', name: 'Vehicle Car', type: 'outdoor', category: 'outdoor', color: '#4682b4', sprite: '/sprites/obstacles/vehicle_car.png', defaultShape: 'rectangle' },
  { id: 'trash_bin', name: 'Trash Bin', type: 'outdoor', category: 'outdoor', color: '#2f4f4f', sprite: '/sprites/obstacles/trash_bin.png', defaultShape: 'rectangle' }
]

const customPaletteItems = ref([])
const customFloorItems = ref([])

const paletteItems = computed(() => {
  return [...builtInPaletteItems, ...customPaletteItems.value]
})

const floorCategories = [
  { id: 'all', name: 'All' },
  { id: 'basic', name: 'Basic' },
  { id: 'themed', name: 'Themed' },
  { id: 'special', name: 'Special' },
  { id: 'custom', name: 'Custom' }
]

const selectedFloorCategory = ref('all')

const floorItems = [
  { id: 'wood', name: 'Wood', category: 'basic', sprite: '/sprites/tiles/wood.png', color: '#8b5a2b' },
  { id: 'concrete', name: 'Concrete', category: 'basic', sprite: '/sprites/tiles/concrete.png', color: '#808080' },
  { id: 'carpet', name: 'Carpet', category: 'basic', sprite: '/sprites/tiles/carpet.png', color: '#4169e1' },
  { id: 'tile', name: 'Tile', category: 'basic', sprite: '/sprites/tiles/tile.png', color: '#f5f5f5' },
  { id: 'hospital_tile', name: 'Hospital Tile', category: 'themed', sprite: '/sprites/tiles/hospital_tile.png', color: '#e0e0e0' },
  { id: 'office_carpet', name: 'Office Carpet', category: 'themed', sprite: '/sprites/tiles/office_carpet.png', color: '#696969' },
  { id: 'warehouse_concrete', name: 'Warehouse Concrete', category: 'themed', sprite: '/sprites/tiles/warehouse_concrete.png', color: '#555555' },
  { id: 'grass', name: 'Grass', category: 'themed', sprite: '/sprites/tiles/grass.png', color: '#228b22' },
  { id: 'pavement', name: 'Pavement', category: 'themed', sprite: '/sprites/tiles/pavement.png', color: '#a0a0a0' },
  { id: 'hazard_stripes', name: 'Hazard Stripes', category: 'special', sprite: '/sprites/tiles/hazard_stripes.png', color: '#ffd700' },
  { id: 'directional_arrow', name: 'Directional Arrow', category: 'special', sprite: '/sprites/tiles/directional_arrow.png', color: '#4682b4' },
  { id: 'parking_spot', name: 'Parking Spot', category: 'special', sprite: '/sprites/tiles/parking_spot.png', color: '#2f4f4f' }
]

const allFloorItems = computed(() => {
  return [...floorItems, ...customFloorItems.value]
})

const filteredFloorItems = computed(() => {
  let items = allFloorItems.value
  
  if (selectedFloorCategory.value === 'all') {
    return items
  }
  return items.filter(item => item.category === selectedFloorCategory.value)
})

const filteredPaletteItems = computed(() => {
  let items = paletteItems.value
  
  if (selectedCategory.value !== 'all') {
    items = items.filter(item => item.category === selectedCategory.value)
  }
  
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    items = items.filter(item => item.name.toLowerCase().includes(query))
  }
  
  return items
})

const shapes = ['rectangle', 'circle']

const selectedItem = computed(() => {
  return paletteItems.value.find(p => p.id === selectedItemId.value)
})

const selectedItemName = computed(() => {
  return selectedItem.value ? selectedItem.value.name : ''
})

const selectedFloor = computed(() => {
  return allFloorItems.value.find(f => f.id === selectedFloorId.value)
})

const selectedFloorName = computed(() => {
  return selectedFloor.value ? selectedFloor.value.name : ''
})

// ───────── BRUSH TOOL ─────────

const brushTool = useBrushTool({
  getActiveMode: () => activeMode.value,
  getSelectedItem: () => selectedItem.value,
  getSelectedFloor: () => selectedFloor.value,
  addObstacleFn: (x, y) => addObstacle(x, y),
  addFloorFn: (x, y) => addFloor(x, y)
})

const currentToolMode = computed(() => brushTool.toolMode.value)

function setToolMode(mode) {
  brushTool.setToolMode(mode)
}

const instructionText = computed(() => {
  if (currentToolMode.value === 'brush') return `Drag to paint ${selectedItemName.value}`
  if (currentToolMode.value === 'eraser') return `Drag to erase obstacles`
  return `Click on canvas to place ${selectedItemName.value}`
})

const floorInstructionText = computed(() => {
  if (currentToolMode.value === 'brush') return `Drag to paint ${selectedFloorName.value}`
  if (currentToolMode.value === 'eraser') return `Drag to erase floor tiles`
  return `Click on canvas to paint ${selectedFloorName.value}`
})

const contaminationInstructionText = computed(() => {
  if (currentToolMode.value === 'brush') return 'Drag to paint contamination (level 3) on floor tiles'
  if (currentToolMode.value === 'eraser') return 'Drag to clear contamination from floor tiles'
  return 'Select Brush or Eraser to paint or clear contamination zones'
})

function selectItem(item) {
  if (isEditorActive.value && selectedItemId.value === item.id) {
    cancelEditing()
  } else {
    selectedItemId.value = item.id
    selectedShape.value = item.defaultShape || 'rectangle'
    isEditorActive.value = true
    activeMode.value = 'obstacles'
  }
}

function selectFloor(item) {
  if (isFloorEditorActive.value && selectedFloorId.value === item.id) {
    cancelEditing()
  } else {
    selectedFloorId.value = item.id
    isFloorEditorActive.value = true
    activeMode.value = 'floors'
  }
}

function cancelEditing() {
  isEditorActive.value = false
  selectedItemId.value = null
  selectedShape.value = 'rectangle'
  isFloorEditorActive.value = false
  selectedFloorId.value = null
  brushTool.setToolMode('pointer')
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
    switch (itemId) {
      case 'tree':
        return { radius: 30 }
      default:
        return { radius: 20 }
    }
  }
  
  const customItem = customPaletteItems.value.find(item => item.id === itemId)
  if (customItem && customItem.defaultWidth && customItem.defaultHeight) {
    return { width: customItem.defaultWidth, height: customItem.defaultHeight }
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
    case 'meeting_table':
      return { width: 120, height: 80 }
    case 'whiteboard':
      return { width: 100, height: 60 }
    case 'water_cooler':
      return { width: 40, height: 80 }
    case 'filing_cabinet':
      return { width: 50, height: 80 }
    case 'printer':
      return { width: 60, height: 50 }
    case 'conveyor_belt':
      return { width: 120, height: 40 }
    case 'shelf_large':
      return { width: 100, height: 200 }
    case 'forklift':
      return { width: 80, height: 120 }
    case 'machinery':
      return { width: 80, height: 80 }
    case 'pallet':
      return { width: 80, height: 80 }
    case 'tree':
      return { width: 60, height: 60 }
    case 'bench':
      return { width: 80, height: 40 }
    case 'street_lamp':
      return { width: 30, height: 80 }
    case 'vehicle_car':
      return { width: 100, height: 60 }
    case 'trash_bin':
      return { width: 40, height: 50 }
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
  
  const isCustom = item.id.startsWith('custom-')
  const collision = isCustom 
    ? (item.collision !== undefined ? item.collision : true)
    : item.type !== 'decoration'
  
  const obstacle = createObstacle({
    id,
    type: item.type,
    shape,
    position: { x: snappedX, y: snappedY },
    size,
    color: item.color,
    collision,
    sprite: item.sprite ? (isCustom ? item.sprite : item.sprite.split('/').pop()) : undefined
  })
  
  const config = getConfig()
  const updatedConfig = {
    ...config,
    obstacles: [...config.obstacles, obstacle]
  }
  
  const workflowName = currentWorkflow.value || 'default'
  setConfig(workflowName, updatedConfig)
  markConfigChanged()
  
  emit('obstacle-added', obstacle)
}

function addFloor(x, y) {
  if (!isFloorEditorActive.value || !selectedFloor.value) return
  
  const snappedX = snapToGrid(x)
  const snappedY = snapToGrid(y)
  
  const item = selectedFloor.value
  const id = `floor-${item.id}-${snappedX}-${snappedY}`
  
  const { addFloorTile, updateFloorTile, getFloorTiles } = useSpatialConfig()
  
  const floorTile = {
    id,
    tileType: item.id,
    position: { x: snappedX, y: snappedY },
    width: GRID_SIZE,
    height: GRID_SIZE,
    sprite: item.sprite ? item.sprite.split('/').pop() : undefined,
    color: item.color
  }
  
  const existingTiles = getFloorTiles()
  const existingTile = existingTiles.find(t => t.id === id)
  
  if (existingTile) {
    updateFloorTile(id, floorTile)
  } else {
    addFloorTile(floorTile)
  }
  
  markConfigChanged()
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && isEditorActive.value) {
    cancelEditing()
  }
  if (e.key === 'Escape' && showUploadModal.value) {
    cancelUpload()
  }
  if (e.key === 'Escape' && showFloorUploadModal.value) {
    cancelFloorUpload()
  }
}

function triggerFileUpload() {
  fileInputRef.value?.click()
}

function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  
  const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml']
  if (!validTypes.includes(file.type)) {
    alert('Please upload a PNG, JPG, or SVG file')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result
    if (typeof dataUrl === 'string') {
      previewImage.value = dataUrl
      pendingImageData.value = dataUrl
      customObstacleName.value = file.name.replace(/\.[^/.]+$/, '')
      showUploadModal.value = true
    }
  }
  reader.readAsDataURL(file)
  
  event.target.value = ''
}

function cancelUpload() {
  showUploadModal.value = false
  previewImage.value = ''
  pendingImageData.value = null
  customObstacleName.value = ''
  customObstacleType.value = 'furniture'
  customObstacleCollision.value = true
  customObstacleWidth.value = 50
  customObstacleHeight.value = 50
}

function saveCustomObstacle() {
  if (!customObstacleName.value.trim()) {
    alert('Please enter a name for the obstacle')
    return
  }
  
  if (!pendingImageData.value) {
    alert('No image data available')
    return
  }
  
  const id = `custom-${Date.now()}`
  const newObstacle = {
    id,
    name: customObstacleName.value.trim(),
    type: customObstacleType.value,
    category: 'custom',
    color: '#94a3b8',
    sprite: pendingImageData.value,
    defaultShape: 'rectangle',
    collision: customObstacleCollision.value,
    defaultWidth: customObstacleWidth.value,
    defaultHeight: customObstacleHeight.value
  }
  
  customPaletteItems.value.push(newObstacle)
  saveCustomObstaclesToStorage()
  
  cancelUpload()
  
  selectedCategory.value = 'custom'
}

function saveCustomObstaclesToStorage() {
  try {
    const customItems = customPaletteItems.value.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      color: item.color,
      sprite: item.sprite,
      defaultShape: item.defaultShape,
      collision: item.collision,
      defaultWidth: item.defaultWidth,
      defaultHeight: item.defaultHeight
    }))
    localStorage.setItem('customObstacles', JSON.stringify(customItems))
  } catch (error) {
    console.error('Failed to save custom obstacles:', error)
  }
}

function loadCustomObstaclesFromStorage() {
  try {
    const stored = localStorage.getItem('customObstacles')
    if (stored) {
      const customItems = JSON.parse(stored)
      customPaletteItems.value = customItems
    }
  } catch (error) {
    console.error('Failed to load custom obstacles:', error)
  }
}

function triggerFloorFileUpload() {
  floorFileInputRef.value?.click()
}

function handleFloorFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  
  const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml']
  if (!validTypes.includes(file.type)) {
    alert('Please upload a PNG, JPG, or SVG file')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result
    if (typeof dataUrl === 'string') {
      floorPreviewImage.value = dataUrl
      pendingFloorImageData.value = dataUrl
      customFloorName.value = file.name.replace(/\.[^/.]+$/, '')
      showFloorUploadModal.value = true
    }
  }
  reader.readAsDataURL(file)
  
  event.target.value = ''
}

function cancelFloorUpload() {
  showFloorUploadModal.value = false
  floorPreviewImage.value = ''
  pendingFloorImageData.value = null
  customFloorName.value = ''
}

function saveCustomFloor() {
  if (!customFloorName.value.trim()) {
    alert('Please enter a name for the tile')
    return
  }
  
  if (!pendingFloorImageData.value) {
    alert('No image data available')
    return
  }
  
  const id = `custom-floor-${Date.now()}`
  const newFloor = {
    id,
    name: customFloorName.value.trim(),
    category: 'custom',
    sprite: pendingFloorImageData.value,
    color: '#94a3b8'
  }
  
  customFloorItems.value.push(newFloor)
  saveCustomFloorsToStorage()
  
  cancelFloorUpload()
  
  selectedFloorCategory.value = 'custom'
}

function saveCustomFloorsToStorage() {
  try {
    const customItems = customFloorItems.value.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      sprite: item.sprite,
      color: item.color
    }))
    localStorage.setItem('customFloors', JSON.stringify(customItems))
  } catch (error) {
    console.error('Failed to save custom floors:', error)
  }
}

function loadCustomFloorsFromStorage() {
  try {
    const stored = localStorage.getItem('customFloors')
    if (stored) {
      const customItems = JSON.parse(stored)
      customFloorItems.value = customItems
    }
  } catch (error) {
    console.error('Failed to load custom floors:', error)
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  loadCustomObstaclesFromStorage()
  loadCustomFloorsFromStorage()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

defineExpose({
  isEditorActive,
  isFloorEditorActive,
  toolMode: brushTool.toolMode,
  selectType: selectItem,
  selectFloor,
  cancelEditing,
  addObstacle,
  addFloor,
  handleDragStart(x, y) {
    brushTool.startStroke(x, y)
  },
  handleDrag(x, y) {
    brushTool.continueStroke(x, y)
  },
  handleDragEnd() {
    brushTool.endStroke()
  },
  getPlacementInfo() {
    if (!isEditorActive.value || !selectedItem.value) return null
    const item = selectedItem.value
    return {
      color: item.color,
      shape: selectedShape.value,
      size: getDefaultSize(item.id, selectedShape.value)
    }
  },
  getFloorInfo() {
    if (!isFloorEditorActive.value || !selectedFloor.value) return null
    const item = selectedFloor.value
    return {
      color: item.color,
      sprite: item.sprite
    }
  }
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-items::-webkit-scrollbar {
  width: 6px;
}

.palette-items::-webkit-scrollbar-track {
  background: transparent;
}

.palette-items::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.palette-items::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
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

.mode-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-tab {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.5);
  color: #94a3b8;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-tab:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.mode-tab.active {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}

.search-container {
  position: relative;
  margin-bottom: 10px;
}

.search-input {
  width: 100%;
  padding: 6px 28px 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.5);
  color: #e2e8f0;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  outline: none;
  transition: all 0.2s ease;
}

.search-input::placeholder {
  color: #64748b;
}

.search-input:focus {
  border-color: rgba(129, 140, 248, 0.5);
  background: rgba(50, 50, 80, 0.8);
}

.search-clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-clear-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.category-tab {
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.5);
  color: #94a3b8;
  font-size: 10px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-tab:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.category-tab.active {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}

.palette-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex-shrink: 1;
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

.tool-mode-selector {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-mode-label {
  font-size: 10px;
  color: #94a3b8;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(40, 40, 60, 0.6);
  color: #94a3b8;
  font-size: 10px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tool-mode-button:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
}

.tool-mode-button.selected {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
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

.empty-state {
  padding: 16px 10px;
  text-align: center;
  color: #64748b;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
}

.palette-items.grid-layout {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.tile-item {
  flex-direction: column;
  padding: 8px;
  gap: 6px;
  text-align: center;
}

.tile-preview {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-sprite {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.tile-label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.upload-custom-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border: 1px dashed rgba(129, 140, 248, 0.4);
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
  color: #a5b4fc;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-custom-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(129, 140, 248, 0.6);
  color: #c7d2fe;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  background: rgba(30, 30, 50, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  font-family: 'Inter', system-ui, sans-serif;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: calc(90vh - 140px);
}

.preview-container {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.preview-image {
  max-width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 4px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  font-family: 'Inter', system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(40, 40, 60, 0.5);
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  border-color: rgba(129, 140, 248, 0.5);
  background: rgba(50, 50, 80, 0.8);
}

.form-input::placeholder {
  color: #64748b;
}

.form-select {
  cursor: pointer;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-row .form-group {
  margin-bottom: 0;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #6366f1;
}

.checkbox-group label {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-btn.cancel {
  background: rgba(40, 40, 60, 0.5);
  color: #94a3b8;
}

.modal-btn.cancel:hover {
  background: rgba(60, 60, 90, 0.8);
  color: #e2e8f0;
}

.modal-btn.save {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.5);
  color: #fff;
}

.modal-btn.save:hover {
  background: rgba(99, 102, 241, 0.5);
  border-color: rgba(129, 140, 248, 0.7);
}
</style>
