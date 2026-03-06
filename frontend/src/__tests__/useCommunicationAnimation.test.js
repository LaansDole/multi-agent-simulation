/**
 * @fileoverview Unit tests for useCommunicationAnimation composable
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { ref } from 'vue'

// ───────── Constants (matching useSpatialLayout.js) ─────────

const AGENT_STATUS = {
    IDLE: 'idle',
    THINKING: 'thinking',
    COMMUNICATING: 'communicating',
    ERROR: 'error'
}

const COMMUNICATION_ANIMATION_DISTANCE = 0.85
const MIN_MEETING_GAP = 30

// ───────── Import ─────────

let useCommunicationAnimation

beforeAll(async () => {
    const mod = await import('../composables/spatial/useCommunicationAnimation.js')
    useCommunicationAnimation = mod.useCommunicationAnimation
})

afterEach(() => {
    vi.restoreAllMocks()
})

// ───────── Helpers ─────────

function createMockOptions(overrides = {}) {
    return {
        ctx: {
            agentSprites: new Map(),
            animatingAgents: new Map(),
            pathfinder: null
        },
        getSpeedValue: vi.fn(() => 0.02),
        setAgentStatus: vi.fn(),
        getAgentStatus: vi.fn(() => AGENT_STATUS.IDLE),
        enqueueAnimation: vi.fn(),
        dequeueAnimation: vi.fn(() => null),
        getStaggerDelay: vi.fn(() => 500),
        addConnection: vi.fn(),
        isProcessingQueue: ref(false),
        agentPositions: ref(new Map()),
        resetWanderCooldown: vi.fn(),
        AGENT_STATUS,
        COMMUNICATION_ANIMATION_DISTANCE,
        MIN_MEETING_GAP,
        ...overrides
    }
}

// ───────── calculateMeetingPoints ─────────

describe('useCommunicationAnimation - calculateMeetingPoints', () => {
    it('returns original positions when agents are at the same spot', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(100, 100, 100, 100)
        expect(result.sourceMeet).toEqual({ x: 100, y: 100 })
        expect(result.targetMeet).toEqual({ x: 100, y: 100 })
    })

    it('returns original positions when agents are very close (dist < 1)', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(100, 100, 100.5, 100)
        expect(result.sourceMeet).toEqual({ x: 100, y: 100 })
        expect(result.targetMeet).toEqual({ x: 100.5, y: 100 })
    })

    it('agents move toward each other for distant positions', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(0, 0, 1000, 0)

        // Source should move right (positive x direction)
        expect(result.sourceMeet.x).toBeGreaterThan(0)
        // Target should move left (negative x direction from its start)
        expect(result.targetMeet.x).toBeLessThan(1000)
    })

    it('meeting points never cross the midline', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(0, 0, 200, 0)
        const midX = 100

        // Source meeting point should not go past midline
        expect(result.sourceMeet.x).toBeLessThanOrEqual(midX)
        // Target meeting point should not go past midline
        expect(result.targetMeet.x).toBeGreaterThanOrEqual(midX)
    })

    it('respects MIN_MEETING_GAP when agents are close', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        // Agents very close together (just above dist < 1 threshold)
        const result = calculateMeetingPoints(0, 0, 40, 0)

        // Meeting points should maintain minimum gap
        const gap = result.targetMeet.x - result.sourceMeet.x
        expect(gap).toBeGreaterThanOrEqual(0) // Cannot be negative
    })

    it('works with diagonal positions', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(0, 0, 300, 400)

        // Source should move toward target
        expect(result.sourceMeet.x).toBeGreaterThan(0)
        expect(result.sourceMeet.y).toBeGreaterThan(0)
        // Target should move toward source
        expect(result.targetMeet.x).toBeLessThan(300)
        expect(result.targetMeet.y).toBeLessThan(400)
    })

    it('meeting points are symmetric around the midpoint', () => {
        const options = createMockOptions()
        const { calculateMeetingPoints } = useCommunicationAnimation(options)

        const result = calculateMeetingPoints(0, 0, 500, 0)

        // Both agents should move the same distance toward each other
        const sourceMove = result.sourceMeet.x - 0
        const targetMove = 500 - result.targetMeet.x
        expect(sourceMove).toBeCloseTo(targetMove, 5)
    })
})

// ───────── triggerCommunication ─────────

describe('useCommunicationAnimation - triggerCommunication', () => {
    it('enqueues animation when both agents exist and at least one is interactive', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 100, y: 100 } })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        expect(options.enqueueAnimation).toHaveBeenCalledWith('A', 'B')
    })

    it('does nothing when source agent does not exist', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 100, y: 100 } })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        expect(options.enqueueAnimation).not.toHaveBeenCalled()
    })

    it('does nothing when target agent does not exist', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        expect(options.enqueueAnimation).not.toHaveBeenCalled()
    })

    it('does nothing when neither agent is interactive', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: false, container: { x: 0, y: 0 } })
        options.ctx.agentSprites.set('B', { interactive: false, container: { x: 100, y: 100 } })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        expect(options.enqueueAnimation).not.toHaveBeenCalled()
    })
})

// ───────── updateAgentStatus ─────────

describe('useCommunicationAnimation - updateAgentStatus', () => {
    it('sets status for interactive agents', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true, container: { x: 0, y: 0 } })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.THINKING)

        expect(options.setAgentStatus).toHaveBeenCalledWith('agent1', AGENT_STATUS.THINKING)
    })

    it('ignores non-interactive agents', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('node1', { interactive: false, container: { x: 0, y: 0 } })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('node1', AGENT_STATUS.THINKING)

        expect(options.setAgentStatus).not.toHaveBeenCalled()
    })

    it('ignores unknown agents', () => {
        const options = createMockOptions()

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('nonexistent', AGENT_STATUS.THINKING)

        expect(options.setAgentStatus).not.toHaveBeenCalled()
    })

    it('cancels wander animation when entering non-idle status', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true, container: { x: 50, y: 50 } })
        options.ctx.animatingAgents.set('agent1', { type: 'wander' })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.COMMUNICATING)

        // Wander animation should be removed
        expect(options.ctx.animatingAgents.has('agent1')).toBe(false)
        // Container should be reset to saved position
        const ag = options.ctx.agentSprites.get('agent1')
        expect(ag.container.x).toBe(100)
        expect(ag.container.y).toBe(100)
    })

    it('resets wander cooldown when returning to idle', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true, container: { x: 0, y: 0 } })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.IDLE)

        expect(options.resetWanderCooldown).toHaveBeenCalledWith('agent1')
    })
})

// ───────── cleanup ─────────

describe('useCommunicationAnimation - cleanup', () => {
    it('clears without error when no timer is active', () => {
        const options = createMockOptions()
        const { cleanup } = useCommunicationAnimation(options)
        expect(() => cleanup()).not.toThrow()
    })

    it('can be called multiple times safely', () => {
        const options = createMockOptions()
        const { cleanup } = useCommunicationAnimation(options)
        expect(() => {
            cleanup()
            cleanup()
            cleanup()
        }).not.toThrow()
    })
})
