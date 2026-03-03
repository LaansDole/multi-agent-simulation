/**
 * @fileoverview Grid-based pathfinding using A* algorithm for agent navigation.
 * Provides obstacle avoidance for agent movement animations.
 */

// ───────── TYPE DEFINITIONS ─────────

/**
 * @typedef {object} Waypoint
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {object} GridCell
 * @property {number} x - Grid cell x index
 * @property {number} y - Grid cell y index
 * @property {boolean} blocked - Whether the cell is blocked by an obstacle
 * @property {number} g - Cost from start to this cell
 * @property {number} h - Heuristic cost from this cell to goal
 * @property {number} f - Total cost (g + h)
 * @property {GridCell|null} parent - Parent cell for path reconstruction
 */

// ───────── CONSTANTS ─────────

export const DEFAULT_GRID_SIZE = 40

// ───────── GRID GENERATION ─────────

/**
 * Generates a navigation grid based on canvas dimensions and obstacles.
 *
 * @param {object} options - Grid generation options
 * @param {number} options.width - Canvas width in pixels
 * @param {number} options.height - Canvas height in pixels
 * @param {number} [options.cellSize=40] - Grid cell size in pixels
 * @param {Array<import('../types/spatial.js').Obstacle>} [options.obstacles=[]] - List of obstacles
 * @returns {Array<Array<GridCell>>} 2D array of grid cells
 */
export function generateGrid(options) {
    const { width, height, cellSize = DEFAULT_GRID_SIZE, obstacles = [] } = options

    const cols = Math.ceil(width / cellSize)
    const rows = Math.ceil(height / cellSize)

    const grid = []

    for (let y = 0; y < rows; y++) {
        const row = []
        for (let x = 0; x < cols; x++) {
            row.push({
                x,
                y,
                blocked: false,
                g: 0,
                h: 0,
                f: 0,
                parent: null
            })
        }
        grid.push(row)
    }

    markObstaclesAsBlocked(grid, obstacles, cellSize)

    return { grid, cols, rows }
}

/**
 * Marks grid cells as blocked based on obstacle bounding boxes.
 *
 * @param {Array<Array<GridCell>>} grid - The navigation grid
 * @param {Array<import('../types/spatial.js').Obstacle>} obstacles - List of obstacles
 * @param {number} cellSize - Grid cell size in pixels
 */
function markObstaclesAsBlocked(grid, obstacles, cellSize) {
    obstacles.forEach(obstacle => {
        if (obstacle.collision === false) return

        const { shape, position, size, type } = obstacle
        if (!shape || !position || !size) return

        // Add 1-cell buffer for wall-type obstacles only
        const buffer = type === 'wall' ? 1 : 0

        if (shape === 'rectangle') {
            markRectangleObstacle(grid, position, size, cellSize, buffer)
        } else if (shape === 'circle') {
            markCircleObstacle(grid, position, size, cellSize, buffer)
        }
    })
}

/**
 * Marks cells blocked by a rectangular obstacle.
 *
 * @param {Array<Array<GridCell>>} grid - The navigation grid
 * @param {{x: number, y: number}} position - Obstacle position
 * @param {{width?: number, height?: number}} size - Obstacle size
 * @param {number} cellSize - Grid cell size
 */
function markRectangleObstacle(grid, position, size, cellSize, buffer = 0) {
    const width = size.width || 50
    const height = size.height || 50

    const startX = Math.floor(position.x / cellSize) - buffer
    const startY = Math.floor(position.y / cellSize) - buffer
    const endX = Math.ceil((position.x + width) / cellSize) + buffer
    const endY = Math.ceil((position.y + height) / cellSize) + buffer

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (grid[y] && grid[y][x]) {
                grid[y][x].blocked = true
            }
        }
    }
}

/**
 * Marks cells blocked by a circular obstacle.
 *
 * @param {Array<Array<GridCell>>} grid - The navigation grid
 * @param {{x: number, y: number}} position - Obstacle center position
 * @param {{radius?: number}} size - Obstacle size with radius
 * @param {number} cellSize - Grid cell size
 */
