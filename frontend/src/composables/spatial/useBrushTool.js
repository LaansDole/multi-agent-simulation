/**
 * @fileoverview Brush and eraser tool composable for the spatial canvas.
 * Manages drag-to-paint and drag-to-erase strokes with cell deduplication.
 */
import { ref } from 'vue'
import { useSpatialConfig } from '../useSpatialConfig.js'
import { useContagionEngine, _cellKey } from './useContagionEngine.js'

// ───────── CONSTANTS ─────────

const GRID_SIZE = 40

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {Function} options.getActiveMode - Returns 'obstacles' | 'floors' | 'contamination'
 * @param {Function} options.getSelectedItem - Returns the selected obstacle palette item or null
 * @param {Function} options.getSelectedFloor - Returns the selected floor palette item or null
 * @param {Function} options.addObstacleFn - Function to place an obstacle at (x, y)
 * @param {Function} options.addFloorFn - Function to place a floor tile at (x, y)
 */
export function useBrushTool({
    getActiveMode,
    getSelectedItem,
    getSelectedFloor,
    addObstacleFn,
    addFloorFn
}) {
    /** @type {import('vue').Ref<'pointer'|'brush'|'eraser'>} */
    const toolMode = ref('pointer')

    /** Set of "x,y" strings visited during the current stroke */
    let visitedCells = new Set()

    /** Whether a stroke is currently in progress */
    let isStrokeActive = false

    const { removeFloorTile, getFloorTiles, removeObstacle, getConfig, markConfigChanged } = useSpatialConfig()
    const { getCellContamination, setCellContamination } = useContagionEngine()

    /**
     * Snap a world coordinate to the grid.
     * @param {number} value
     * @returns {number}
     */
    function snapToGrid(value) {
        return Math.round(value / GRID_SIZE) * GRID_SIZE
    }

    /**
     * Get a cell key from world coordinates.
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    function cellKey(x, y) {
        return `${snapToGrid(x)},${snapToGrid(y)}`
    }

    /**
     * Execute the brush action (place) at a cell.
     * @param {number} x - World x
     * @param {number} y - World y
     */
    function brushAt(x, y) {
        const mode = getActiveMode()
        if (mode === 'floors' && getSelectedFloor()) {
            addFloorFn(x, y)
        } else if (mode === 'obstacles' && getSelectedItem()) {
            addObstacleFn(x, y)
        } else if (mode === 'contamination') {
            // Set per-cell contamination on the grid cell at this position (any canvas region)
            const sx = snapToGrid(x)
            const sy = snapToGrid(y)
            const key = _cellKey(sx, sy)
            setCellContamination(key, 3)
            markConfigChanged()
        }
    }

    /**
     * Execute the eraser action (remove) at a cell.
     * @param {number} x - World x
     * @param {number} y - World y
     */
    function eraseAt(x, y) {
        const sx = snapToGrid(x)
        const sy = snapToGrid(y)
        const mode = getActiveMode()

        if (mode === 'floors') {
            // Find floor tile whose bounding box contains this position
            const floors = getFloorTiles()
            const match = floors.find(f => {
                const fp = f.position || {}
                return sx >= fp.x && sx < fp.x + f.width && sy >= fp.y && sy < fp.y + f.height
            })
            if (match) {
                removeFloorTile(match.id)
                markConfigChanged()
            }
        } else if (mode === 'contamination') {
            // Clear per-cell contamination at this position (any canvas region)
            const key = _cellKey(sx, sy)
            if (getCellContamination(key) > 0) {
                setCellContamination(key, 0)
                markConfigChanged()
            }
        } else if (mode === 'obstacles') {
            // Find obstacle whose bounding box contains this position
            const config = getConfig()
            const obstacles = config.obstacles || []
            const match = obstacles.find(o => {
                const op = o.position || {}
                const s = o.size || {}
                const w = s.width || (s.radius ? s.radius * 2 : GRID_SIZE)
                const h = s.height || (s.radius ? s.radius * 2 : GRID_SIZE)
                return sx >= op.x && sx < op.x + w && sy >= op.y && sy < op.y + h
            })
            if (match) {
                removeObstacle(match.id)
                markConfigChanged()
            }
        }
    }

    /**
     * Begin a brush/eraser stroke at the given world coordinates.
     * @param {number} x
     * @param {number} y
     */
    function startStroke(x, y) {
        if (toolMode.value === 'pointer') return

        isStrokeActive = true
        visitedCells = new Set()

        const key = cellKey(x, y)
        visitedCells.add(key)

        if (toolMode.value === 'brush') {
            brushAt(x, y)
        } else if (toolMode.value === 'eraser') {
            eraseAt(x, y)
        }
    }

    /**
     * Continue a brush/eraser stroke at the given world coordinates.
     * Skips if the cell was already visited in this stroke.
     * @param {number} x
     * @param {number} y
     */
    function continueStroke(x, y) {
        if (!isStrokeActive || toolMode.value === 'pointer') return

        const key = cellKey(x, y)
        if (visitedCells.has(key)) return
        visitedCells.add(key)

        if (toolMode.value === 'brush') {
            brushAt(x, y)
        } else if (toolMode.value === 'eraser') {
            eraseAt(x, y)
        }
    }

    /**
     * End the current stroke.
     */
    function endStroke() {
        isStrokeActive = false
        visitedCells = new Set()
    }

    /**
     * Set the tool mode.
     * @param {'pointer'|'brush'|'eraser'} mode
     */
    function setToolMode(mode) {
        toolMode.value = mode
    }

    /**
     * Whether the brush or eraser tool is active (not pointer).
     * @returns {boolean}
     */
    function isToolActive() {
        return toolMode.value !== 'pointer'
    }

    return {
        toolMode,
        startStroke,
        continueStroke,
        endStroke,
        setToolMode,
        isToolActive,
        snapToGrid,
        /** Exposed for testing */
        _getVisitedCells: () => visitedCells,
        _isStrokeActive: () => isStrokeActive
    }
}
