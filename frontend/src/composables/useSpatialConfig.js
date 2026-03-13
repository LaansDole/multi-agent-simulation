/**
 * @fileoverview Composable for loading and managing spatial environment configurations.
 * Loads configurations from JSON files and provides reactive state.
 * Supports localStorage persistence and file download.
 */

import { reactive, toRefs } from 'vue'
import { createSpatialConfig, DEFAULT_CANVAS, DEFAULT_GRID } from '../types/spatial.js'

// ───────── TYPE DEFINITIONS ─────────

/**
 * @typedef {import('../types/spatial.js').SpatialConfig} SpatialConfig
 */

/**
 * @typedef {object} SpatialConfigState
 * @property {SpatialConfig} config - Current spatial configuration
 * @property {boolean} loading - Whether configuration is being loaded
 * @property {string|null} error - Error message if loading failed
 * @property {string} currentWorkflow - Name of currently loaded workflow
 * @property {string} saveStatus - Save status: 'saved' | 'saving' | 'unsaved'
 */

// ───────── CONSTANTS ─────────

const LOCALSTORAGE_PREFIX = 'devall_spatial_'

// ───────── MODULE-LEVEL CACHE ─────────

/**
 * Cache for loaded configurations to avoid re-fetching.
 * Map of workflow name to SpatialConfig.
 * @type {Map<string, SpatialConfig>}
 */
const configCache = new Map()

// ───────── SINGLETON STATE ─────────

const state = reactive({
    config: createSpatialConfig(),
    loading: false,
    error: null,
    currentWorkflow: '',
    saveStatus: 'saved'
})

// ───────── HELPER FUNCTIONS ─────────

/**
 * Constructs the URL for a workflow's spatial configuration file.
 * @param {string} workflowName - Name of the workflow
 * @returns {string} URL to the configuration file
 */
function getConfigUrl(workflowName) {
    return `/spatial_configs/${workflowName}.json`
}

/**
 * Creates a default empty configuration.
 * @returns {SpatialConfig} Default configuration
 */
function createDefaultConfig() {
    return createSpatialConfig({
        canvas: { ...DEFAULT_CANVAS },
        grid: { ...DEFAULT_GRID },
        obstacles: [],
        spawnZones: []
    })
}

/**
 * Gets the localStorage key for a workflow.
 * @param {string} workflowName - Name of the workflow
 * @returns {string} localStorage key
 */
function getLocalStorageKey(workflowName) {
    return `${LOCALSTORAGE_PREFIX}${workflowName}`
}

/**
 * Saves configuration to localStorage.
 * @param {string} workflowName - Name of the workflow
 * @param {SpatialConfig} config - Configuration to save
 */
function saveToLocalStorage(workflowName, config) {
    if (!workflowName) return
    try {
        const key = getLocalStorageKey(workflowName)
        const serialized = JSON.stringify(config)
        localStorage.setItem(key, serialized)
    } catch (err) {
        console.warn('useSpatialConfig: Failed to save to localStorage:', err)
    }
}

/**
 * Loads configuration from localStorage.
 * @param {string} workflowName - Name of the workflow
 * @returns {SpatialConfig|null} Saved configuration or null if not found
 */
function loadFromLocalStorage(workflowName) {
    if (!workflowName) return null
    try {
        const key = getLocalStorageKey(workflowName)
        const serialized = localStorage.getItem(key)
        if (!serialized) return null
        return JSON.parse(serialized)
    } catch (err) {
        console.warn('useSpatialConfig: Failed to load from localStorage:', err)
        return null
    }
}

/**
 * Marks the configuration as unsaved.
 */
function markUnsaved() {
    state.saveStatus = 'unsaved'
}

/**
 * Marks the configuration as saving.
 */
function markSaving() {
    state.saveStatus = 'saving'
}

/**
 * Marks the configuration as saved.
 */
function markSaved() {
    state.saveStatus = 'saved'
}

// ───────── COMPOSABLE ─────────

