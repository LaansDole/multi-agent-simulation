/**
 * @fileoverview Unit tests for useAgentRenderer composable
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ref } from 'vue'

// ───────── PixiJS Mock ─────────

vi.mock('pixi.js', () => {
    class MockContainer {
        constructor() {
            this.children = []
            this.x = 0
            this.y = 0
            this.eventMode = 'none'
            this.cursor = 'default'
            this.alpha = 1
            this.visible = true
        }
        addChild(child) { this.children.push(child); return child }
        removeChildren() { this.children = [] }
        setChildIndex() { }
        on() { }
    }

    class MockGraphics {
        constructor() {
            this.visible = true
            this._lastFill = null
        }
        clear() { this._lastFill = null; return this }
        rect() { return this }
        circle() { return this }
        fill(opts) { this._lastFill = opts; return this }
        stroke() { return this }
        moveTo() { return this }
        lineTo() { return this }
        closePath() { return this }
    }

    return {
        Container: MockContainer,
        Graphics: MockGraphics,
        Sprite: class Sprite {
            constructor() { this.anchor = { set() { } }; this.width = 0; this.height = 0 }
        },
        Text: class Text {
            constructor(opts) {
                this.text = opts?.text || ''
                this.anchor = { set() { } }
                this.x = 0; this.y = 0
                this.visible = true
            }
        },
        TextStyle: class TextStyle {
            constructor(opts) { Object.assign(this, opts) }
        },
        Assets: { load: vi.fn(() => Promise.resolve(null)) }
    }
})

// ───────── Imports ─────────

let useAgentRenderer
let Container, Graphics

beforeAll(async () => {
    const mod = await import('../composables/spatial/useAgentRenderer.js')
    useAgentRenderer = mod.useAgentRenderer
    const pixi = await import('pixi.js')
    Container = pixi.Container
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

// ───────── Helpers ─────────

function createMockCtx() {
    return {
        app: { renderer: { width: 800, height: 600 }, stage: { addChild() { } } },
        agentContainer: new Container(),
        agentSprites: new Map(),
        animatingAgents: new Map()
    }
}

function createOptions(overrides = {}) {
    const ctx = createMockCtx()
    return {
        ctx,
        props: { nodes: [], edges: [], workflowFile: 'test.yaml' },
        emit: vi.fn(),
        agentPositions: ref(new Map()),
        visibleBadges: [],
        loadPositions: vi.fn(() => false),
        computeLayout: vi.fn(),
        setAgentPosition: vi.fn(),
        getAgentStatus: vi.fn(() => AGENT_STATUS.IDLE),
        isInteractiveNode: vi.fn((node) => node.type === 'agent' || node.type === 'human'),
        buildEdgeAdjacency: vi.fn(),
        initIdleWanderTimers: vi.fn(),
        normalizeWorkflowName: vi.fn((name) => name),
        spatialConfig: { value: { obstacles: [] } },
        STATUS_COLORS,
        AGENT_STATUS,
        setNodeTypes: vi.fn(),
        ...overrides
    }
}

// ───────── buildScene ─────────

describe('useAgentRenderer - buildScene', () => {
    it('returns buildScene and drawStatusGlow functions', () => {
        const options = createOptions()
        const result = useAgentRenderer(options)
        expect(typeof result.buildScene).toBe('function')
        expect(typeof result.drawStatusGlow).toBe('function')
    })

    it('early returns when app is null', () => {
        const options = createOptions()
        options.ctx.app = null

        const { buildScene } = useAgentRenderer(options)
        expect(() => buildScene()).not.toThrow()

        // No sprites should be created
        expect(options.ctx.agentSprites.size).toBe(0)
    })

    it('early returns when agentContainer is null', () => {
        const options = createOptions()
        options.ctx.agentContainer = null

        const { buildScene } = useAgentRenderer(options)
        expect(() => buildScene()).not.toThrow()

        expect(options.ctx.agentSprites.size).toBe(0)
    })

    it('clears existing sprites before building', () => {
        const options = createOptions()
        options.ctx.agentSprites.set('old-agent', { container: {}, sprite: {} })
        options.props.nodes = []

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        expect(options.ctx.agentSprites.size).toBe(0)
    })

    it('creates static markers for non-interactive nodes', () => {
        const options = createOptions()
        options.props.nodes = [
            { id: 'StartNode', type: 'start' }
        ]
        options.agentPositions.value.set('StartNode', { x: 100, y: 100 })

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        const sprite = options.ctx.agentSprites.get('StartNode')
        expect(sprite).toBeDefined()
        expect(sprite.interactive).toBe(false)
    })

    it('creates interactive sprites for agent nodes', async () => {
        const options = createOptions()
        options.props.nodes = [
            { id: 'Doctor', type: 'agent' }
        ]
        options.agentPositions.value.set('Doctor', { x: 200, y: 200 })

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        // Wait for async sprite creation
        await vi.waitFor(() => {
            expect(options.ctx.agentSprites.has('Doctor')).toBe(true)
        })

        const sprite = options.ctx.agentSprites.get('Doctor')
        expect(sprite.interactive).toBe(true)
    })

    it('calls buildEdgeAdjacency and initIdleWanderTimers', () => {
        const options = createOptions()
        options.props.nodes = [
            { id: 'A', type: 'start' }
        ]
        options.props.edges = [{ from: 'A', to: 'B' }]

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        expect(options.buildEdgeAdjacency).toHaveBeenCalledWith([{ from: 'A', to: 'B' }])
        expect(options.initIdleWanderTimers).toHaveBeenCalled()
    })

    it('calls computeLayout when no saved positions', () => {
        const options = createOptions()
        options.loadPositions = vi.fn(() => false)
        options.props.nodes = [{ id: 'A', type: 'start' }]
        options.props.edges = []

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        expect(options.computeLayout).toHaveBeenCalled()
    })

    it('skips computeLayout when positions are loaded', () => {
        const options = createOptions()
        options.loadPositions = vi.fn(() => true)
        options.props.nodes = [{ id: 'A', type: 'start' }]

        const { buildScene } = useAgentRenderer(options)
        buildScene()

        expect(options.computeLayout).not.toHaveBeenCalled()
    })
})

// ───────── drawStatusGlow ─────────

describe('useAgentRenderer - drawStatusGlow', () => {
    it('draws idle glow with low alpha', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        drawStatusGlow(glow, AGENT_STATUS.IDLE)

        expect(glow._lastFill).toBeDefined()
        expect(glow._lastFill.color).toBe(STATUS_COLORS.idle)
        expect(glow._lastFill.alpha).toBe(0.15)
    })

    it('draws thinking glow with higher alpha', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        drawStatusGlow(glow, AGENT_STATUS.THINKING)

        expect(glow._lastFill.color).toBe(STATUS_COLORS.thinking)
        expect(glow._lastFill.alpha).toBe(0.35)
    })

    it('draws communicating glow with correct color', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        drawStatusGlow(glow, AGENT_STATUS.COMMUNICATING)

        expect(glow._lastFill.color).toBe(STATUS_COLORS.communicating)
        expect(glow._lastFill.alpha).toBe(0.35)
    })

    it('draws error glow with correct color', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        drawStatusGlow(glow, AGENT_STATUS.ERROR)

        expect(glow._lastFill.color).toBe(STATUS_COLORS.error)
        expect(glow._lastFill.alpha).toBe(0.35)
    })

    it('defaults to idle color for unknown status', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        drawStatusGlow(glow, 'unknown-status')

        // Should fall back to idle color
        expect(glow._lastFill.color).toBe(STATUS_COLORS.idle)
    })

    it('clears previous glow before drawing', () => {
        const options = createOptions()
        const { drawStatusGlow } = useAgentRenderer(options)

        const glow = new Graphics()
        const clearSpy = vi.spyOn(glow, 'clear')

        drawStatusGlow(glow, AGENT_STATUS.IDLE)
        expect(clearSpy).toHaveBeenCalled()
    })
})
