<template>
  <div class="spatial-controls">
    <div class="save-wrapper">
      <button
        class="spatial-control-button save-button"
        :class="{ 'save-unsaved': saveStatus === 'unsaved', 'save-saving': saveStatus === 'saving' }"
        title="Save Layout"
        @click="toggleSaveDropdown"
      >
        <svg v-if="saveStatus === 'saved'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else-if="saveStatus === 'saving'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>{{ saveButtonLabel }}</span>
      </button>
      <div v-if="showSaveDropdown" class="save-dropdown">
        <button
          v-for="cfg in availableConfigs"
          :key="cfg.name"
          class="save-option"
          @click="saveToConfig(cfg.name)"
        >
          {{ cfg.label }}
        </button>
        <div class="save-divider"></div>
        <div v-if="!showNewNameInput" class="save-option save-new-option" @click="showNewNameInput = true" style="padding: 5% 0% 5% 0%;">
          + Save as new…
        </div>
        <div v-else class="save-new-input-row">
          <input
            ref="newNameInputRef"
            v-model="newConfigName"
            class="save-new-input"
            placeholder="config_name"
            @keyup.enter="saveAsNew"
            @keyup.escape="showNewNameInput = false"
          />
          <button class="save-new-confirm" @click="saveAsNew" title="Save">✓</button>
        </div>
      </div>
    </div>

    <button
      class="spatial-control-button reset-button"
      title="Reset to auto-layout"
      @click="$emit('reset-layout')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <polyline points="23 20 23 14 17 14"></polyline>
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
      </svg>
      <span>Reset</span>
    </button>

    <div class="speed-selector">
      <button
        v-for="speed in speeds"
        :key="speed.id"
        class="speed-button"
        :class="{ active: currentSpeed === speed.id }"
        :title="`${speed.name} speed`"
        @click="$emit('speed-change', speed.id)"
      >
        {{ speed.name }}
      </button>
    </div>

    <div class="import-wrapper">
      <button
        class="spatial-control-button import-button"
        title="Import spatial config"
        @click="toggleImportDropdown"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Import</span>
      </button>
      <div v-if="showImportDropdown" class="import-dropdown">
        <button
          v-for="cfg in availableConfigs"
          :key="cfg.name"
          class="import-option"
          @click="selectConfig(cfg.name)"
        >
          {{ cfg.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { SPEED_LIST } from '../composables/useSpatialLayout.js'

const props = defineProps({
  currentSpeed: { type: String, default: 'normal' },
  saveStatus: { type: String, default: 'saved' }
})

const emit = defineEmits(['reset-layout', 'speed-change', 'save-layout', 'import-config'])

const speeds = SPEED_LIST
const showImportDropdown = ref(false)
const showSaveDropdown = ref(false)
const showNewNameInput = ref(false)
const newConfigName = ref('')
const newNameInputRef = ref(null)
const availableConfigs = ref([])

function formatLabel(name) {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function fetchAvailableConfigs() {
  try {
    const res = await fetch('/api/spatial-configs')
    if (res.ok) {
      const data = await res.json()
      availableConfigs.value = (data.configs || []).map(name => ({
        name,
        label: formatLabel(name)
      }))
    }
  } catch (err) {
    console.warn('Failed to fetch spatial configs:', err)
  }
}

const saveButtonLabel = computed(() => {
  switch (props.saveStatus) {
    case 'unsaved': return 'Save'
    case 'saving': return 'Saving'
    default: return 'Saved'
  }
})

async function toggleSaveDropdown() {
  showSaveDropdown.value = !showSaveDropdown.value
  showImportDropdown.value = false
  if (showSaveDropdown.value) {
    await fetchAvailableConfigs()
  } else {
    showNewNameInput.value = false
    newConfigName.value = ''
  }
}

function saveToConfig(name) {
  showSaveDropdown.value = false
  showNewNameInput.value = false
  newConfigName.value = ''
  emit('save-layout', name)
}

async function saveAsNew() {
  const name = newConfigName.value.trim().replace(/\s+/g, '_')
  if (!name) return
  saveToConfig(name)
}

async function toggleImportDropdown() {
  showImportDropdown.value = !showImportDropdown.value
  showSaveDropdown.value = false
  if (showImportDropdown.value) {
    await fetchAvailableConfigs()
  }
}

function selectConfig(name) {
  showImportDropdown.value = false
  emit('import-config', name)
}
</script>

<style scoped>
.spatial-controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  z-index: 10;
  align-items: center;
}

.spatial-control-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(30, 30, 50, 0.85);
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
}

.spatial-control-button:hover {
  background: rgba(50, 50, 80, 0.9);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.spatial-control-button:active {
  transform: scale(0.97);
}

.save-button {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
}

.save-button:hover {
  background: rgba(34, 197, 94, 0.35);
  border-color: rgba(34, 197, 94, 0.6);
}

.save-button.save-unsaved {
  background: rgba(234, 179, 8, 0.25);
  border-color: rgba(234, 179, 8, 0.5);
}

.save-button.save-unsaved:hover {
  background: rgba(234, 179, 8, 0.4);
  border-color: rgba(234, 179, 8, 0.7);
}

.save-button.save-saving {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.speed-selector {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.speed-button {
  padding: 6px 10px;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(30, 30, 50, 0.85);
  color: #94a3b8;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  cursor: pointer;
  transition: all 0.2s ease;
}

.speed-button:last-child {
  border-right: none;
}

.speed-button:hover {
  background: rgba(50, 50, 80, 0.9);
  color: #e2e8f0;
}

.speed-button.active {
  background: rgba(99, 102, 241, 0.4);
  color: #fff;
  font-weight: 600;
}

.save-wrapper,
.import-wrapper {
  position: relative;
}

.import-button {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
}

.import-button:hover {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(99, 102, 241, 0.6);
}

.save-dropdown,
.import-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 6px;
  background: rgba(30, 30, 50, 0.96);
  border: 1px solid rgba(129, 140, 248, 0.4);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 20;
}

.save-option,
.import-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e2e8f0;
  font-size: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.save-option:hover,
.import-option:hover {
  background: rgba(99, 102, 241, 0.3);
  color: #fff;
}

.save-new-option {
  color: #94a3b8;
  font-style: italic;
}

.save-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 8px;
}

.save-new-input-row {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
}

.save-new-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid rgba(129, 140, 248, 0.4);
  border-radius: 6px;
  background: rgba(20, 20, 40, 0.8);
  color: #e2e8f0;
  font-size: 11px;
  font-family: 'Inter', system-ui, sans-serif;
  outline: none;
}

.save-new-input:focus {
  border-color: rgba(129, 140, 248, 0.7);
}

.save-new-input::placeholder {
  color: #64748b;
}

.save-new-confirm {
  padding: 4px 8px;
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.save-new-confirm:hover {
  background: rgba(34, 197, 94, 0.4);
}
</style>