export function useSpatialConfig() {
    /**
     * Loads spatial configuration for a workflow.
     * Uses cached version if available, otherwise fetches from server.
     * Falls back to default empty configuration on error.
     * Prioritizes localStorage if available, then fetches from server.
     *
     * @param {string} workflowName - Name of the workflow (without .json extension)
     * @returns {Promise<SpatialConfig>} Loaded configuration
     */
    async function loadConfig(workflowName) {
        if (!workflowName) {
            console.warn('useSpatialConfig: No workflow name provided')
            state.config = createDefaultConfig()
            state.currentWorkflow = ''
            state.saveStatus = 'saved'
            return state.config
        }

        // Check memory cache first (preserves edits across tab switches)
        if (configCache.has(workflowName)) {
            state.config = configCache.get(workflowName)
            state.currentWorkflow = workflowName
            state.error = null
            state.saveStatus = 'saved'
            return state.config
        }

        // Check localStorage second
        const savedConfig = loadFromLocalStorage(workflowName)
        if (savedConfig) {
            try {
                const config = createSpatialConfig(savedConfig)
                configCache.set(workflowName, config)
                state.config = config
                state.currentWorkflow = workflowName
                state.error = null
                state.saveStatus = 'saved'
                return config
            } catch (err) {
                console.warn('useSpatialConfig: Invalid saved config, using default:', err)
            }
        }

        // Fetch from server
        state.loading = true
        state.error = null

        try {
            const url = getConfigUrl(workflowName)
            const response = await fetch(url)

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`useSpatialConfig: No configuration found for workflow "${workflowName}", using default`)
                } else {
                    console.warn(`useSpatialConfig: Failed to load config (status ${response.status}), using default`)
                }
                state.config = createDefaultConfig()
                state.currentWorkflow = workflowName
                configCache.set(workflowName, state.config)
                state.saveStatus = 'saved'
                return state.config
            }

            const data = await response.json()
            const config = createSpatialConfig(data)

            // Cache the loaded configuration
            configCache.set(workflowName, config)
            state.config = config
            state.currentWorkflow = workflowName
            state.saveStatus = 'saved'

            return config
        } catch (err) {
            console.warn('useSpatialConfig: Error loading configuration:', err)
            state.error = err.message || 'Failed to load configuration'
            state.config = createDefaultConfig()
            state.currentWorkflow = workflowName
            configCache.set(workflowName, state.config)
            state.saveStatus = 'saved'
            return state.config
        } finally {
            state.loading = false
        }
    }

    /**
     * Clears the configuration cache for a specific workflow or all workflows.
     * @param {string} [workflowName] - Optional workflow name. If omitted, clears all.
     */
    function clearCache(workflowName) {
        if (workflowName) {
            configCache.delete(workflowName)
            if (state.currentWorkflow === workflowName) {
                state.config = createDefaultConfig()
                state.currentWorkflow = ''
            }
        } else {
            configCache.clear()
            state.config = createDefaultConfig()
            state.currentWorkflow = ''
        }
    }

    /**
     * Gets the current configuration without loading.
     * @returns {SpatialConfig} Current configuration
     */
    function getConfig() {
        return state.config
    }

    /**
     * Manually sets the configuration for a workflow.
     * Updates both state and cache.
     *
     * @param {string} workflowName - Workflow name
     * @param {SpatialConfig} config - Configuration to set
     */
    function setConfig(workflowName, config) {
        const validatedConfig = createSpatialConfig(config)
        configCache.set(workflowName, validatedConfig)
        state.config = validatedConfig
        state.currentWorkflow = workflowName
    }

    /**
     * Checks if a configuration is cached for a workflow.
     * @param {string} workflowName - Workflow name to check
     * @returns {boolean} True if cached
     */
    function isCached(workflowName) {
        return configCache.has(workflowName)
    }

    /**
     * Saves the current configuration to localStorage.
     * @param {string} [workflowName] - Optional workflow name (uses currentWorkflow if not provided)
     * @returns {boolean} True if save was successful
     */
    async function saveConfig(workflowName = state.currentWorkflow) {
        if (!workflowName) {
            console.warn('useSpatialConfig: No workflow name to save config')
            return false
        }
        try {
            markSaving()
            // Save to localStorage as immediate fallback
            saveToLocalStorage(workflowName, state.config)
            // Save to server (persists to frontend/public/spatial_configs/)
            await saveConfigToServer(workflowName, state.config)
            markSaved()
            return true
        } catch (err) {
            console.warn('useSpatialConfig: Failed to save config to server, localStorage fallback used:', err)
            markSaved()
            return true // localStorage save still succeeded
        }
    }

    /**
     * Saves configuration to the server API.
     * @param {string} workflowName - Name of the workflow
     * @param {SpatialConfig} config - Configuration to save
     */
    async function saveConfigToServer(workflowName, config) {
        const response = await fetch(`/api/spatial-configs/${encodeURIComponent(workflowName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        })
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`)
        }
    }

    /**
     * Marks the configuration as having unsaved changes.
     */
    function markConfigChanged() {
        markUnsaved()
    }

    /**
     * Downloads the current configuration as a JSON file.
     * @param {string} [workflowName] - Optional workflow name (uses currentWorkflow if not provided)
     */
    function downloadConfig(workflowName = state.currentWorkflow) {
        if (!workflowName) {
            console.warn('useSpatialConfig: No workflow name to download config')
            return
        }
        const fileName = `${workflowName}_spatial.json`
        const json = JSON.stringify(state.config, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    /**
     * Clears saved configuration from localStorage for a workflow.
     * @param {string} workflowName - Workflow name to clear
     */
    function clearSavedConfig(workflowName) {
        if (!workflowName) return
        try {
            const key = getLocalStorageKey(workflowName)
            localStorage.removeItem(key)
        } catch (err) {
            console.warn('useSpatialConfig: Failed to clear saved config:', err)
        }
    }

    /**
     * Updates an existing obstacle's position in the current configuration.
     * Triggers reactivity for re-rendering.
     *
     * @param {string} obstacleId - ID of obstacle to update
     * @param {Position} newPosition - New position coordinates
     */
    function updateObstaclePosition(obstacleId, newPosition) {
        const obstacles = state.config.obstacles
        const index = obstacles.findIndex(o => o.id === obstacleId)
        if (index !== -1) {
            obstacles[index].position.x = newPosition.x
            obstacles[index].position.y = newPosition.y
            // Force reactivity by reassigning
            state.config.obstacles = [...obstacles]
        }
    }

    /**
     * Removes an obstacle from the current configuration.
     * Triggers reactivity for re-rendering.
     *
     * @param {string} obstacleId - ID of obstacle to remove
     * @returns {boolean} True if obstacle was found and removed
     */
    function removeObstacle(obstacleId) {
        const obstacles = state.config.obstacles
        const index = obstacles.findIndex(o => o.id === obstacleId)
        if (index !== -1) {
            const newObstacles = [...obstacles]
            newObstacles.splice(index, 1)
            state.config.obstacles = newObstacles
            return true
        }
        return false
    }

    /**
     * Updates the layout metadata.
     * Triggers reactivity for re-rendering.
     *
     * @param {Partial<import('../types/spatial.js').LayoutMetadata>} metadataUpdates - Metadata fields to update
     */
    function updateMetadata(metadataUpdates) {
        const currentMetadata = state.config.metadata || {}
        state.config.metadata = {
            ...currentMetadata,
            ...metadataUpdates
        }
        markUnsaved()
    }

    /**
     * Gets the layout metadata.
     * @returns {import('../types/spatial.js').LayoutMetadata|null} Current metadata or null
     */
    function getMetadata() {
        return state.config.metadata || null
    }

    /**
     * Adds a floor tile to the current configuration.
     * Triggers reactivity for re-rendering.
     *
     * @param {import('../types/spatial.js').FloorTile} floorTile - Floor tile to add
     */
    function addFloorTile(floorTile) {
        if (!state.config.floors) {
            state.config.floors = []
        }
        state.config.floors = [...state.config.floors, floorTile]
        markUnsaved()
    }

    /**
     * Updates an existing floor tile in the current configuration.
     * Triggers reactivity for re-rendering.
     *
     * @param {string} floorId - ID of floor tile to update
     * @param {Partial<import('../types/spatial.js').FloorTile>} updates - Fields to update
     * @returns {boolean} True if floor tile was found and updated
     */
    function updateFloorTile(floorId, updates) {
        if (!state.config.floors) return false
        const floors = state.config.floors
        const index = floors.findIndex(f => f.id === floorId)
        if (index !== -1) {
            state.config.floors = floors.map((f, i) =>
                i === index ? { ...f, ...updates } : f
            )
            markUnsaved()
            return true
        }
        return false
    }

    /**
     * Removes a floor tile from the current configuration.
     * Triggers reactivity for re-rendering.
     *
     * @param {string} floorId - ID of floor tile to remove
     * @returns {boolean} True if floor tile was found and removed
     */
    function removeFloorTile(floorId) {
        if (!state.config.floors) return false
        const floors = state.config.floors
        const index = floors.findIndex(f => f.id === floorId)
        if (index !== -1) {
            const newFloors = [...floors]
            newFloors.splice(index, 1)
            state.config.floors = newFloors.length > 0 ? newFloors : undefined
            if (state.config.floors === undefined) {
                delete state.config.floors
            }
            state.config = { ...state.config }
            markUnsaved()
            return true
        }
        return false
    }

    /**
     * Gets all floor tiles.
     * @returns {Array<import('../types/spatial.js').FloorTile>} Array of floor tiles
     */
    function getFloorTiles() {
        return state.config.floors || []
    }

    return {
        ...toRefs(state),
        loadConfig,
        clearCache,
        getConfig,
        setConfig,
        isCached,
        saveConfig,
        downloadConfig,
        clearSavedConfig,
        markConfigChanged,
        updateObstaclePosition,
        removeObstacle,
        updateMetadata,
        getMetadata,
        addFloorTile,
        updateFloorTile,
        removeFloorTile,
        getFloorTiles
    }
}
