<template>
  <div class="simulation-controls" v-if="visible">
    <button
      class="sim-btn play-btn"
      :class="{ active: isPlaying }"
      :title="isPlaying ? 'Pause' : 'Play'"
      @click="$emit(isPlaying ? 'pause' : 'play')"
    >
      <svg v-if="!isPlaying" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e2e8f0">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e2e8f0">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
    </button>

    <button
      class="sim-btn step-btn"
      title="Step (1 frame)"
      @click="$emit('step')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e2e8f0">
        <polygon points="5 3 15 12 5 21 5 3"></polygon>
        <rect x="17" y="3" width="3" height="18"></rect>
      </svg>
    </button>

    <button
      class="sim-btn reset-btn"
      title="Reset simulation"
      @click="$emit('reset')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
    </button>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  isPlaying: { type: Boolean, default: false }
})

defineEmits(['play', 'pause', 'step', 'reset'])
</script>

<style scoped>
.simulation-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-evenly;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sim-btn {
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sim-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sim-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
}

.sim-btn.active {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
  color: #22c55e;
}

.reset-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
</style>
