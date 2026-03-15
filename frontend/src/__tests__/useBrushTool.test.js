import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBrushTool } from '../composables/spatial/useBrushTool.js'

// Mock useSpatialConfig
vi.mock('../composables/useSpatialConfig.js', () => ({
    useSpatialConfig: () => ({
        removeFloorTile: vi.fn(() => true),
        getFloorTiles: vi.fn(() => []),
        removeObstacle: vi.fn(() => true),
        getConfig: vi.fn(() => ({ obstacles: [] })),
        markConfigChanged: vi.fn()
    })
}))

describe('useBrushTool', () => {
    let brushTool
    let addObstacleFn
    let addFloorFn
    let getActiveMode
    let getSelectedItem
    let getSelectedFloor

    beforeEach(() => {
        addObstacleFn = vi.fn()
        addFloorFn = vi.fn()
        getActiveMode = vi.fn(() => 'floors')
        getSelectedItem = vi.fn(() => ({ id: 'desk', name: 'Desk' }))
        getSelectedFloor = vi.fn(() => ({ id: 'wood', name: 'Wood' }))

        brushTool = useBrushTool({
            getActiveMode,
            getSelectedItem,
            getSelectedFloor,
            addObstacleFn,
            addFloorFn
        })
    })

    describe('toolMode', () => {
        it('defaults to pointer mode', () => {
            expect(brushTool.toolMode.value).toBe('pointer')
        })

        it('can switch to brush mode', () => {
            brushTool.setToolMode('brush')
            expect(brushTool.toolMode.value).toBe('brush')
        })

        it('can switch to eraser mode', () => {
            brushTool.setToolMode('eraser')
            expect(brushTool.toolMode.value).toBe('eraser')
        })

        it('can switch back to pointer mode', () => {
            brushTool.setToolMode('brush')
            brushTool.setToolMode('pointer')
            expect(brushTool.toolMode.value).toBe('pointer')
        })
    })

    describe('isToolActive', () => {
        it('returns false for pointer mode', () => {
            expect(brushTool.isToolActive()).toBe(false)
        })

        it('returns true for brush mode', () => {
            brushTool.setToolMode('brush')
            expect(brushTool.isToolActive()).toBe(true)
        })

        it('returns true for eraser mode', () => {
            brushTool.setToolMode('eraser')
            expect(brushTool.isToolActive()).toBe(true)
        })
    })

    describe('startStroke', () => {
        it('does nothing in pointer mode', () => {
            brushTool.startStroke(100, 100)
            expect(addFloorFn).not.toHaveBeenCalled()
            expect(addObstacleFn).not.toHaveBeenCalled()
            expect(brushTool._isStrokeActive()).toBe(false)
        })

        it('starts stroke and places floor in brush mode', () => {
            getActiveMode.mockReturnValue('floors')
            brushTool.setToolMode('brush')
            brushTool.startStroke(100, 100)

            expect(brushTool._isStrokeActive()).toBe(true)
            expect(addFloorFn).toHaveBeenCalledWith(100, 100)
        })

        it('starts stroke and places obstacle in brush mode', () => {
            getActiveMode.mockReturnValue('obstacles')
            brushTool.setToolMode('brush')
            brushTool.startStroke(200, 200)

            expect(brushTool._isStrokeActive()).toBe(true)
            expect(addObstacleFn).toHaveBeenCalledWith(200, 200)
        })

        it('records the starting cell as visited', () => {
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)

            const visited = brushTool._getVisitedCells()
            expect(visited.size).toBe(1)
            expect(visited.has('80,80')).toBe(true)
        })
    })

    describe('continueStroke', () => {
        it('does nothing when no stroke is active', () => {
            brushTool.setToolMode('brush')
            // No startStroke called
            brushTool.continueStroke(120, 120)
            expect(addFloorFn).not.toHaveBeenCalled()
        })

        it('places at new cells during active stroke', () => {
            getActiveMode.mockReturnValue('floors')
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)
            addFloorFn.mockClear()

            brushTool.continueStroke(120, 120)
            expect(addFloorFn).toHaveBeenCalledWith(120, 120)
        })

        it('skips duplicate cells in the same stroke', () => {
            getActiveMode.mockReturnValue('floors')
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)
            addFloorFn.mockClear()

            // Same cell (snaps to same grid position)
            brushTool.continueStroke(80, 80)
            expect(addFloorFn).not.toHaveBeenCalled()
        })

        it('places at multiple distinct cells', () => {
            getActiveMode.mockReturnValue('floors')
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)
            addFloorFn.mockClear()

            brushTool.continueStroke(120, 80)
            brushTool.continueStroke(160, 80)
            brushTool.continueStroke(200, 80)

            expect(addFloorFn).toHaveBeenCalledTimes(3)
        })
    })

    describe('endStroke', () => {
        it('clears stroke state', () => {
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)

            expect(brushTool._isStrokeActive()).toBe(true)
            expect(brushTool._getVisitedCells().size).toBe(1)

            brushTool.endStroke()

            expect(brushTool._isStrokeActive()).toBe(false)
            expect(brushTool._getVisitedCells().size).toBe(0)
        })

        it('allows new stroke after ending previous', () => {
            getActiveMode.mockReturnValue('floors')
            brushTool.setToolMode('brush')

            brushTool.startStroke(80, 80)
            brushTool.endStroke()
            addFloorFn.mockClear()

            // Starting a new stroke at same cell should work
            brushTool.startStroke(80, 80)
            expect(addFloorFn).toHaveBeenCalledWith(80, 80)
        })
    })

    describe('eraser mode', () => {
        it('starts eraser stroke in eraser mode', () => {
            brushTool.setToolMode('eraser')
            brushTool.startStroke(80, 80)

            expect(brushTool._isStrokeActive()).toBe(true)
            // Eraser calls removeFloorTile/removeObstacle, not addFloor/addObstacle
            expect(addFloorFn).not.toHaveBeenCalled()
            expect(addObstacleFn).not.toHaveBeenCalled()
        })
    })

    describe('snapToGrid', () => {
        it('snaps to nearest grid cell', () => {
            // GRID_SIZE = 40, snap = Math.round(v/40)*40
            expect(brushTool.snapToGrid(0)).toBe(0)
            expect(brushTool.snapToGrid(10)).toBe(0)    // 10/40=0.25 → round=0
            expect(brushTool.snapToGrid(25)).toBe(40)   // 25/40=0.625 → round=1
            expect(brushTool.snapToGrid(42)).toBe(40)   // 42/40=1.05 → round=1
            expect(brushTool.snapToGrid(80)).toBe(80)   // 80/40=2.0 → round=2
        })
    })

    describe('contamination mode', () => {
        it('brush in contamination mode does not call addFloorFn or addObstacleFn', () => {
            getActiveMode.mockReturnValue('contamination')
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)

            // Contamination mode does NOT use addFloorFn/addObstacleFn
            // It calls updateFloorTile internally on matching floor tiles
            // With mock returning empty floors, nothing should happen
            expect(addFloorFn).not.toHaveBeenCalled()
            expect(addObstacleFn).not.toHaveBeenCalled()
        })

        it('brushAt does nothing in contamination mode when no floor tile matches', () => {
            getActiveMode.mockReturnValue('contamination')
            brushTool.setToolMode('brush')
            brushTool.startStroke(80, 80)

            // With empty floor tiles (from mock), addFloorFn/addObstacleFn should not be called
            expect(addFloorFn).not.toHaveBeenCalled()
            expect(addObstacleFn).not.toHaveBeenCalled()
        })

        it('eraseAt does nothing in contamination mode when no contaminated tile exists', () => {
            getActiveMode.mockReturnValue('contamination')
            brushTool.setToolMode('eraser')
            brushTool.startStroke(80, 80)

            // With empty floor tiles, no erase action should happen
            expect(addFloorFn).not.toHaveBeenCalled()
            expect(addObstacleFn).not.toHaveBeenCalled()
        })
    })
})
