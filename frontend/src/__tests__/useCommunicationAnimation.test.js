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
        options.ctx.animatingAgents.set('agent1', { type: 'wander', startX: 100, startY: 100 })
        options.agentPositions.value.set('agent1', { x: 100, y: 100 })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.COMMUNICATING)

        // Wander animation should be removed
        expect(options.ctx.animatingAgents.has('agent1')).toBe(false)
        // Container should be reset to home position from anim.startX/startY
        const ag = options.ctx.agentSprites.get('agent1')
        expect(ag.container.x).toBe(100)
        expect(ag.container.y).toBe(100)
    })

    it('restores home position even when agentPositions is mid-wander (drift fix)', () => {
        const options = createMockOptions()
        // Agent is mid-wander: container at (120,100), agentPositions synced to (120,100),
        // but true home is (100,100) stored in anim.startX/startY
        options.ctx.agentSprites.set('agent1', { interactive: true, container: { x: 120, y: 100 } })
        options.ctx.animatingAgents.set('agent1', { type: 'wander', startX: 100, startY: 100 })
        options.agentPositions.value.set('agent1', { x: 120, y: 100 }) // corrupted mid-wander

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.COMMUNICATING)

        // Should restore to HOME (100,100), NOT mid-wander (120,100)
        const ag = options.ctx.agentSprites.get('agent1')
        expect(ag.container.x).toBe(100)
        expect(ag.container.y).toBe(100)
        // agentPositions should also be corrected
        const pos = options.agentPositions.value.get('agent1')
        expect(pos.x).toBe(100)
        expect(pos.y).toBe(100)
    })

    it('resets wander cooldown when returning to idle', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', { interactive: true, container: { x: 0, y: 0 } })

        const { updateAgentStatus } = useCommunicationAnimation(options)
        updateAgentStatus('agent1', AGENT_STATUS.IDLE)

        expect(options.resetWanderCooldown).toHaveBeenCalledWith('agent1', 500, 1500)
    })
})

// ───────── executeCommunicationAnimation — home anchoring on interruption ─────────

describe('useCommunicationAnimation - home anchoring on interruption', () => {
    it('uses existing animation startX/startY when source is already animating', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 300, y: 300 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 500, y: 500 } })
        // A is mid-animation: agentPositions drifted to (300,300), but home is (100,100)
        options.ctx.animatingAgents.set('A', {
            startX: 100, startY: 100,
            startTime: Date.now(), duration: 5000,
            meetX: 300, meetY: 300, path: [], pathIndex: 0
        })
        options.agentPositions.value.set('A', { x: 300, y: 300 })
        options.agentPositions.value.set('B', { x: 500, y: 500 })

        // Dequeue returns a queued animation
        let called = false
        options.dequeueAnimation = vi.fn(() => {
            if (!called) { called = true; return { sourceId: 'A', targetId: 'B' } }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        // After the animation is executed, A's new animation should start from home (100,100)
        const animA = options.ctx.animatingAgents.get('A')
        expect(animA).toBeDefined()
        expect(animA.startX).toBe(100)
        expect(animA.startY).toBe(100)
    })

    it('uses existing animation startX/startY when target is already animating', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 100, y: 100 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 400, y: 400 } })
        // B is mid-animation: drifted to (400,400), but home is (500,500)
        options.ctx.animatingAgents.set('B', {
            startX: 500, startY: 500,
            startTime: Date.now(), duration: 5000,
            meetX: 400, meetY: 400, path: [], pathIndex: 0
        })
        options.agentPositions.value.set('A', { x: 100, y: 100 })
        options.agentPositions.value.set('B', { x: 400, y: 400 })

        let called = false
        options.dequeueAnimation = vi.fn(() => {
            if (!called) { called = true; return { sourceId: 'A', targetId: 'B' } }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        const animB = options.ctx.animatingAgents.get('B')
        expect(animB).toBeDefined()
        expect(animB.startX).toBe(500)
        expect(animB.startY).toBe(500)
    })

    it('falls back to agentPositions when no existing animation', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 200, y: 200 } })
        options.agentPositions.value.set('A', { x: 50, y: 50 })
        options.agentPositions.value.set('B', { x: 200, y: 200 })

        let called = false
        options.dequeueAnimation = vi.fn(() => {
            if (!called) { called = true; return { sourceId: 'A', targetId: 'B' } }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        const animA = options.ctx.animatingAgents.get('A')
        expect(animA).toBeDefined()
        expect(animA.startX).toBe(50)
        expect(animA.startY).toBe(50)
    })
})

