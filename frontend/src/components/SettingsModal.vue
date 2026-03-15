<template>
  <Transition name="modal-fade">
    <div v-if="isVisible" class="modal-overlay" @click.self="close">
      <div class="modal-content settings-modal">
        <div class="modal-header">
          <h3>Settings</h3>
          <button class="close-button" @click="close">×</button>
        </div>
        <div class="modal-body">
          <div class="settings-item">
            <label class="checkbox-label">
              <input type="checkbox" v-model="localConfig.AUTO_SHOW_ADVANCED">
              Auto show advanced setting
            </label>
            <p class="setting-desc">Automatically expand "Advanced Settings" in configuration forms.</p>
          </div>
          <div class="settings-item">
            <label class="checkbox-label">
              <input type="checkbox" v-model="localConfig.AUTO_EXPAND_MESSAGES">
              Automatically expand messages
            </label>
            <p class="setting-desc">Automatically expand message content in the chat view.</p>
          </div>
          <div class="settings-item">
            <label class="checkbox-label">
              <input type="checkbox" v-model="localConfig.ENABLE_HELP_TOOLTIPS">
              Enable help tooltips
            </label>
            <p class="setting-desc">Show contextual help tooltips throughout the workflow interface.</p>
          </div>

          <!-- Contagion Simulation Settings -->
          <div class="settings-item" @click="showContagion = !showContagion">
            <span class="section-chevron" :class="{ open: showContagion }">▶</span>
            Contagion Simulation
          </div>
          <Transition name="collapse">
          <div v-if="showContagion" class="contagion-settings">
            <p class="section-hint">Parameters for the spatial contagion sandbox. Changes take effect on the next simulation tick.</p>

            <div class="settings-group-label">Transmission</div>
            <div class="number-setting">
              <label>Infection Radius <span class="unit">px</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_INFECTION_RADIUS" min="0" step="10" />
            </div>
            <div class="number-setting">
              <label>Infection Probability <span class="unit">/sec</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_INFECTION_PROBABILITY" min="0" max="1" step="0.05" />
            </div>
            <div class="number-setting">
              <label>Floor Infection Probability <span class="unit">/sec</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_FLOOR_INFECTION_PROBABILITY" min="0" max="1" step="0.05" />
            </div>

            <div class="settings-group-label">Disease Progression</div>
            <div class="number-setting">
              <label>Recovery Time <span class="unit">ms</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_RECOVERY_TIME_MS" min="0" step="1000" />
            </div>
            <div class="number-setting">
              <label>Fatality Probability <span class="unit">0–1</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_FATALITY_PROBABILITY" min="0" max="1" step="0.01" />
            </div>
            <div class="number-setting">
              <label>Mutation Probability <span class="unit">/sec</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_MUTATION_PROBABILITY" min="0" max="1" step="0.001" />
            </div>

            <div class="settings-group-label">Environment</div>
            <div class="number-setting">
              <label>Contamination Decay <span class="unit">ms</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_CONTAMINATION_DECAY_MS" min="0" step="1000" />
            </div>

            <div class="settings-group-label">Post-recovery</div>
            <div class="number-setting">
              <label>Immunity Duration <span class="unit">ms</span></label>
              <input type="number" v-model.number="localConfig.CONTAGION_IMMUNITY_DURATION_MS" min="0" step="1000" />
            </div>
          </div>
          </Transition>
        </div>
        <div class="modal-footer">
          <button class="cancel-button" @click="close">Cancel</button>
          <button class="confirm-button" @click="save">Save</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { configStore } from '../utils/configStore.js'

const props = defineProps({
  isVisible: {
    type: Boolean,
    required: true
  }
})

const showContagion = ref(false)

const localConfig = reactive({
  AUTO_SHOW_ADVANCED: false,
  AUTO_EXPAND_MESSAGES: false,
  ENABLE_HELP_TOOLTIPS: true,
  CONTAGION_INFECTION_RADIUS: 120,
  CONTAGION_INFECTION_PROBABILITY: 0.7,
  CONTAGION_FLOOR_INFECTION_PROBABILITY: 0.15,
  CONTAGION_RECOVERY_TIME_MS: 60000,
  CONTAGION_FATALITY_PROBABILITY: 0.05,
  CONTAGION_MUTATION_PROBABILITY: 0.001,
  CONTAGION_CONTAMINATION_DECAY_MS: 10000,
  CONTAGION_IMMUNITY_DURATION_MS: 30000,
})

watch(() => props.isVisible, (newVal) => {
  if (newVal) {
    // Sync local state with global store when modal opens
    Object.assign(localConfig, configStore)
  }
})

const emit = defineEmits(['update:isVisible', 'close'])

const close = () => {
  emit('update:isVisible', false)
  emit('close')
}

const save = () => {
  // Commit local changes to global store
  Object.assign(configStore, localConfig)
  close()
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.modal-content.settings-modal {
  width: 500px !important;
  max-width: 90vw;
  background: #1e1e1e;
  border-radius: 8px;
  border: 1px solid #333;
  color: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.close-button {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-button:hover {
  color: #fff;
}

.modal-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.settings-item {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e0e0e0;
  font-size: 15px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 6px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #4facfe;
  cursor: pointer;
}

.setting-desc {
  margin-left: 26px;
  color: #8b949e;
  font-size: 13px;
  line-height: 1.4;
  margin-top: 0;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-button {
  background: #4facfe;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.confirm-button:hover {
  background: #3a9cfa;
}

.cancel-button {
  background: transparent;
  color: #ccc;
  border: 1px solid #444;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border-color: #666;
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* ── Contagion section ── */
.settings-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  margin-top: 8px;
  color: #e0e0e0;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-section-header:hover {
  color: #fff;
}

.section-chevron {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  color: #888;
}

.section-chevron.open {
  transform: rotate(90deg);
}

/* Collapse transition for contagion section */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  max-height: 500px;
  opacity: 1;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

.section-hint {
  color: #8b949e;
  font-size: 12px;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.contagion-settings {
  padding-left: 4px;
}

.settings-group-label {
  color: #8b949e;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 14px 0 6px 0;
}

.settings-group-label:first-child {
  margin-top: 0;
}

.number-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.number-setting label {
  color: #ccc;
  font-size: 13px;
  flex: 1;
}

.number-setting .unit {
  color: #666;
  font-size: 11px;
  margin-left: 4px;
}

.number-setting input[type="number"] {
  width: 100px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 4px 8px;
  font-size: 13px;
  text-align: right;
}

.number-setting input[type="number"]:focus {
  outline: none;
  border-color: #4facfe;
}
</style>