function markCircleObstacle(grid, position, size, cellSize, buffer = 0) {
    const radius = size.radius || 25
    const bufferedRadius = radius + buffer * cellSize
    const radiusSq = bufferedRadius * bufferedRadius

    const startX = Math.floor((position.x - bufferedRadius) / cellSize)
    const startY = Math.floor((position.y - bufferedRadius) / cellSize)
    const endX = Math.ceil((position.x + bufferedRadius) / cellSize)
    const endY = Math.ceil((position.y + bufferedRadius) / cellSize)

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const cellCenterX = (x + 0.5) * cellSize
            const cellCenterY = (y + 0.5) * cellSize
            const dx = cellCenterX - position.x
            const dy = cellCenterY - position.y

            if (dx * dx + dy * dy <= radiusSq) {
                if (grid[y] && grid[y][x]) {
                    grid[y][x].blocked = true
                }
            }
        }
    }
}

// ───────── A* PATHFINDING ─────────

/**
 * Finds a path from source to target using A* algorithm.
 *
 * @param {object} options - Pathfinding options
 * @param {Array<Array<GridCell>>} options.grid - Pre-generated navigation grid
 * @param {number} options.sourceX - Source X coordinate in pixels
 * @param {number} options.sourceY - Source Y coordinate in pixels
 * @param {number} options.targetX - Target X coordinate in pixels
 * @param {number} options.targetY - Target Y coordinate in pixels
 * @param {number} [options.cellSize=40] - Grid cell size in pixels
 * @returns {Array<Waypoint>} Array of waypoints from source to target
 */
export function findPath(options) {
    const { grid, sourceX, sourceY, targetX, targetY, cellSize = DEFAULT_GRID_SIZE } = options

    if (!grid || grid.length === 0 || grid[0].length === 0) {
        return fallbackToDirect(sourceX, sourceY, targetX, targetY)
    }

    const cols = grid[0].length
    const rows = grid.length

    const startCellX = Math.floor(sourceX / cellSize)
    const startCellY = Math.floor(sourceY / cellSize)
    const endCellX = Math.floor(targetX / cellSize)
    const endCellY = Math.floor(targetY / cellSize)

    if (startCellX < 0 || startCellX >= cols || startCellY < 0 || startCellY >= rows ||
        endCellX < 0 || endCellX >= cols || endCellY < 0 || endCellY >= rows) {
        return fallbackToDirect(sourceX, sourceY, targetX, targetY)
    }

    resetGrid(grid)

    const openSet = []
    const closedSet = new Set()

    const startCell = grid[startCellY][startCellX]
    const endCell = grid[endCellY][endCellX]

    if (startCell.blocked || endCell.blocked) {
        return fallbackToDirect(sourceX, sourceY, targetX, targetY)
    }

    startCell.g = 0
    startCell.h = heuristic(startCellX, startCellY, endCellX, endCellY)
    startCell.f = startCell.h

    openSet.push(startCell)

    while (openSet.length > 0) {
        const current = getLowestF(openSet)

        if (current.x === endCellX && current.y === endCellY) {
            return reconstructPath(current, sourceX, sourceY, targetX, targetY, cellSize)
        }

        removeFromOpenSet(openSet, current)
        closedSet.add(`${current.x},${current.y}`)

        const neighbors = getNeighbors(current, grid, cols, rows)

        for (const neighbor of neighbors) {
            if (neighbor.blocked || closedSet.has(`${neighbor.x},${neighbor.y}`)) {
                continue
            }

            const tentativeG = current.g + 1

            if (!openSet.includes(neighbor)) {
                neighbor.g = tentativeG
                neighbor.h = heuristic(neighbor.x, neighbor.y, endCellX, endCellY)
                neighbor.f = neighbor.g + neighbor.h
                neighbor.parent = current
                openSet.push(neighbor)
            } else if (tentativeG < neighbor.g) {
                neighbor.g = tentativeG
                neighbor.f = neighbor.g + neighbor.h
                neighbor.parent = current
            }
        }
    }

    return fallbackToDirect(sourceX, sourceY, targetX, targetY)
}

/**
 * Calculates Manhattan distance heuristic between two cells.
 *
 * @param {number} x1 - Current cell x
 * @param {number} y1 - Current cell y
 * @param {number} x2 - Target cell x
 * @param {number} y2 - Target cell y
 * @returns {number} Heuristic cost
 */
function heuristic(x1, y1, x2, y2) {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1)
}

/**
 * Gets valid neighboring cells (4-directional movement).
 *
 * @param {GridCell} cell - Current cell
 * @param {Array<Array<GridCell>>} grid - Navigation grid
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @returns {Array<GridCell>} Array of neighboring cells
 */
function getNeighbors(cell, grid, cols, rows) {
    const neighbors = []
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 }
    ]

    for (const { dx, dy } of directions) {
        const nx = cell.x + dx
        const ny = cell.y + dy

        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            neighbors.push(grid[ny][nx])
        }
    }

    return neighbors
}

