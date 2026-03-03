/**
 * @fileoverview Unit tests for pathfinding.js
 */
import { describe, it, expect } from 'vitest'
import {
    generateGrid,
    findPath,
    DEFAULT_GRID_SIZE,
    createPathfinder
} from '../utils/pathfinding.js'

// ───────── generateGrid ─────────

describe('generateGrid', () => {
    it('creates correct dimensions for 200×200 canvas with 40px cells', () => {
        const { grid, cols, rows } = generateGrid({ width: 200, height: 200, cellSize: 40 })
        expect(cols).toBe(5)
        expect(rows).toBe(5)
        expect(grid.length).toBe(5) // 5 rows
        expect(grid[0].length).toBe(5) // 5 cols
    })

    it('uses DEFAULT_GRID_SIZE when cellSize not specified', () => {
        const { cols, rows } = generateGrid({ width: 80, height: 120 })
        expect(cols).toBe(Math.ceil(80 / DEFAULT_GRID_SIZE))
        expect(rows).toBe(Math.ceil(120 / DEFAULT_GRID_SIZE))
    })

    it('all cells start unblocked', () => {
        const { grid } = generateGrid({ width: 120, height: 120, cellSize: 40 })
        for (const row of grid) {
            for (const cell of row) {
                expect(cell.blocked).toBe(false)
            }
        }
    })

    it('marks rectangle obstacle cells as blocked', () => {
        const obstacles = [{
            id: 'wall1',
            shape: 'rectangle',
            position: { x: 0, y: 0 },
            size: { width: 80, height: 40 },
            type: 'furniture'
        }]
        const { grid } = generateGrid({ width: 200, height: 200, cellSize: 40, obstacles })
        // Cells (0,0) and (1,0) should be blocked (80px wide = 2 cells)
        expect(grid[0][0].blocked).toBe(true)
        expect(grid[0][1].blocked).toBe(true)
        // Cell (2,0) should be unblocked
        expect(grid[0][2].blocked).toBe(false)
    })

    it('marks circle obstacle cells as blocked', () => {
        const obstacles = [{
            id: 'circle1',
            shape: 'circle',
            position: { x: 100, y: 100 },
            size: { radius: 30 },
            type: 'furniture'
        }]
        const { grid } = generateGrid({ width: 200, height: 200, cellSize: 40, obstacles })
        // The center cell (col=2, row=2) should be blocked
        expect(grid[2][2].blocked).toBe(true)
    })

    it('skips obstacles with collision=false', () => {
        const obstacles = [{
            id: 'deco1',
            shape: 'rectangle',
            position: { x: 0, y: 0 },
            size: { width: 80, height: 80 },
            type: 'decoration',
            collision: false
        }]
        const { grid } = generateGrid({ width: 200, height: 200, cellSize: 40, obstacles })
        expect(grid[0][0].blocked).toBe(false)
    })
})

// ───────── findPath ─────────

describe('findPath', () => {
    it('returns direct path on empty grid', () => {
        const { grid } = generateGrid({ width: 200, height: 200, cellSize: 40 })
        const path = findPath({
            grid,
            sourceX: 20,
            sourceY: 20,
            targetX: 180,
            targetY: 180,
            cellSize: 40
        })
        expect(path.length).toBeGreaterThanOrEqual(2)
        expect(path[0]).toEqual({ x: 20, y: 20 })
        expect(path[path.length - 1]).toEqual({ x: 180, y: 180 })
    })

    it('returns path with same source and target', () => {
        const { grid } = generateGrid({ width: 200, height: 200, cellSize: 40 })
        const path = findPath({
            grid,
            sourceX: 100,
            sourceY: 100,
            targetX: 100,
            targetY: 100,
            cellSize: 40
        })
        expect(path.length).toBeGreaterThanOrEqual(1)
    })
})

// ───────── createPathfinder ─────────

describe('createPathfinder', () => {
    it('creates pathfinder with grid, cols, rows', () => {
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40 })
        expect(pf.grid).toBeDefined()
        expect(pf.cols).toBe(5)
        expect(pf.rows).toBe(5)
        expect(pf.cellSize).toBe(40)
    })

    it('throws without width/height', () => {
        expect(() => createPathfinder({})).toThrow('createPathfinder requires width and height')
    })

    it('findPath returns a valid path', () => {
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40 })
        const path = pf.findPath(20, 20, 180, 180)
        expect(path.length).toBeGreaterThanOrEqual(2)
    })

    it('isBlocked returns false for open cells', () => {
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40 })
        expect(pf.isBlocked(100, 100)).toBe(false)
    })

    it('isBlocked returns true for obstacle cells', () => {
        const obstacles = [{
            id: 'wall1',
            shape: 'rectangle',
            position: { x: 80, y: 80 },
            size: { width: 40, height: 40 },
            type: 'wall'
        }]
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40, obstacles })
        expect(pf.isBlocked(90, 90)).toBe(true)
    })

    it('findNearestUnblocked returns nearby position for blocked cell', () => {
        const obstacles = [{
            id: 'wall1',
            shape: 'rectangle',
            position: { x: 80, y: 80 },
            size: { width: 40, height: 40 },
            type: 'wall'
        }]
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40, obstacles })
        const safe = pf.findNearestUnblocked(90, 90)
        expect(safe).toBeDefined()
        expect(safe.x).toBeDefined()
        expect(safe.y).toBeDefined()
        // Should not be inside the blocked cell
        expect(pf.isBlocked(safe.x, safe.y)).toBe(false)
    })

    it('findPath avoids obstacle', () => {
        // Create a furniture obstacle blocking the horizontal middle but not full height
        const obstacles = [{
            id: 'wall1',
            shape: 'rectangle',
            position: { x: 80, y: 40 },
            size: { width: 40, height: 80 },
            type: 'furniture'
        }]
        const pf = createPathfinder({ width: 240, height: 240, cellSize: 40, obstacles })
        const path = pf.findPath(20, 80, 200, 80)
        // Path should exist and reach the target
        expect(path.length).toBeGreaterThanOrEqual(2)
        expect(path[path.length - 1].x).toBe(200)
        expect(path[path.length - 1].y).toBe(80)
    })

    it('updateObstacles regenerates the grid', () => {
        const pf = createPathfinder({ width: 200, height: 200, cellSize: 40 })
        expect(pf.isBlocked(90, 90)).toBe(false)

        pf.updateObstacles([{
            id: 'wall1',
            shape: 'rectangle',
            position: { x: 80, y: 80 },
            size: { width: 40, height: 40 },
            type: 'wall'
        }])
        expect(pf.isBlocked(90, 90)).toBe(true)
    })
})