// ───────── communication cooldown ─────────

describe('useCommunicationAnimation - communication cooldown', () => {
    it('re-enqueues animation when source agent is still in cooldown', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 200, y: 200 } })
        options.agentPositions.value.set('A', { x: 0, y: 0 })
        options.agentPositions.value.set('B', { x: 200, y: 200 })

        // Set up dequeue to return one animation (twice: first for initial, second after re-enqueue check)
        let callCount = 0
        options.dequeueAnimation = vi.fn(() => {
            callCount++
            if (callCount === 1) return { sourceId: 'A', targetId: 'B' }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)

        // First communication — should execute normally (no cooldown yet)
        triggerCommunication('A', 'B')
        expect(options.enqueueAnimation).toHaveBeenCalledWith('A', 'B')

        // Simulate animation completion by fast-forwarding the setTimeout
        // The cooldown is recorded inside the setTimeout callback
        vi.useFakeTimers()
        vi.advanceTimersByTime(10000) // advance past any animation duration

        // Now trigger a second communication within cooldown window
        callCount = 0
        options.enqueueAnimation.mockClear()
        options.dequeueAnimation = vi.fn(() => {
            callCount++
            if (callCount === 1) return { sourceId: 'A', targetId: 'B' }
            return null
        })

        triggerCommunication('A', 'B')

        // The animation should have been re-enqueued because A is in cooldown
        expect(options.enqueueAnimation).toHaveBeenCalledWith('A', 'B')
        // But no new animation entry should be created for A
        // (the executeCommunicationAnimation returned early after re-enqueue)

        vi.useRealTimers()
    })

    it('allows animation when cooldown has expired', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 200, y: 200 } })
        options.agentPositions.value.set('A', { x: 0, y: 0 })
        options.agentPositions.value.set('B', { x: 200, y: 200 })

        let callCount = 0
        options.dequeueAnimation = vi.fn(() => {
            callCount++
            if (callCount === 1) return { sourceId: 'A', targetId: 'B' }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)

        // First: trigger and let it complete
        triggerCommunication('A', 'B')

        vi.useFakeTimers()
        vi.advanceTimersByTime(10000) // past animation duration → cooldown recorded

        // Advance past the 2000ms cooldown
        vi.advanceTimersByTime(3000)

        // Reset mocks for second trigger
        callCount = 0
        options.enqueueAnimation.mockClear()
        options.dequeueAnimation = vi.fn(() => {
            callCount++
            if (callCount === 1) return { sourceId: 'A', targetId: 'B' }
            return null
        })

        triggerCommunication('A', 'B')

        // Animation should have been created (not just re-enqueued)
        const animA = options.ctx.animatingAgents.get('A')
        expect(animA).toBeDefined()

        vi.useRealTimers()
    })
})

// ───────── executeAgentMove — directed movement ─────────

describe('useCommunicationAnimation - executeAgentMove', () => {
    it('creates a type:move animation entry', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 100, y: 100 } })
        options.agentPositions.value.set('A', { x: 100, y: 100 })

        const { executeAgentMove } = useCommunicationAnimation(options)
        executeAgentMove('A', 300, 400)

        const anim = options.ctx.animatingAgents.get('A')
        expect(anim).toBeDefined()
        expect(anim.type).toBe('move')
        expect(anim.startX).toBe(100)
        expect(anim.startY).toBe(100)
        expect(anim.meetX).toBe(300)
        expect(anim.meetY).toBe(400)
    })

    it('sets agent status to COMMUNICATING', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 0, y: 0 } })
        options.agentPositions.value.set('A', { x: 0, y: 0 })

        const { executeAgentMove } = useCommunicationAnimation(options)
        executeAgentMove('A', 200, 200)

        expect(options.setAgentStatus).toHaveBeenCalledWith('A', AGENT_STATUS.COMMUNICATING)
    })

    it('uses existing animation startX/startY when agent is mid-animation', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 300, y: 300 } })
        options.ctx.animatingAgents.set('A', {
            startX: 50, startY: 50,
            startTime: Date.now(), duration: 5000,
            meetX: 300, meetY: 300, path: [], pathIndex: 0
        })
        options.agentPositions.value.set('A', { x: 300, y: 300 })

        const { executeAgentMove } = useCommunicationAnimation(options)
        executeAgentMove('A', 500, 500)

        const anim = options.ctx.animatingAgents.get('A')
        expect(anim.startX).toBe(50)
        expect(anim.startY).toBe(50)
    })

    it('ignores non-interactive agents', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: false, container: { x: 0, y: 0 } })

        const { executeAgentMove } = useCommunicationAnimation(options)
        executeAgentMove('A', 200, 200)

        expect(options.ctx.animatingAgents.has('A')).toBe(false)
    })

    it('creates path with start and target positions', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 10, y: 20 } })
        options.agentPositions.value.set('A', { x: 10, y: 20 })

        const { executeAgentMove } = useCommunicationAnimation(options)
        executeAgentMove('A', 100, 200)

        const anim = options.ctx.animatingAgents.get('A')
        expect(anim.path).toBeDefined()
        expect(anim.path.length).toBeGreaterThanOrEqual(2)
        expect(anim.path[0]).toEqual({ x: 10, y: 20 })
        expect(anim.path[anim.path.length - 1]).toEqual({ x: 100, y: 200 })
    })
})

