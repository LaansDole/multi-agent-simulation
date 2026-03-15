/**
 * @fileoverview Unit tests for useInfectionHeatmap composable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
        ctx: {
            heatmapGraphics: createMockGraphics(),
            agentSprites: new Map()
        },
        agentPositions: ref(new Map()),
        getAgentCondition: vi.fn(() => 'healthy'),
        getParams: vi.fn(() => ({ infectionRadius: 120 })),
        sandboxMode: ref(false),
        simulationRunning: ref(false),
        isAgentNode: vi.fn(() => true),
        ...overrides
    }
}

function addAgentSprite(options, id, x, y, interactive = true) {
    options.ctx.agentSprites.set(id, {
        interactive,
        container: { x, y }
    })
}

// ───────── updateInfectionHeatmap ─────────

describe('useInfectionHeatmap - updateInfectionHeatmap', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('clears graphics every frame', () => {
        const options = createMockOptions()
        const { updateInfectionHeatmap } = useInfectionHeatmap(options)

        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.clear).toHaveBeenCalled()
    })

    it('does not draw when sandbox mode is off', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(false)
        addAgentSprite(options, 'agent-1', 100, 100)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('does not draw when simulation is not running', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(false)
        addAgentSprite(options, 'agent-1', 100, 100)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('draws heatmap circles at container position (not agentPositions)', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        // agentPositions is at (100, 200) = home position
        options.agentPositions.value.set('agent-1', { x: 100, y: 200 })
        // container is at (150, 250) = mid-animation visual position
        addAgentSprite(options, 'agent-1', 150, 250)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        // Should draw 3 concentric bands at container position, NOT agentPositions
        expect(options.ctx.heatmapGraphics.circle).toHaveBeenCalledTimes(3)
        const circleCalls = options.ctx.heatmapGraphics.circle.mock.calls
        circleCalls.forEach(call => {
            expect(call[0]).toBe(150) // x from container
            expect(call[1]).toBe(250) // y from container
        })
    })

    it('does not draw circles for healthy agents', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        addAgentSprite(options, 'agent-1', 100, 100)
        options.getAgentCondition = vi.fn(() => 'healthy')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('does not draw circles for non-agent nodes', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        addAgentSprite(options, 'node-1', 100, 100)
        options.isAgentNode = vi.fn(() => false)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('skips non-interactive sprites', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        addAgentSprite(options, 'node-1', 100, 100, false)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('draws circles for multiple infected agents', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        addAgentSprite(options, 'agent-1', 100, 100)
        addAgentSprite(options, 'agent-2', 300, 300)
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
        addAgentSprite(options, 'agent-1', 50, 50)
        options.getAgentCondition = vi.fn(() => 'infected')
        options.getParams = vi.fn(() => ({ infectionRadius: 200 }))

        const { updateInfectionHeatmap } = useInfectionHeatmap(options)
        updateInfectionHeatmap()

        // Outer band should use full radius (200 * 1.0 = 200)
        const circleCalls = options.ctx.heatmapGraphics.circle.mock.calls
        expect(circleCalls[0][2]).toBe(200)
    })
})

// ───────── recordResidual ─────────

describe('useInfectionHeatmap - recordResidual', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders residual spots with decaying alpha', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)

        const { updateInfectionHeatmap, recordResidual } = useInfectionHeatmap(options)

        vi.setSystemTime(1000)
        recordResidual(200, 300)

        // Advance time by 1500ms (halfway through 3000ms decay)
        vi.setSystemTime(2500)
        updateInfectionHeatmap()

        // Should draw 3 bands for the residual
        expect(options.ctx.heatmapGraphics.circle).toHaveBeenCalledTimes(3)
        const circleCalls = options.ctx.heatmapGraphics.circle.mock.calls
        circleCalls.forEach(call => {
            expect(call[0]).toBe(200)
            expect(call[1]).toBe(300)
        })

        // Alpha should be decayed (50% of original)
        const fillCalls = options.ctx.heatmapGraphics.fill.mock.calls
        fillCalls.forEach(call => {
            expect(call[0].alpha).toBeLessThan(0.15) // less than max band alpha
            expect(call[0].alpha).toBeGreaterThan(0)
        })
    })

    it('removes expired residuals after decay duration', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)

        const { updateInfectionHeatmap, recordResidual } = useInfectionHeatmap(options)

        vi.setSystemTime(1000)
        recordResidual(200, 300)

        // Advance past the 3000ms decay
        vi.setSystemTime(4001)
        updateInfectionHeatmap()

        // Residual should not be drawn (expired)
        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('renders both active agents and residuals together', () => {
        const options = createMockOptions()
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        addAgentSprite(options, 'agent-1', 100, 100)
        options.getAgentCondition = vi.fn(() => 'infected')

        const { updateInfectionHeatmap, recordResidual } = useInfectionHeatmap(options)

        vi.setSystemTime(1000)
        recordResidual(400, 400)

        vi.setSystemTime(1500) // 500ms after residual
        updateInfectionHeatmap()

        // 3 bands for active agent + 3 bands for residual = 6
        expect(options.ctx.heatmapGraphics.circle).toHaveBeenCalledTimes(6)
    })
})

// ───────── cleanup ─────────

describe('useInfectionHeatmap - cleanup', () => {
    it('clears heatmap graphics and residuals', () => {
        const options = createMockOptions()
        const { cleanup, recordResidual, updateInfectionHeatmap } = useInfectionHeatmap(options)

        recordResidual(100, 100)
        cleanup()

        // After cleanup, no residuals should render
        options.sandboxMode = ref(true)
        options.simulationRunning = ref(true)
        options.ctx.heatmapGraphics.clear.mockClear()
        options.ctx.heatmapGraphics.circle.mockClear()
        updateInfectionHeatmap()

        expect(options.ctx.heatmapGraphics.clear).toHaveBeenCalled()
        expect(options.ctx.heatmapGraphics.circle).not.toHaveBeenCalled()
    })

    it('handles missing heatmapGraphics gracefully', () => {
        const options = createMockOptions()
        options.ctx.heatmapGraphics = null

        const { cleanup } = useInfectionHeatmap(options)
        expect(() => cleanup()).not.toThrow()
    })
})
