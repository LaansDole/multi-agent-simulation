<template>
  <div class="spatial-controls">
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
      <span>Reset Layout</span>
    </button>
  </div>
</template>

<script setup>
defineEmits(['reset-layout'])
</script>

<style scoped>
.spatial-controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  z-index: 10;
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
</style>