/**
 * Gets the cell with lowest f cost from open set.
 *
 * @param {Array<GridCell>} openSet - Open set of cells
 * @returns {GridCell} Cell with lowest f cost
 */
function getLowestF(openSet) {
    let lowest = openSet[0]
    for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < lowest.f) {
            lowest = openSet[i]
        }
    }
    return lowest
}

/**
 * Removes a cell from the open set.
 *
 * @param {Array<GridCell>} openSet - Open set
 * @param {GridCell} cell - Cell to remove
 */
function removeFromOpenSet(openSet, cell) {
    const index = openSet.indexOf(cell)
    if (index > -1) {
        openSet.splice(index, 1)
    }
}

/**
 * Reconstructs the path from end to start.
 *
 * @param {GridCell} endCell - End cell
 * @param {number} sourceX - Source X in pixels
 * @param {number} sourceY - Source Y in pixels
 * @param {number} targetX - Target X in pixels
 * @param {number} targetY - Target Y in pixels
 * @param {number} cellSize - Grid cell size
 * @returns {Array<Waypoint>} Array of waypoints
 */
function reconstructPath(endCell, sourceX, sourceY, targetX, targetY, cellSize) {
    const path = []
    let current = endCell

    while (current) {
        path.unshift({
            x: current.x * cellSize + cellSize / 2,
            y: current.y * cellSize + cellSize / 2
        })
        current = current.parent
    }

    if (path.length > 0) {
        path[0].x = sourceX
        path[0].y = sourceY
        path[path.length - 1].x = targetX
        path[path.length - 1].y = targetY
    }

    return path
}

/**
 * Resets grid cell values for a new pathfinding run.
 *
 * @param {Array<Array<GridCell>>} grid - Navigation grid
 */
function resetGrid(grid) {
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            grid[y][x].g = 0
            grid[y][x].h = 0
            grid[y][x].f = 0
            grid[y][x].parent = null
        }
    }
}

// ───────── FALLBACK PATH ─────────

/**
 * Returns a direct path when no valid path exists.
 *
 * @param {number} sourceX - Source X coordinate
 * @param {number} sourceY - Source Y coordinate
 * @param {number} targetX - Target X coordinate
 * @param {number} targetY - Target Y coordinate
 * @returns {Array<Waypoint>} Direct path with source and target
 */
function fallbackToDirect(sourceX, sourceY, targetX, targetY) {
    return [
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY }
    ]
}

/**
 * Checks if a direct line between two points crosses any blocked cells.
 *
 * @param {Array<Array<GridCell>>} grid - Navigation grid
 * @param {number} x1 - Start X in pixels
 * @param {number} y1 - Start Y in pixels
 * @param {number} x2 - End X in pixels
 * @param {number} y2 - End Y in pixels
 * @param {number} cellSize - Grid cell size
 * @returns {boolean} True if line crosses blocked cells
 */
function lineIntersectsBlocked(grid, x1, y1, x2, y2, cellSize) {
    const steps = Math.max(
        Math.abs(Math.floor(x2 / cellSize) - Math.floor(x1 / cellSize)),
        Math.abs(Math.floor(y2 / cellSize) - Math.floor(y1 / cellSize)),
        1
    )
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = x1 + (x2 - x1) * t
        const py = y1 + (y2 - y1) * t
        const cx = Math.floor(px / cellSize)
        const cy = Math.floor(py / cellSize)
        if (grid[cy] && grid[cy][cx] && grid[cy][cx].blocked) {
            return true
        }
    }
    return false
}

/**
 * Finds the nearest unblocked cell to a given pixel position.
 *
 * @param {Array<Array<GridCell>>} grid - Navigation grid
 * @param {number} px - X position in pixels
 * @param {number} py - Y position in pixels
 * @param {number} cellSize - Grid cell size
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @returns {{x: number, y: number}} Pixel position of nearest unblocked cell center
 */
function findNearestUnblocked(grid, px, py, cellSize, cols, rows) {
    const cx = Math.floor(px / cellSize)
    const cy = Math.floor(py / cellSize)

    // Already unblocked
    if (grid[cy] && grid[cy][cx] && !grid[cy][cx].blocked) {
        return { x: px, y: py }
    }

    // Spiral search outward
    for (let radius = 1; radius < Math.max(cols, rows); radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
                const nx = cx + dx
                const ny = cy + dy
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx] && !grid[ny][nx].blocked) {
                    return { x: nx * cellSize + cellSize / 2, y: ny * cellSize + cellSize / 2 }
                }
            }
        }
    }

    return { x: px, y: py }
}

