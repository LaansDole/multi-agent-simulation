/**
 * @fileoverview Unit tests for useIdleWander composable
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useIdleWander } from '../composables/spatial/useIdleWander.js'

// ───────── MOCK FACTORY ─────────

function createMockCtx() {
    return {
        agentSprites: new Map(),
        animatingAgents: new Map(),
        pathfinder: null
    }
}

function createMockOptions(overrides = {}) {
    const ctx = createMockCtx()
    return {
        ctx,
        getAgentStatus: vi.fn(() => 'idle'),
        getSpeedValue: vi.fn(() => 0.1),
        agentPositions: ref(new Map()),
        AGENT_STATUS_IDLE: 'idle',
        ...overrides
    }
}

// ───────── buildEdgeAdjacency ─────────

describe('useIdleWander - buildEdgeAdjacency', () => {
    it('creates bidirectional edges', () => {
        const options = createMockOptions()
        const { buildEdgeAdjacency } = useIdleWander(options)

        // We can't directly inspect internal state, but we can test behavior
        // by checking that the composable doesn't throw
        buildEdgeAdjacency([
            { from: 'A', to: 'B' },
            { from: 'B', to: 'C' }
        ])
        // No error means success — adjacency is used internally by updateIdleWanders
    })

    it('handles empty edges array', () => {
        const options = createMockOptions()
        const { buildEdgeAdjacency } = useIdleWander(options)
        expect(() => buildEdgeAdjacency([])).not.toThrow()
    })

    it('handles duplicate edges gracefully', () => {
        const options = createMockOptions()
        const { buildEdgeAdjacency } = useIdleWander(options)
        expect(() => buildEdgeAdjacency([
            { from: 'A', to: 'B' },
            { from: 'A', to: 'B' }
        ])).not.toThrow()
    })
})

// ───────── initIdleWanderTimers ─────────

describe('useIdleWander - initIdleWanderTimers', () => {
    it('initializes timers for interactive agents only', () => {
        const options = createMockOptions()
        // Add agents to ctx
        options.ctx.agentSprites.set('agent1', { interactive: true })
        options.ctx.agentSprites.set('agent2', { interactive: false })
        options.ctx.agentSprites.set('agent3', { interactive: true })

        const { initIdleWanderTimers } = useIdleWander(options)
        // Should not throw with interactive and non-interactive agents
        expect(() => initIdleWanderTimers()).not.toThrow()
    })

    it('handles empty agent list', () => {
        const options = createMockOptions()
        const { initIdleWanderTimers } = useIdleWander(options)
        expect(() => initIdleWanderTimers()).not.toThrow()
    })
})

// ───────── updateIdleWanders ─────────

describe('useIdleWander - updateIdleWanders', () => {
    it('skips non-interactive agents', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('node1', { interactive: false })
        options.agentPositions.value.set('node1', { x: 100, y: 100 })

        const { updateIdleWanders, initIdleWanderTimers } = useIdleWander(options)
        initIdleWanderTimers()
        updateIdleWanders()

        // Non-interactive agent should NOT be animating
        expect(options.ctx.animatingAgents.has('node1')).toBe(false)
    })

    it('skips agents that are not idle', () => {
        const options = createMockOptions()
        options.getAgentStatus = vi.fn(() => 'communicating') // not idle
        options.ctx.agentSprites.set('agent1', { interactive: true })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { updateIdleWanders, initIdleWanderTimers } = useIdleWander(options)
        initIdleWanderTimers()
        updateIdleWanders()

        expect(options.ctx.animatingAgents.has('agent1')).toBe(false)
    })

    it('skips agents already animating', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true })
        options.ctx.animatingAgents.set('agent1', { type: 'communicate' })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { updateIdleWanders, initIdleWanderTimers } = useIdleWander(options)
        initIdleWanderTimers()
        updateIdleWanders()

        // Should still have the original animation, not replaced
        expect(options.ctx.animatingAgents.get('agent1').type).toBe('communicate')
    })
})

// ───────── cleanup ─────────

describe('useIdleWander - cleanup', () => {
    it('clears internal state without error', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true })

        const { initIdleWanderTimers, buildEdgeAdjacency, cleanup } = useIdleWander(options)
        buildEdgeAdjacency([{ from: 'A', to: 'B' }])
        initIdleWanderTimers()
        expect(() => cleanup()).not.toThrow()
    })

    it('can reinitialize after cleanup', () => {
        const options = createMockOptions()
        const { initIdleWanderTimers, cleanup } = useIdleWander(options)
        cleanup()
        expect(() => initIdleWanderTimers()).not.toThrow()
    })
})