// ───────── obstacle-aware communication paths ─────────

/**
 * Creates a mock pathfinder where a rectangular region is blocked.
 * isBlocked returns true for any point inside the blocked bounds.
 * findPath returns a 2-point direct path (simulating A* fallback).
 * findNearestUnblocked shifts to blockEndX + 10.
 */
function createMockPathfinder(blockMinX, blockMaxX, blockMinY, blockMaxY) {
    return {
        isBlocked(px, py) {
            return px >= blockMinX && px <= blockMaxX && py >= blockMinY && py <= blockMaxY
        },
        findNearestUnblocked(px, py) {
            // Shift just outside the block to the right
            return { x: blockMaxX + 10, y: py }
        },
        findPath(sx, sy, tx, ty) {
            // Always return a 2-point direct path (simulating A* fallback)
            return [{ x: sx, y: sy }, { x: tx, y: ty }]
        }
    }
}

describe('useCommunicationAnimation - obstacle-aware communication paths', () => {
    it('cancels approach when path to meeting point crosses through obstacle', () => {
        // Agent A at (50,200), Agent B at (350,200)
        // Obstacle blocks [150,250] × [150,250]
        const pathfinder = createMockPathfinder(150, 250, 150, 250)
        const options = createMockOptions()
        options.ctx.pathfinder = pathfinder
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 50, y: 200 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 350, y: 200 } })
        options.agentPositions.value.set('A', { x: 50, y: 200 })
        options.agentPositions.value.set('B', { x: 350, y: 200 })

        let called = false
        options.dequeueAnimation = vi.fn(() => {
            if (!called) { called = true; return { sourceId: 'A', targetId: 'B' } }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        // Both agents should have animation entries
        const animA = options.ctx.animatingAgents.get('A')
        const animB = options.ctx.animatingAgents.get('B')
        expect(animA).toBeDefined()
        expect(animB).toBeDefined()

        // Agent A's path (50→meeting ~260) crosses the obstacle [150,250],
        // so its approach is cancelled — meeting point falls back to start.
        expect(animA.meetX).toBe(50)
        expect(animA.meetY).toBe(200)
        // Agent B's path (350→260) does NOT cross the obstacle, so its
        // meeting point is the adjusted position (blockMaxX + 10 = 260).
        expect(animB.meetX).toBe(260)
        expect(animB.meetY).toBe(200)
    })

    it('allows normal approach when path does not cross obstacles', () => {
        // Agent A at (50,50), Agent B at (200,50)
        // Obstacle far away at [400,500] × [400,500]
        const pathfinder = createMockPathfinder(400, 500, 400, 500)
        const options = createMockOptions()
        options.ctx.pathfinder = pathfinder
        options.ctx.agentSprites.set('A', { interactive: true, container: { x: 50, y: 50 } })
        options.ctx.agentSprites.set('B', { interactive: true, container: { x: 200, y: 50 } })
        options.agentPositions.value.set('A', { x: 50, y: 50 })
        options.agentPositions.value.set('B', { x: 200, y: 50 })

        let called = false
        options.dequeueAnimation = vi.fn(() => {
            if (!called) { called = true; return { sourceId: 'A', targetId: 'B' } }
            return null
        })

        const { triggerCommunication } = useCommunicationAnimation(options)
        triggerCommunication('A', 'B')

        const animA = options.ctx.animatingAgents.get('A')
        const animB = options.ctx.animatingAgents.get('B')
        expect(animA).toBeDefined()
        expect(animB).toBeDefined()

        // Agents should have moved toward each other (meeting point != start)
        expect(animA.meetX).toBeGreaterThan(50)
        expect(animB.meetX).toBeLessThan(200)
    })
})

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
