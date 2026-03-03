/**
 * @fileoverview Spatial environment configuration types and factory functions.
 * Defines schemas for canvas dimensions, grid settings, obstacles, and spawn zones.
 */

// ───────── TYPE DEFINITIONS ─────────

/**
 * @typedef {'wall' | 'furniture' | 'decoration'} ObstacleType
 */

/**
 * @typedef {'rectangle' | 'circle'} ObstacleShape
 */

/**
 * @typedef {object} Position
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {object} Size
 * @property {number} width - Width in pixels (for rectangles)
 * @property {number} height - Height in pixels (for rectangles)
 * @property {number} [radius] - Radius in pixels (for circles)
 */

/**
 * @typedef {object} Obstacle
 * @property {string} id - Unique identifier for the obstacle
 * @property {ObstacleType} type - Type of obstacle (wall, furniture, decoration)
 * @property {ObstacleShape} shape - Shape of the obstacle (rectangle, circle)
 * @property {Position} position - Position coordinates
 * @property {Size} size - Size dimensions
 * @property {string} color - Color in hex format (e.g., '#ff0000')
 * @property {boolean} collision - Whether agents collide with this obstacle
 * @property {string} [sprite] - Optional sprite filename (e.g., 'hospital_bed.png')
 */

/**
 * @typedef {object} GridSettings
 * @property {boolean} enabled - Whether grid is visible
 * @property {number} cellSize - Size of each grid cell in pixels
 * @property {string} color - Grid line color in hex format
 * @property {number} opacity - Grid opacity (0-1)
 */

/**
 * @typedef {object} SpawnZone
 * @property {string} id - Unique identifier for the spawn zone
 * @property {string} name - Display name for the spawn zone
 * @property {Position} position - Top-left position of the zone
 * @property {Size} size - Size of the spawn zone
 * @property {string} [color] - Optional color for visual representation
 */

/**
 * @typedef {object} CanvasDimensions
 * @property {number} width - Canvas width in pixels
 * @property {number} height - Canvas height in pixels
 * @property {string} [backgroundColor] - Optional background color
 */

/**
 * @typedef {object} SpatialConfig
 * @property {CanvasDimensions} canvas - Canvas dimensions and settings
 * @property {GridSettings} grid - Grid configuration
 * @property {Array<Obstacle>} obstacles - List of obstacles in the environment
 * @property {Array<SpawnZone>} spawnZones - List of spawn zones for agents
 */

// ───────── FACTORY FUNCTIONS ─────────

/**
 * Creates a new obstacle configuration object.
 *
 * @param {object} options - Obstacle options
 * @param {string} options.id - Unique identifier
 * @param {ObstacleType} options.type - Type of obstacle
 * @param {ObstacleShape} options.shape - Shape of obstacle
 * @param {Position} options.position - Position coordinates
 * @param {Size} options.size - Size dimensions
 * @param {string} [options.color='#666666'] - Color in hex format
 * @param {boolean} [options.collision=true] - Whether agents collide with this
 * @returns {Obstacle} New obstacle configuration
 */
export function createObstacle(options) {
    const {
        id,
        type,
        shape,
        position,
        size,
        color = '#666666',
        collision = true,
        sprite
    } = options

    if (!id || !type || !shape || !position || !size) {
        throw new Error('createObstacle requires id, type, shape, position, and size')
    }

    const validTypes = ['wall', 'furniture', 'decoration']
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid obstacle type: ${type}. Must be one of: ${validTypes.join(', ')}`)
    }

    const validShapes = ['rectangle', 'circle']
    if (!validShapes.includes(shape)) {
        throw new Error(`Invalid obstacle shape: ${shape}. Must be one of: ${validShapes.join(', ')}`)
    }

    const obstacle = {
        id,
        type,
        shape,
        position: { x: position.x, y: position.y },
        size: { ...size },
        color,
        collision
    }

    if (sprite) {
        obstacle.sprite = sprite
    }

    return obstacle
}

/**
 * Creates a new spawn zone configuration object.
 *
 * @param {object} options - Spawn zone options
 * @param {string} options.id - Unique identifier
 * @param {string} options.name - Display name
 * @param {Position} options.position - Position coordinates
 * @param {Size} options.size - Size dimensions
 * @param {string} [options.color='#22c55e'] - Optional color
 * @returns {SpawnZone} New spawn zone configuration
 */
export function createSpawnZone(options) {
    const {
        id,
        name,
        position,
        size,
        color = '#22c55e'
    } = options

    if (!id || !name || !position || !size) {
        throw new Error('createSpawnZone requires id, name, position, and size')
    }

    return {
        id,
        name,
        position: { x: position.x, y: position.y },
        size: { ...size },
        color
    }
}

/**
 * Creates a new spatial configuration object with default values.
 *
 * @param {object} [options] - Configuration options
 * @param {CanvasDimensions} [options.canvas] - Canvas settings
 * @param {GridSettings} [options.grid] - Grid settings
 * @param {Array<Obstacle>} [options.obstacles=[]] - List of obstacles
 * @param {Array<SpawnZone>} [options.spawnZones=[]] - List of spawn zones
 * @returns {SpatialConfig} New spatial configuration
 */
export function createSpatialConfig(options = {}) {
    const {
        canvas = { width: 800, height: 600, backgroundColor: '#1a1a2e' },
        grid = { enabled: true, cellSize: 40, color: '#333344', opacity: 0.3 },
        obstacles = [],
        spawnZones = []
    } = options

    if (!canvas.width || !canvas.height) {
        throw new Error('Canvas requires width and height')
    }

    return {
        canvas: {
            width: canvas.width,
            height: canvas.height,
            backgroundColor: canvas.backgroundColor || '#1a1a2e'
        },
        grid: {
            enabled: grid.enabled !== undefined ? grid.enabled : true,
            cellSize: grid.cellSize || 40,
            color: grid.color || '#333344',
            opacity: grid.opacity !== undefined ? grid.opacity : 0.3
        },
        obstacles: obstacles.map(o => createObstacle(o)),
        spawnZones: spawnZones.map(s => createSpawnZone(s))
    }
}

// ───────── HELPER CONSTANTS ─────────

/**
 * Default canvas dimensions
 */
export const DEFAULT_CANVAS = {
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e'
}

/**
 * Default grid settings
 */
export const DEFAULT_GRID = {
    enabled: true,
    cellSize: 40,
    color: '#333344',
    opacity: 0.3
}

/**
 * Valid obstacle types
 */
export const OBSTACLE_TYPES = ['wall', 'furniture', 'decoration']

/**
 * Valid obstacle shapes
 */
export const OBSTACLE_SHAPES = ['rectangle', 'circle']