// ───────── FACTORY FUNCTION ─────────

/**
 * Creates a pathfinder with pre-generated grid for better performance.
 *
 * @param {object} options - Pathfinder options
 * @param {number} options.width - Canvas width in pixels
 * @param {number} options.height - Canvas height in pixels
 * @param {number} [options.cellSize=40] - Grid cell size in pixels
 * @param {Array<import('../types/spatial.js').Obstacle>} [options.obstacles=[]] - List of obstacles
 * @returns {object} Pathfinder instance with findPath method
 */
export function createPathfinder(options) {
    const { width, height, cellSize = DEFAULT_GRID_SIZE, obstacles = [] } = options

    if (!width || !height) {
        throw new Error('createPathfinder requires width and height')
    }

    const { grid, cols, rows } = generateGrid({ width, height, cellSize, obstacles })

    return {
        grid,
        cols,
        rows,
        cellSize,

        /**
         * Finds a path from source to target.
         * If A* fails and the direct line crosses obstacles, attempts
         * to reroute via the nearest unblocked cell.
         *
         * @param {number} sourceX - Source X coordinate in pixels
         * @param {number} sourceY - Source Y coordinate in pixels
         * @param {number} targetX - Target X coordinate in pixels
         * @param {number} targetY - Target Y coordinate in pixels
         * @returns {Array<Waypoint>} Array of waypoints
         */
        findPath(sourceX, sourceY, targetX, targetY) {
            const path = findPath({
                grid: this.grid,
                sourceX,
                sourceY,
                targetX,
                targetY,
                cellSize: this.cellSize
            })

            // If it's a 2-point fallback path, check if it crosses obstacles
            if (path.length === 2 && lineIntersectsBlocked(this.grid, sourceX, sourceY, targetX, targetY, this.cellSize)) {
                // Reroute: find unblocked positions near source and target
                const safeSource = findNearestUnblocked(this.grid, sourceX, sourceY, this.cellSize, this.cols, this.rows)
                const safeTarget = findNearestUnblocked(this.grid, targetX, targetY, this.cellSize, this.cols, this.rows)

                // Re-attempt A* from safe positions
                const rerouted = findPath({
                    grid: this.grid,
                    sourceX: safeSource.x,
                    sourceY: safeSource.y,
                    targetX: safeTarget.x,
                    targetY: safeTarget.y,
                    cellSize: this.cellSize
                })

                if (rerouted.length > 2 || !lineIntersectsBlocked(this.grid, safeSource.x, safeSource.y, safeTarget.x, safeTarget.y, this.cellSize)) {
                    // Prepend original source and append original target
                    if (rerouted[0].x !== sourceX || rerouted[0].y !== sourceY) {
                        rerouted.unshift({ x: sourceX, y: sourceY })
                    }
                    if (rerouted[rerouted.length - 1].x !== targetX || rerouted[rerouted.length - 1].y !== targetY) {
                        rerouted.push({ x: targetX, y: targetY })
                    }
                    return rerouted
                }
            }

            return path
        },

        /**
         * Checks if a point is inside a blocked cell.
         *
         * @param {number} px - X position in pixels
         * @param {number} py - Y position in pixels
         * @returns {boolean} True if position is blocked
         */
        isBlocked(px, py) {
            const cx = Math.floor(px / this.cellSize)
            const cy = Math.floor(py / this.cellSize)
            return !!(this.grid[cy] && this.grid[cy][cx] && this.grid[cy][cx].blocked)
        },

        /**
         * Finds nearest unblocked position to the given pixel coordinates.
         *
         * @param {number} px - X position in pixels
         * @param {number} py - Y position in pixels
         * @returns {{x: number, y: number}} Nearest unblocked position
         */
        findNearestUnblocked(px, py) {
            return findNearestUnblocked(this.grid, px, py, this.cellSize, this.cols, this.rows)
        },

        /**
         * Updates obstacles and regenerates the grid.
         *
         * @param {Array<import('../types/spatial.js').Obstacle>} newObstacles - New list of obstacles
         */
        updateObstacles(newObstacles) {
            const { grid: newGrid, cols: newCols, rows: newRows } = generateGrid({ width, height, cellSize, obstacles: newObstacles })
            this.grid.length = 0
            for (let i = 0; i < newGrid.length; i++) {
                this.grid.push(newGrid[i])
            }
            this.cols = newCols
            this.rows = newRows
        }
    }
}
