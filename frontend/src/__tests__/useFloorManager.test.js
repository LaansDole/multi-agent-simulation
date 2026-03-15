/**
 * @fileoverview Unit tests for useFloorManager composable
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { reactive } from 'vue'

// ───────── PixiJS Mock ─────────

vi.mock('pixi.js', () => {
    class MockContainer {
        constructor() {
            this.children = []
        }
        addChild(child) { this.children.push(child); return child }
        removeChildren() { this.children = [] }
    }

    class MockGraphics {
        constructor() {
            this.x = 0
            this.y = 0
            this.children = []
        }
        rect() { return this }
        fill() { return this }
        addChild(child) { this.children.push(child); return child }
    }

    class MockSprite {
        constructor() {
            this.width = 0
            this.height = 0
        }
    }

    return {
        Container: MockContainer,
        Graphics: MockGraphics,
        Sprite: MockSprite,
        Assets: {
            load: vi.fn()
        }
    }
})

// Import after mock setup
let useFloorManager
let Container, Assets

beforeAll(async () => {
    const mod = await import('../composables/spatial/useFloorManager.js')
    useFloorManager = mod.useFloorManager
    const pixi = await import('pixi.js')
    Container = pixi.Container
    Assets = pixi.Assets
})

function createMockCtx(overrides = {}) {
    return reactive({
        app: { renderer: {} },
        floorContainer: new Container(),
        spatialConfig: {
            floors: []
        },
        ...overrides
    })
}

// ───────── useFloorManager composable ─────────

describe('useFloorManager', () => {
    it('returns drawFloors and cleanup functions', () => {
        const ctx = createMockCtx()
        const manager = useFloorManager({ ctx })
        expect(typeof manager.drawFloors).toBe('function')
        expect(typeof manager.cleanup).toBe('function')
    })

    it('drawFloors exits early when floorContainer is missing', async () => {
        const ctx = createMockCtx({ floorContainer: null })
        const { drawFloors } = useFloorManager({ ctx })
        // Should not throw
        await drawFloors()
    })

    it('drawFloors exits early when app renderer is missing', async () => {
        const ctx = createMockCtx({ app: null })
        const { drawFloors } = useFloorManager({ ctx })
        await drawFloors()
    })

    it('drawFloors exits early when floors array is empty', async () => {
        const ctx = createMockCtx()
        ctx.spatialConfig = { floors: [] }
        const { drawFloors } = useFloorManager({ ctx })
        await drawFloors()
        expect(ctx.floorContainer.children.length).toBe(0)
    })

    it('drawFloors reads floors from ctx.spatialConfig (not .value)', async () => {
        const mockTexture = { valid: true }
        Assets.load.mockResolvedValue(mockTexture)

        const ctx = createMockCtx()
        ctx.spatialConfig = {
            floors: [
                {
                    id: 'floor-1',
                    position: { x: 40, y: 80 },
                    width: 40,
                    height: 40,
                    sprite: 'wood.png',
                    color: '#8b5a2b'
                }
            ]
        }

        const { drawFloors } = useFloorManager({ ctx })
        await drawFloors()

        // Floor container should have one child (the floor Graphics group)
        expect(ctx.floorContainer.children.length).toBe(1)
    })

    it('drawFloors renders color fallback when sprite fails to load', async () => {
        Assets.load.mockRejectedValue(new Error('Sprite not found'))

        const ctx = createMockCtx()
        ctx.spatialConfig = {
            floors: [
                {
                    id: 'floor-fallback',
                    position: { x: 0, y: 0 },
                    width: 40,
                    height: 40,
                    sprite: 'missing.png',
                    color: '#ff0000'
                }
            ]
        }

        const { drawFloors } = useFloorManager({ ctx })
        await drawFloors()

        // Should still render with color fallback
        expect(ctx.floorContainer.children.length).toBe(1)
    })

    it('drawFloors renders color when no sprite is specified', async () => {
        const ctx = createMockCtx()
        ctx.spatialConfig = {
            floors: [
                {
                    id: 'floor-color-only',
                    position: { x: 120, y: 120 },
                    width: 40,
                    height: 40,
                    color: '#228b22'
                }
            ]
        }

        const { drawFloors } = useFloorManager({ ctx })
        await drawFloors()

        expect(ctx.floorContainer.children.length).toBe(1)
    })

    it('cleanup clears floor sprites map', () => {
        const ctx = createMockCtx()
        const { cleanup } = useFloorManager({ ctx })
        // Should not throw
        cleanup()
    })
})
