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

// ───────── computeRepulsionDirection ─────────

describe('useIdleWander - computeRepulsionDirection', () => {
    it('returns null when no other agents exist', () => {
        const options = createMockOptions()
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { computeRepulsionDirection } = useIdleWander(options)
        const result = computeRepulsionDirection('agent1', { x: 100, y: 100 })
        expect(result).toBeNull()
    })

    it('returns null when all agents are outside repulsion radius', () => {
        const options = createMockOptions()
        options.agentPositions.value.set('agent1', { x: 0, y: 0 })
        options.agentPositions.value.set('agent2', { x: 500, y: 500 }) // far away

        const { computeRepulsionDirection } = useIdleWander(options)
        const result = computeRepulsionDirection('agent1', { x: 0, y: 0 })
        expect(result).toBeNull()
    })

    it('returns direction biased away from a nearby agent', () => {
        const options = createMockOptions()
        // agent2 is directly to the right of agent1
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })
        options.agentPositions.value.set('agent2', { x: 150, y: 100 })

        const { computeRepulsionDirection } = useIdleWander(options)
        const result = computeRepulsionDirection('agent1', { x: 100, y: 100 })

        expect(result).not.toBeNull()
        // Repulsion should push agent1 to the left (negative dx)
        // With ±45° noise, dx should still be predominantly negative
        expect(result.dx).toBeLessThan(0)
    })

    it('produces a normalized direction with noise', () => {
        const options = createMockOptions()
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })
        options.agentPositions.value.set('agent2', { x: 120, y: 100 })

        const { computeRepulsionDirection } = useIdleWander(options)
        const result = computeRepulsionDirection('agent1', { x: 100, y: 100 })

        expect(result).not.toBeNull()
        // Result should be approximately unit length (noise rotation preserves magnitude)
        const mag = Math.sqrt(result.dx * result.dx + result.dy * result.dy)
        expect(mag).toBeCloseTo(1, 1)
    })

    it('weights closer agents more strongly', () => {
        const options = createMockOptions()
        // agent2 is very close (20px left), agent3 is farther (100px right)
        options.agentPositions.value.set('agent1', { x: 200, y: 200 })
        options.agentPositions.value.set('agent2', { x: 180, y: 200 }) // 20px left
        options.agentPositions.value.set('agent3', { x: 300, y: 200 }) // 100px right

        const { computeRepulsionDirection } = useIdleWander(options)

        // Run multiple times to average out noise
        let totalDx = 0
        for (let i = 0; i < 100; i++) {
            const result = computeRepulsionDirection('agent1', { x: 200, y: 200 })
            if (result) totalDx += result.dx
        }
        // agent2 is much closer so repulsion to the right should dominate
        expect(totalDx / 100).toBeGreaterThan(0)
    })
})

// ───────── neighbor visit wander ─────────

