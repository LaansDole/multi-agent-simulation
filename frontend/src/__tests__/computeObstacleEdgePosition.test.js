/**
 * @fileoverview Unit tests for computeObstacleEdgePosition
 */
import { describe, it, expect } from 'vitest'
import { computeObstacleEdgePosition } from '../composables/spatial/useObstacleManager.js'

describe('computeObstacleEdgePosition', () => {
    describe('circle obstacles', () => {
        const size = { radius: 30 }

        it('returns point on circumference toward the agent', () => {
            // Agent to the right of circle centered at (100, 100)
            const edge = computeObstacleEdgePosition(200, 100, 100, 100, 'circle', size)
            // Should be on the right edge: radius (30) + offset (10) = 40px from center
            expect(edge.x).toBeCloseTo(140, 0)
            expect(edge.y).toBeCloseTo(100, 0)
        })

        it('returns point above for agent above obstacle', () => {
            const edge = computeObstacleEdgePosition(100, 0, 100, 100, 'circle', size)
            expect(edge.x).toBeCloseTo(100, 0)
            expect(edge.y).toBeCloseTo(60, 0) // 100 - 40
        })

        it('handles agent at center (arbitrary direction)', () => {
            const edge = computeObstacleEdgePosition(100, 100, 100, 100, 'circle', size)
            // Should return a valid point on the circumference
            expect(edge.x).toBeCloseTo(140, 0)
            expect(edge.y).toBe(100)
        })
    })

    describe('rectangle obstacles', () => {
        const size = { width: 80, height: 40 }

        it('returns point on right edge for agent to the right', () => {
            // Obstacle at (100, 200) — center is (140, 220)
            // Agent at (300, 220) — to the right
            const edge = computeObstacleEdgePosition(300, 220, 100, 200, 'rectangle', size)
            // Right edge = center.x + hw = 140 + 50 = 190
            expect(edge.x).toBeCloseTo(190, 0)
            expect(edge.y).toBeCloseTo(220, 0)
        })

        it('returns point on left edge for agent to the left', () => {
            const edge = computeObstacleEdgePosition(0, 220, 100, 200, 'rectangle', size)
            // Left edge = center.x - hw = 140 - 50 = 90
            expect(edge.x).toBeCloseTo(90, 0)
            expect(edge.y).toBeCloseTo(220, 0)
        })

        it('returns point on top edge for agent above', () => {
            const edge = computeObstacleEdgePosition(140, 100, 100, 200, 'rectangle', size)
            // Top edge = center.y - hh = 220 - 30 = 190
            expect(edge.x).toBeCloseTo(140, 0)
            expect(edge.y).toBeCloseTo(190, 0)
        })

        it('returns point on bottom edge for agent below', () => {
            const edge = computeObstacleEdgePosition(140, 400, 100, 200, 'rectangle', size)
            // Bottom edge = center.y + hh = 220 + 30 = 250
            expect(edge.x).toBeCloseTo(140, 0)
            expect(edge.y).toBeCloseTo(250, 0)
        })
    })
})
