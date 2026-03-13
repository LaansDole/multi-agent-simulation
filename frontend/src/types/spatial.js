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
 * @typedef {object} RecommendedAgentCount
 * @property {number} [min] - Minimum recommended agents
 * @property {number} [max] - Maximum recommended agents
 */

/**
 * @typedef {object} LayoutMetadata
 * @property {string} [name] - Display name for the layout
 * @property {string} [description] - Description of the layout's purpose
 * @property {Array<string>} [tags] - Category tags for filtering/searching
 * @property {RecommendedAgentCount} [recommendedAgentCount] - Recommended agent count range
 * @property {string} [thumbnail] - Thumbnail image (base64 data URL or path to image file)
 */

/**
 * @typedef {object} FloorTile
 * @property {string} id - Unique identifier for the floor tile
 * @property {string} tileType - Type of floor tile (e.g., 'wood', 'concrete')
 * @property {Position} position - Position coordinates
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 * @property {string} [sprite] - Optional sprite filename
 * @property {string} [color] - Optional fallback color in hex format
 */

/**
 * @typedef {object} SpatialConfig
 * @property {CanvasDimensions} canvas - Canvas dimensions and settings
 * @property {GridSettings} grid - Grid configuration
 * @property {Array<Obstacle>} obstacles - List of obstacles in the environment
 * @property {Array<SpawnZone>} spawnZones - List of spawn zones for agents
 * @property {LayoutMetadata} [metadata] - Optional layout metadata
 * @property {Array<FloorTile>} [floors] - Optional list of floor tiles
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

    const validTypes = ['wall', 'furniture', 'decoration', 'industrial', 'outdoor']
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
 * Creates a new floor tile configuration object.
 *
 * @param {object} options - Floor tile options
 * @param {string} options.id - Unique identifier
 * @param {string} [options.tileType] - Type of floor tile
 * @param {Position} options.position - Position coordinates
 * @param {number} options.width - Width in pixels
 * @param {number} options.height - Height in pixels
 * @param {string} [options.sprite] - Optional sprite filename
 * @param {string} [options.color] - Optional fallback color
 * @returns {FloorTile} New floor tile configuration
 */
export function createFloorTile(options) {
    const {
        id,
        tileType,
        position,
        width,
        height,
        sprite,
        color
    } = options

    if (!id || !position || !width || !height) {
        throw new Error('createFloorTile requires id, position, width, and height')
    }

    const tile = {
        id,
        position: { x: position.x, y: position.y },
        width,
        height
    }

    if (tileType) {
        tile.tileType = tileType
    }
    if (sprite) {
        tile.sprite = sprite
    }
    if (color) {
        tile.color = color
    }

    return tile
}

/**
 * Creates a new layout metadata object.
 *
 * @param {object} [options] - Metadata options
 * @param {string} [options.name] - Display name
 * @param {string} [options.description] - Description
 * @param {Array<string>} [options.tags] - Category tags
 * @param {RecommendedAgentCount} [options.recommendedAgentCount] - Agent count range
 * @param {string} [options.thumbnail] - Thumbnail (base64 or path)
 * @returns {LayoutMetadata} New layout metadata
 */
export function createLayoutMetadata(options = {}) {
    const {
        name,
        description,
        tags,
        recommendedAgentCount,
        thumbnail
    } = options

    const metadata = {}

    if (name !== undefined) {
        metadata.name = name
    }
    if (description !== undefined) {
        metadata.description = description
    }
    if (tags !== undefined && Array.isArray(tags)) {
        metadata.tags = [...tags]
    }
    if (recommendedAgentCount !== undefined) {
        metadata.recommendedAgentCount = {
            min: recommendedAgentCount.min,
            max: recommendedAgentCount.max
        }
    }
    if (thumbnail !== undefined) {
        metadata.thumbnail = thumbnail
    }

    return metadata
}

/**
 * Creates a new spatial configuration object with default values.
 *
 * @param {object} [options] - Configuration options
 * @param {CanvasDimensions} [options.canvas] - Canvas settings
 * @param {GridSettings} [options.grid] - Grid settings
 * @param {Array<Obstacle>} [options.obstacles=[]] - List of obstacles
 * @param {Array<SpawnZone>} [options.spawnZones=[]] - List of spawn zones
 * @param {LayoutMetadata} [options.metadata] - Optional layout metadata
 * @param {Array<FloorTile>} [options.floors] - Optional list of floor tiles
 * @returns {SpatialConfig} New spatial configuration
 */
export function createSpatialConfig(options = {}) {
    const {
        canvas = { width: 800, height: 600, backgroundColor: '#1a1a2e' },
        grid = { enabled: true, cellSize: 40, color: '#333344', opacity: 0.3 },
        obstacles = [],
        spawnZones = [],
        metadata,
        floors
    } = options

    if (!canvas.width || !canvas.height) {
        throw new Error('Canvas requires width and height')
    }

    const config = {
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

    if (metadata !== undefined && metadata !== null) {
        config.metadata = createLayoutMetadata(metadata)
    }

    if (floors !== undefined && floors !== null) {
        config.floors = floors.map(f => createFloorTile(f))
    }

    return config
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