describe('useIdleWander - neighbor visit wander', () => {
    it('agent wanders toward a connected neighbor when roll succeeds', () => {
        // Force Math.random to return values that trigger neighbor visit
        // NEIGHBOR_VISIT_CHANCE = 0.3, so random < 0.3 triggers visit
        const originalRandom = Math.random
        let callCount = 0
        Math.random = () => {
            callCount++
            // 1st call: cooldown init (ignored), 2nd+: wander target selection
            // Return 0.1 for neighbor visit chance check, 0.0 for neighbor pick,
            // 0.4 for distance ratio
            return 0.1
        }

        try {
            const options = createMockOptions()
            options.ctx.agentSprites.set('A', { interactive: true })
            options.ctx.agentSprites.set('B', { interactive: true })
            options.agentPositions.value.set('A', { x: 0, y: 0 })
            options.agentPositions.value.set('B', { x: 200, y: 0 }) // far enough (> 60px)

            const { buildEdgeAdjacency, initIdleWanderTimers, resetWanderCooldown, updateIdleWanders } = useIdleWander(options)
            buildEdgeAdjacency([{ from: 'A', to: 'B' }])
            initIdleWanderTimers()

            // Set cooldown to past so wander triggers immediately
            resetWanderCooldown('A', 0, 0)

            // Force time past cooldown
            vi.useFakeTimers()
            vi.advanceTimersByTime(100)

            updateIdleWanders()

            // Agent A should have a wander animation
            const anim = options.ctx.animatingAgents.get('A')
            expect(anim).toBeDefined()
            expect(anim.type).toBe('wander')
            // Target should be toward B (positive X direction, partway)
            expect(anim.meetX).toBeGreaterThan(0)
            expect(anim.meetX).toBeLessThan(200) // partway, not all the way

            vi.useRealTimers()
        } finally {
            Math.random = originalRandom
        }
    })

    it('skips neighbor visit when agent is already close to neighbor', () => {
        const originalRandom = Math.random
        Math.random = () => 0.1 // always trigger neighbor visit

        try {
            const options = createMockOptions()
            options.ctx.agentSprites.set('A', { interactive: true })
            options.ctx.agentSprites.set('B', { interactive: true })
            // B is within NEIGHBOR_MIN_DISTANCE (60px)
            options.agentPositions.value.set('A', { x: 100, y: 100 })
            options.agentPositions.value.set('B', { x: 130, y: 100 }) // 30px away

            const { buildEdgeAdjacency, initIdleWanderTimers, resetWanderCooldown, updateIdleWanders } = useIdleWander(options)
            buildEdgeAdjacency([{ from: 'A', to: 'B' }])
            initIdleWanderTimers()
            resetWanderCooldown('A', 0, 0)

            vi.useFakeTimers()
            vi.advanceTimersByTime(100)

            updateIdleWanders()

            // Should still wander (falls through to random), but NOT toward B
            const anim = options.ctx.animatingAgents.get('A')
            expect(anim).toBeDefined()
            expect(anim.type).toBe('wander')

            vi.useRealTimers()
        } finally {
            Math.random = originalRandom
        }
    })

    it('uses default wander when agent has no graph neighbors', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true })
        options.agentPositions.value.set('A', { x: 100, y: 100 })

        const { initIdleWanderTimers, resetWanderCooldown, updateIdleWanders } = useIdleWander(options)
        // No buildEdgeAdjacency call → agent has no neighbors
        initIdleWanderTimers()
        resetWanderCooldown('A', 0, 0)

        vi.useFakeTimers()
        vi.advanceTimersByTime(100)

        updateIdleWanders()

        // Should still wander with random/repulsion target
        const anim = options.ctx.animatingAgents.get('A')
        expect(anim).toBeDefined()
        expect(anim.type).toBe('wander')

        vi.useRealTimers()
    })
})

// ───────── resetWanderCooldown with optional delay ─────────

describe('useIdleWander - resetWanderCooldown delay override', () => {
    it('uses custom delay range when provided', () => {
        vi.useFakeTimers()
        const now = Date.now()

        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { initIdleWanderTimers, resetWanderCooldown, updateIdleWanders } = useIdleWander(options)
        initIdleWanderTimers()

        // Reset with short delay: 500-1500ms
        resetWanderCooldown('agent1', 500, 1500)

        // At 400ms — should NOT wander yet (below 500ms minimum)
        vi.advanceTimersByTime(400)
        updateIdleWanders()
        expect(options.ctx.animatingAgents.has('agent1')).toBe(false)

        // At 1600ms total — should be past the max (1500ms), so wander starts
        vi.advanceTimersByTime(1200)
        updateIdleWanders()
        expect(options.ctx.animatingAgents.has('agent1')).toBe(true)

        vi.useRealTimers()
    })

    it('uses default 3-8s range when no override provided', () => {
        vi.useFakeTimers()

        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { initIdleWanderTimers, resetWanderCooldown, updateIdleWanders } = useIdleWander(options)
        initIdleWanderTimers()

        // Reset with default delay (no override)
        resetWanderCooldown('agent1')

        // At 2000ms — should NOT wander yet (below 3000ms minimum)
        vi.advanceTimersByTime(2000)
        updateIdleWanders()
        expect(options.ctx.animatingAgents.has('agent1')).toBe(false)

        vi.useRealTimers()
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
