/**
 * @fileoverview Unit tests for isPointInObstacle (top-left corner coord fix)
 */
import { describe, it, expect } from 'vitest'
import { isPointInObstacle } from '../composables/useSpatialLayout.js'

describe('isPointInObstacle', () => {
    describe('rectangle (top-left corner coords)', () => {
        const wall = {
            shape: 'rectangle',
            position: { x: 100, y: 200 },
            size: { width: 80, height: 40 }
        }

        it('returns true for point inside the rectangle', () => {
            expect(isPointInObstacle({ x: 120, y: 210 }, wall)).toBe(true)
        })

        it('returns true for point on the top-left corner', () => {
            expect(isPointInObstacle({ x: 100, y: 200 }, wall)).toBe(true)
        })

        it('returns true for point on the bottom-right corner', () => {
            expect(isPointInObstacle({ x: 180, y: 240 }, wall)).toBe(true)
        })

        it('returns false for point left of the rectangle', () => {
            expect(isPointInObstacle({ x: 50, y: 210 }, wall)).toBe(false)
        })

        it('returns false for point above the rectangle', () => {
            expect(isPointInObstacle({ x: 120, y: 190 }, wall)).toBe(false)
        })

        it('returns false for point right of the rectangle', () => {
            expect(isPointInObstacle({ x: 200, y: 210 }, wall)).toBe(false)
        })

        it('returns false for point below the rectangle', () => {
            expect(isPointInObstacle({ x: 120, y: 250 }, wall)).toBe(false)
        })

        // Regression: old center-based math would place a wall at position (0,0)
        // spanning [-hw, +hw] instead of [0, width]
        it('correctly handles wall at origin (top-left = 0,0)', () => {
            const originWall = {
                shape: 'rectangle',
                position: { x: 0, y: 0 },
                size: { width: 2400, height: 20 }
            }
            // Inside the wall
            expect(isPointInObstacle({ x: 100, y: 10 }, originWall)).toBe(true)
            expect(isPointInObstacle({ x: 2000, y: 5 }, originWall)).toBe(true)
            // Outside the wall (below)
            expect(isPointInObstacle({ x: 100, y: 30 }, originWall)).toBe(false)
            // Outside the wall (negative coords — the old bug would say true)
            expect(isPointInObstacle({ x: -100, y: 10 }, originWall)).toBe(false)
        })
    })

    describe('circle', () => {
        const circle = {
            shape: 'circle',
            position: { x: 100, y: 100 },
            size: { radius: 30 }
        }

        it('returns true for point inside the circle', () => {
            expect(isPointInObstacle({ x: 110, y: 110 }, circle)).toBe(true)
        })

        it('returns false for point outside the circle', () => {
            expect(isPointInObstacle({ x: 200, y: 200 }, circle)).toBe(false)
        })
    })

    describe('unknown shape', () => {
        it('returns false for unsupported shape', () => {
            const obs = { shape: 'polygon', position: { x: 0, y: 0 }, size: {} }
            expect(isPointInObstacle({ x: 0, y: 0 }, obs)).toBe(false)
        })
    })
})
