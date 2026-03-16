/**
 * @fileoverview Unit tests for useObstacleManager composable
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { ref, reactive } from 'vue'
import { parseHexColor } from '../composables/spatial/useObstacleManager.js'

// ───────── parseHexColor (exported helper) ─────────

describe('parseHexColor', () => {
    it('parses #ff0000 to 0xff0000', () => {
        expect(parseHexColor('#ff0000')).toBe(0xff0000)
    })

    it('parses #00ff00 to 0x00ff00', () => {
        expect(parseHexColor('#00ff00')).toBe(0x00ff00)
    })

    it('parses without # prefix', () => {
        expect(parseHexColor('0000ff')).toBe(0x0000ff)
    })

    it('returns default gray for null input', () => {
        expect(parseHexColor(null)).toBe(0x666666)
    })

    it('returns default gray for undefined', () => {
        expect(parseHexColor(undefined)).toBe(0x666666)
    })

    it('returns default gray for non-string', () => {
        expect(parseHexColor(42)).toBe(0x666666)
    })

    it('parses white correctly', () => {
        expect(parseHexColor('#f9fafb')).toBe(0xf9fafb)
    })

    it('parses black correctly', () => {
        expect(parseHexColor('#1A1A1A')).toBe(0x1A1A1A)
    })
})

// ───────── PixiJS Mock — all classes defined inline inside factory ─────────

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
        Container: MockContainer,
        Graphics: MockGraphics,
        Sprite: class Sprite {
            constructor() { this.anchor = { set() { } }; this.width = 0; this.height = 0 }
        },
        Assets: { load: vi.fn() },
        Rectangle: class Rectangle {
            constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h }
        },
        Circle: class Circle {
            constructor(x, y, r) { this.x = x; this.y = y; this.radius = r }
        }
    }
})

// Import after mock setup
let useObstacleManager
let Container, Graphics

beforeAll(async () => {
    const mod = await import('../composables/spatial/useObstacleManager.js')
    useObstacleManager = mod.useObstacleManager
    const pixi = await import('pixi.js')
    Container = pixi.Container
    Graphics = pixi.Graphics
})

function createMockCtx() {
    return reactive({
        app: null,
        obstacleContainer: new Container(),
        placementGhostGraphics: new Graphics(),
        agentSprites: new Map(),
        obstacleSprites: new Map(),
        pathfinder: null
    })
}

function createMockSpatialConfig() {
    return {
        value: {
            obstacles: [
                {
                    id: 'wall1',
                    shape: 'rectangle',
                    position: { x: 100, y: 100 },
                    size: { width: 80, height: 40 },
                    color: '#ff0000',
                    type: 'wall',
                    collision: true
                }
            ]
        }
    }
}

// ───────── useObstacleManager composable ─────────

describe('useObstacleManager', () => {
    it('initializes with no selected obstacle', () => {
        const ctx = createMockCtx()
        const { selectedObstacleId, showDeleteConfirm } = useObstacleManager({
            ctx,
            canvasRef: ref(null),
            spatialConfig: createMockSpatialConfig(),
            emit: vi.fn(),
            initPathfinder: vi.fn(),
            scheduleConfigSave: vi.fn(),
            snapToGrid: (v) => v
        })
        expect(selectedObstacleId.value).toBeNull()
        expect(showDeleteConfirm.value).toBe(false)
    })

    it('deselectObstacle clears selection', () => {
        const ctx = createMockCtx()
        const { selectedObstacleId, deselectObstacle } = useObstacleManager({
            ctx,
            canvasRef: ref(null),
            spatialConfig: createMockSpatialConfig(),
            emit: vi.fn(),
            initPathfinder: vi.fn(),
            scheduleConfigSave: vi.fn(),
            snapToGrid: (v) => v
        })
        selectedObstacleId.value = 'wall1'
        deselectObstacle()
        expect(selectedObstacleId.value).toBeNull()
    })

    it('cleanup clears obstacle sprites', () => {
        const ctx = createMockCtx()
        ctx.obstacleSprites.set('wall1', { container: {}, graphics: {} })

        const { cleanup } = useObstacleManager({
            ctx,
            canvasRef: ref(null),
            spatialConfig: createMockSpatialConfig(),
            emit: vi.fn(),
            initPathfinder: vi.fn(),
            scheduleConfigSave: vi.fn(),
            snapToGrid: (v) => v
        })
        cleanup()
        expect(ctx.obstacleSprites.size).toBe(0)
    })

    it('confirmDeleteObstacle sets delete flag for large obstacle', () => {
        const ctx = createMockCtx()
        // Add a large obstacle to sprite map so confirmDeleteObstacle finds it
        ctx.obstacleSprites.set('wall1', {
            shape: 'rectangle',
            data: { size: { width: 200, height: 200 } },
            container: new Container(),
            graphics: new Graphics(),
            highlight: new Graphics()
        })
        const { selectedObstacleId, showDeleteConfirm, confirmDeleteObstacle } = useObstacleManager({
            ctx,
            canvasRef: ref(null),
            spatialConfig: createMockSpatialConfig(),
            emit: vi.fn(),
            initPathfinder: vi.fn(),
            scheduleConfigSave: vi.fn(),
            snapToGrid: (v) => v
        })
        selectedObstacleId.value = 'wall1'
        confirmDeleteObstacle()
        expect(showDeleteConfirm.value).toBe(true)
    })

    it('confirmDeleteObstacle does nothing when no obstacle selected', () => {
        const ctx = createMockCtx()
        const { showDeleteConfirm, confirmDeleteObstacle } = useObstacleManager({
            ctx,
            canvasRef: ref(null),
            spatialConfig: createMockSpatialConfig(),
            emit: vi.fn(),
            initPathfinder: vi.fn(),
            scheduleConfigSave: vi.fn(),
            snapToGrid: (v) => v
        })
        confirmDeleteObstacle()
        expect(showDeleteConfirm.value).toBe(false)
    })
})
