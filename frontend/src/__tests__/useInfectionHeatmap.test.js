/**
 * @fileoverview Unit tests for useInfectionHeatmap composable
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useInfectionHeatmap } from '../composables/spatial/useInfectionHeatmap.js'

// ───────── MOCK FACTORY ─────────

function createMockGraphics() {
    return {
        clear: vi.fn(),
        circle: vi.fn(),
        fill: vi.fn()
    }
}

function createMockOptions(overrides = {}) {
    return {
        ctx: { heatmapGraphics: createMockGraphics() },
        agentPositions: ref(new Map()),
        getAgentCondition: vi.fn(() => 'healthy'),
        getParams: vi.fn(() => ({ infectionRadius: 120 })),
        sandboxMode: ref(false),
        simulationRunning: ref(false),
        isAgentNode: vi.fn(() => true),
        ...overrides
    }
}

// ───────── updateInfectionHeatmap ─────────

describe('useInfectionHeatmap - updateInfectionHeatmap', () => {
    it('clears graphics every frame', () => {
        const options = createMockOptions()
        const { updateInfectionHeatmap } = useInfectionHeatmap(options)

        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.clear).toHaveBeenCalled()
    })

    it('does not draw when sandbox mode is off', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(false)
        options.agentPositions.value.set('agent-1', { x: 100, y: 100 })
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('does not draw when simulation is not running', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(false)
        options.agentPositions.value.set('agent-1', { x: 100, y: 100 })
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('draws heatmap circles around infected agents', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.agentPositions.value.set('agent-1', { x: 100, y: 200 })
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        // Should draw 3 concentric bands for the infected agent
        expect(options.ctx.heatmapGraphics.circle).toHaveBeenCalledTimes(3)
        expect(options.ctx.heatmapGraphics.fill).toHaveBeenCalledTimes(3)

        // Verify circles are drawn at the agent's position
        const circleCalls = options.ctx.heatmapGraphics.circle.mock.calls
        circleCalls.forEach(call => {
            expect(call[0]).toBe(100) // x
            expect(call[1]).toBe(200) // y
        })
    })

    it('does not draw circles for healthy agents', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.agentPositions.value.set('agent-1', { x: 100, y: 100 })
        options.getAgentCondition = vi.fn(() => 'healthy')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('does not draw circles for non-agent nodes', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.agentPositions.value.set('node-1', { x: 100, y: 100 })
        options.isAgentNode = vi.fn(() => false)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('draws circles for multiple infected agents', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.agentPositions.value.set('agent-1', { x: 100, y: 100 })
        options.agentPositions.value.set('agent-2', { x: 300, y: 300 })
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        // 3 bands × 2 agents = 6 circles
        expect(options.ctx.heatmapGraphics.circle).toHaveBeenCalledTimes(6)
    })

    it('handles missing heatmapGraphics gracefully', () => {
        const options = createMockOptions()
        options.ctx.heatmapGraphics = null

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        expect(() => updateInfectionHeatmap()).not.toThrow()
    })

    it('uses infectionRadius from params for circle size', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.agentPositions.value.set('agent-1', { x: 50, y: 50 })
        options.getAgentCondition = vi.fn(() => 'infected')
        options.getParams = vi.fn(() => ({ infectionRadius: 200 }))

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        // Outer band should use full radius (200 * 1.0 = 200)
        const circleCalls = options.ctx.heatmapGraphics.circle.mock.calls
        expect(circleCalls[0][2]).toBe(200) // largest circle radius
    })
})

// ───────── cleanup ─────────

describe('useInfectionHeatmap - cleanup', () => {
    it('clears heatmap graphics', () => {
        const options = createMockOptions()
        const { cleanup } = useInfectionHeatmap(options)

        cleanup()

        expect(options.ctx.heatmapGraphics.clear).toHaveBeenCalled()
    })

    it('handles missing heatmapGraphics gracefully', () => {
        const options = createMockOptions()
        options.ctx.heatmapGraphics = null

        const { cleanup } = useInfectionHeatmap(options)
        expect(() => cleanup()).not.toThrow()
    })
})
