/**
 * @fileoverview Unit tests for useAnimationLoop composable
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ref } from 'vue'

// ───────── PixiJS Mock ─────────

vi.mock('pixi.js', () => {
    class MockGraphics {
        constructor() { this.visible = true }
        clear() { return this }
        rect() { return this }
        circle() { return this }
        fill() { return this }
        stroke() { return this }
        moveTo() { return this }
        lineTo() { return this }
        closePath() { return this }
    }

    return {
        Container: class MockContainer {
            constructor() {
                this.children = []
                this.x = 0
                this.y = 0
                this.scale = { set() { } }
            }
            addChild(child) { this.children.push(child); return child }
            removeChildren() { this.children = [] }
        },
        Graphics: MockGraphics,
        Sprite: class Sprite {
            constructor() { this.anchor = { set() { } }; this.width = 0; this.height = 0; this.visible = true; this.texture = null }
        },
        Assets: { load: vi.fn(() => Promise.resolve(null)) }
    }
})

// ───────── Imports ─────────

let useAnimationLoop
let Graphics

beforeAll(async () => {
    const mod = await import('../composables/spatial/useAnimationLoop.js')
    useAnimationLoop = mod.useAnimationLoop
    const pixi = await import('pixi.js')
    Graphics = pixi.Graphics
})

// ───────── Constants ─────────

const AGENT_STATUS = {
    IDLE: 'idle',
    THINKING: 'thinking',
    COMMUNICATING: 'communicating',
    ERROR: 'error'
}

const STATUS_COLORS = {
    idle: 0x6b7280,
    thinking: 0x3b82f6,
    communicating: 0x22c55e,
    error: 0xef4444
}

const STATUS_PULSE = {
    idle: 0,
    thinking: 2.5,
    communicating: 1.5,
    error: 3.0
}

const MIN_AGENT_SEPARATION = 40

// ───────── Helpers ─────────

function createMockCtx() {
    return {
        app: { renderer: { width: 800, height: 600 } },
        agentSprites: new Map(),
        animatingAgents: new Map(),
        trailGraphics: new Graphics(),
        connectionGraphics: new Graphics()
    }
}

function createMockOptions(overrides = {}) {
    const ctx = createMockCtx()
    return {
        ctx,
        canvasRef: ref(null),
        agentPositions: ref(new Map()),
        trailParticles: ref([]),
        activeConnections: ref([]),
        visibleBadges: [],
        getAgentStatus: vi.fn(() => AGENT_STATUS.IDLE),
        getAgentEmote: vi.fn(() => null),
        addTrailParticle: vi.fn(),
        cleanupTrailParticles: vi.fn(),
        cleanupConnections: vi.fn(),
        updateIdleWanders: vi.fn(),
        resetWanderCooldown: vi.fn(),
        STATUS_COLORS,
        STATUS_PULSE,
        AGENT_STATUS,
        MIN_AGENT_SEPARATION,
        ...overrides
    }
}

// ───────── renderLoop ─────────

describe('useAnimationLoop - renderLoop', () => {
    it('returns renderLoop function', () => {
        const options = createMockOptions()
        const { renderLoop } = useAnimationLoop(options)
        expect(typeof renderLoop).toBe('function')
    })

    it('renderLoop executes without error on empty state', () => {
        const options = createMockOptions()
        const { renderLoop } = useAnimationLoop(options)
        expect(() => renderLoop()).not.toThrow()
    })

    it('renderLoop calls updateIdleWanders', () => {
        const options = createMockOptions()
        const { renderLoop } = useAnimationLoop(options)
        renderLoop()
        expect(options.updateIdleWanders).toHaveBeenCalled()
    })

    it('renderLoop calls cleanupConnections and cleanupTrailParticles', () => {
        const options = createMockOptions()
        const { renderLoop } = useAnimationLoop(options)
        renderLoop()
        expect(options.cleanupConnections).toHaveBeenCalled()
        expect(options.cleanupTrailParticles).toHaveBeenCalled()
    })
})

// ───────── updateActiveStates (via renderLoop) ─────────

describe('useAnimationLoop - updateActiveStates', () => {
    it('updates glow for idle agent', () => {
        const glow = new Graphics()
        const clearSpy = vi.spyOn(glow, 'clear')
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow,
            container: { scale: { set: vi.fn() } }
        })
        options.getAgentStatus = vi.fn(() => AGENT_STATUS.IDLE)

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Glow should have been cleared and redrawn
        expect(clearSpy).toHaveBeenCalled()
    })

    it('skips non-interactive agents', () => {
        const glow = new Graphics()
        const clearSpy = vi.spyOn(glow, 'clear')
        const options = createMockOptions()
        options.ctx.agentSprites.set('node1', {
            interactive: false,
            glow,
            container: { scale: { set: vi.fn() } }
        })

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Glow should NOT have been touched for non-interactive
        expect(clearSpy).not.toHaveBeenCalled()
    })

    it('skips agents without glow', () => {
        const options = createMockOptions()
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow: null,
            container: { scale: { set: vi.fn() } }
        })

        const { renderLoop } = useAnimationLoop(options)
        expect(() => renderLoop()).not.toThrow()
    })

    it('reduces sprite opacity for deceased agents in sandbox mode', () => {
        const glow = new Graphics()
        const sprite = { alpha: 1.0 }
        const options = createMockOptions({
            sandboxMode: ref(true),
            getAgentCondition: vi.fn(() => 'deceased'),
            CONDITION_COLORS: { deceased: 0x6b7280 },
            CONDITION_PULSE: { deceased: 0.8 }
        })
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow,
            sprite,
            container: { scale: { set: vi.fn() } }
        })

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        expect(sprite.alpha).toBe(0.4)
    })

    it('restores sprite opacity for non-deceased agents in sandbox mode', () => {
        const glow = new Graphics()
        const sprite = { alpha: 0.4 }
        const options = createMockOptions({
            sandboxMode: ref(true),
            getAgentCondition: vi.fn(() => 'healthy'),
            CONDITION_COLORS: { healthy: 0x22c55e },
            CONDITION_PULSE: { healthy: 0 }
        })
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow,
            sprite,
            container: { scale: { set: vi.fn() } }
        })

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        expect(sprite.alpha).toBe(1.0)
    })
})

// ───────── applyPerFrameSeparation (via renderLoop) ─────────

describe('useAnimationLoop - applyPerFrameSeparation', () => {
    it('pushes overlapping animating agents apart', () => {
        const options = createMockOptions()

        // Two agents very close but not identical (dist > 0 required by the guard)
        const ag1Container = { x: 105, y: 100, scale: { set: vi.fn() } }
        const ag2Container = { x: 110, y: 100, scale: { set: vi.fn() } }
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow: null,
            container: ag1Container,
            sprite: {}
        })
        options.ctx.agentSprites.set('agent2', {
            interactive: true,
            glow: null,
            container: ag2Container,
            sprite: {}
        })

        // Provide complete animation entries so updateAnimations doesn't blow up.
        // Use a path that keeps agents at desired positions and very short duration.
        const now = Date.now()
        options.ctx.animatingAgents.set('agent1', {
            type: 'wander',
            startTime: now,
            duration: 100000, // long duration so progress is ~0
            startX: 105, startY: 100,
            meetX: 105, meetY: 100,
            path: [{ x: 105, y: 100 }],
            pathIndex: 0,
            currentFrame: 1,
            lastTrailTime: 0
        })
        options.ctx.animatingAgents.set('agent2', {
            type: 'wander',
            startTime: now,
            duration: 100000,
            startX: 110, startY: 100,
            meetX: 110, meetY: 100,
            path: [{ x: 110, y: 100 }],
            pathIndex: 0,
            currentFrame: 1,
            lastTrailTime: 0
        })

        // Set agent positions for restoration
        options.agentPositions.value.set('agent1', { x: 105, y: 100 })
        options.agentPositions.value.set('agent2', { x: 110, y: 100 })

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Initial distance was 5, well under MIN_AGENT_SEPARATION (40)
        // After separation they should be pushed further apart
        const dx = ag1Container.x - ag2Container.x
        const dist = Math.abs(dx)
        expect(dist).toBeGreaterThan(5)
    })

    it('does not affect distant agents', () => {
        const options = createMockOptions()

        const ag1Container = { x: 100, y: 100, scale: { set: vi.fn() } }
        const ag2Container = { x: 500, y: 500, scale: { set: vi.fn() } }
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow: null,
            container: ag1Container,
            sprite: {}
        })
        options.ctx.agentSprites.set('agent2', {
            interactive: true,
            glow: null,
            container: ag2Container,
            sprite: {}
        })

        const now = Date.now()
        options.ctx.animatingAgents.set('agent1', {
            type: 'wander',
            startTime: now,
            duration: 100000,
            startX: 100, startY: 100,
            meetX: 100, meetY: 100,
            path: [{ x: 100, y: 100 }],
            pathIndex: 0,
            currentFrame: 1,
            lastTrailTime: 0
        })
        options.ctx.animatingAgents.set('agent2', {
            type: 'wander',
            startTime: now,
            duration: 100000,
            startX: 500, startY: 500,
            meetX: 500, meetY: 500,
            path: [{ x: 500, y: 500 }],
            pathIndex: 0,
            currentFrame: 1,
            lastTrailTime: 0
        })

        options.agentPositions.value.set('agent1', { x: 100, y: 100 })
        options.agentPositions.value.set('agent2', { x: 500, y: 500 })

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Distant agents should remain at their positions
        expect(ag1Container.x).toBe(100)
        expect(ag1Container.y).toBe(100)
        expect(ag2Container.x).toBe(500)
        expect(ag2Container.y).toBe(500)
    })
})

// ───────── drawConnections (via renderLoop with active connections) ─────────

describe('useAnimationLoop - drawConnections', () => {
    it('renders connections between agents', () => {
        const options = createMockOptions()

        options.ctx.agentSprites.set('A', {
            interactive: true,
            glow: null,
            container: { x: 100, y: 100, scale: { set: vi.fn() } }
        })
        options.ctx.agentSprites.set('B', {
            interactive: true,
            glow: null,
            container: { x: 300, y: 300, scale: { set: vi.fn() } }
        })

        // Add an active connection
        options.activeConnections = ref([{
            source: 'A',
            target: 'B',
            startTime: Date.now(),
            duration: 5000
        }])

        const clearSpy = vi.spyOn(options.ctx.connectionGraphics, 'clear')
        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        expect(clearSpy).toHaveBeenCalled()
    })
})

// ───────── updateLabelColors — reset when floors cleared ─────────

describe('useAnimationLoop - updateLabelColors reset', () => {
    it('resets labels from bright-floor style to dark-floor defaults when floors are cleared', () => {
        const labelStyle = {
            fill: '#1e1e3a',           // dark text (bright-floor mode)
            stroke: { color: '#f9fafb', width: 2 },
            dropShadow: { color: '#f9fafb', blur: 4, distance: 2, alpha: 0.4 }
        }
        const label = { style: labelStyle }
        const options = createMockOptions()

        // Set up agent with label in bright-floor style
        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow: new Graphics(),
            label,
            container: { x: 200, y: 200, scale: { set: vi.fn() } }
        })

        // First run WITH floors so labelColorState gets populated with bright=true
        options.ctx.spatialConfig = {
            floors: [{
                position: { x: 0, y: 0 },
                width: 1000,
                height: 1000,
                color: '#f0f0f0' // bright floor
            }]
        }

        const { renderLoop } = useAnimationLoop(options)
        renderLoop() // populates labelColorState with bright: true

        // Verify label switched to dark text (bright floor)
        expect(labelStyle.fill).toBe('#1e1e3a')

        // Now clear the floors
        options.ctx.spatialConfig = { floors: [] }
        renderLoop()

        // Label should reset to white text (dark-floor defaults)
        expect(labelStyle.fill).toBe('#f9fafb')
        expect(labelStyle.stroke.color).toBe('#1A1A1A')
        expect(labelStyle.dropShadow.color).toBe('#1A1A1A')
        expect(labelStyle.dropShadow.alpha).toBe(0.8)
    })

    it('does not re-apply styles when already in dark-floor mode and floors are empty', () => {
        const labelStyle = {
            fill: '#f9fafb',           // already white (dark-floor mode)
            stroke: { color: '#1A1A1A', width: 3 },
            dropShadow: { color: '#1A1A1A', blur: 4, distance: 2, alpha: 0.8 }
        }
        const label = { style: labelStyle }
        const options = createMockOptions()

        options.ctx.agentSprites.set('agent1', {
            interactive: true,
            glow: new Graphics(),
            label,
            container: { x: 200, y: 200, scale: { set: vi.fn() } }
        })

        // No floors at all
        options.ctx.spatialConfig = { floors: [] }

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Should remain in dark-floor defaults — no change
        expect(labelStyle.fill).toBe('#f9fafb')
    })

    it('adapts non-interactive (static marker) labels on bright floors', () => {
        const labelStyle = {
            fill: '#c9d1d9',
            stroke: { color: '#1A1A1A', width: 2 },
            dropShadow: { color: '#1A1A1A', blur: 3, distance: 1, alpha: 0.8 }
        }
        const label = { style: labelStyle }
        const options = createMockOptions()

        // Non-interactive marker
        options.ctx.agentSprites.set('StartNode', {
            interactive: false,
            glow: null,
            label,
            container: { x: 200, y: 200, scale: { set: vi.fn() } }
        })

        // Bright floor covering the marker position
        options.ctx.spatialConfig = {
            floors: [{
                position: { x: 0, y: 0 },
                width: 1000,
                height: 1000,
                color: '#f0f0f0'
            }]
        }

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Marker label should switch to dark text on bright floor
        expect(labelStyle.fill).toBe('#1e1e3a')
        expect(labelStyle.stroke.width).toBe(1.5) // thinner for markers
    })

    it('resets non-interactive labels to muted gray when floors are cleared', () => {
        const labelStyle = {
            fill: '#1e1e3a',
            stroke: { color: '#f9fafb', width: 1.5 },
            dropShadow: { color: '#f9fafb', blur: 3, distance: 1, alpha: 0.4 }
        }
        const label = { style: labelStyle }
        const options = createMockOptions()

        options.ctx.agentSprites.set('StartNode', {
            interactive: false,
            glow: null,
            label,
            container: { x: 200, y: 200, scale: { set: vi.fn() } }
        })

        // First run WITH bright floors
        options.ctx.spatialConfig = {
            floors: [{
                position: { x: 0, y: 0 },
                width: 1000,
                height: 1000,
                color: '#f0f0f0'
            }]
        }

        const { renderLoop } = useAnimationLoop(options)
        renderLoop()

        // Now clear floors
        options.ctx.spatialConfig = { floors: [] }
        renderLoop()

        // Should reset to muted gray (marker default), not full white
        expect(labelStyle.fill).toBe('#c9d1d9')
        expect(labelStyle.stroke.width).toBe(2) // marker width
    })
})
