import { reactive, toRefs } from 'vue'

const SPATIAL_POSITIONS_PREFIX = 'devall_spatial_'

/**
 * Force-directed layout for spatial agent positioning.
 * Connected agents attract; all agents repel.
 */
function forceDirectedLayout(nodes, edges, width, height, iterations = 100) {
    if (!nodes.length) return new Map()

    const positions = new Map()
    const center = { x: width / 2, y: height / 2 }

    // Initialize positions in a circle around center
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length
        const radius = Math.min(width, height) * 0.3
        positions.set(node.id, {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
        })
    })

    // Build adjacency set for quick lookup
    const neighbors = new Map()
    nodes.forEach(n => neighbors.set(n.id, new Set()))
    edges.forEach(e => {
        neighbors.get(e.from)?.add(e.to)
        neighbors.get(e.to)?.add(e.from)
    })

    const repulsionStrength = 8000
    const attractionStrength = 0.005
    const damping = 0.9
    const minDistance = 80
    const velocities = new Map()
    nodes.forEach(n => velocities.set(n.id, { x: 0, y: 0 }))

    for (let iter = 0; iter < iterations; iter++) {
        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = positions.get(nodes[i].id)
                const b = positions.get(nodes[j].id)
                const dx = a.x - b.x
                const dy = a.y - b.y
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                const force = repulsionStrength / (dist * dist)
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                velocities.get(nodes[i].id).x += fx
                velocities.get(nodes[i].id).y += fy
                velocities.get(nodes[j].id).x -= fx
                velocities.get(nodes[j].id).y -= fy
            }
        }

        // Attraction along edges
        edges.forEach(e => {
            const a = positions.get(e.from)
            const b = positions.get(e.to)
            if (!a || !b) return
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < minDistance) return
            const force = (dist - minDistance) * attractionStrength
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            velocities.get(e.from).x += fx
            velocities.get(e.from).y += fy
            velocities.get(e.to).x -= fx
            velocities.get(e.to).y -= fy
        })

        // Center gravity
        nodes.forEach(n => {
            const pos = positions.get(n.id)
            const vel = velocities.get(n.id)
            vel.x += (center.x - pos.x) * 0.001
            vel.y += (center.y - pos.y) * 0.001
        })

        // Apply velocities
        nodes.forEach(n => {
            const pos = positions.get(n.id)
            const vel = velocities.get(n.id)
            pos.x += vel.x
            pos.y += vel.y
            vel.x *= damping
            vel.y *= damping

            // Clamp to canvas bounds (with padding)
            const pad = 60
            pos.x = Math.max(pad, Math.min(width - pad, pos.x))
            pos.y = Math.max(pad, Math.min(height - pad, pos.y))
        })
    }

    return positions
}

/**
 * Composable for spatial view layout and state management.
 */
export function useSpatialLayout() {
    const state = reactive({
        /** @type {Map<string, {x: number, y: number}>} */
        agentPositions: new Map(),
        /** @type {Array<{source: string, target: string, startTime: number, duration: number}>} */
        activeConnections: [],
        currentWorkflow: '',
        canvasWidth: 800,
        canvasHeight: 600
    })

    /**
     * Compute initial layout from graph nodes and edges.
     */
    function computeLayout(nodes, edges, width, height) {
        state.canvasWidth = width || 800
        state.canvasHeight = height || 600
        const positions = forceDirectedLayout(nodes, edges, state.canvasWidth, state.canvasHeight)
        state.agentPositions = positions
        return positions
    }

    /**
     * Update a single agent's position (e.g. after drag).
     */
    function setAgentPosition(agentId, x, y) {
        state.agentPositions.set(agentId, { x, y })
        savePositions()
    }

    /**
     * Save positions to localStorage for the current workflow.
     */
    function savePositions() {
        if (!state.currentWorkflow) return
        try {
            const obj = {}
            state.agentPositions.forEach((pos, id) => {
                obj[id] = pos
            })
            localStorage.setItem(
                SPATIAL_POSITIONS_PREFIX + state.currentWorkflow,
                JSON.stringify(obj)
            )
        } catch (e) {
            console.warn('Failed to save spatial positions:', e)
        }
    }

    /**
     * Load positions from localStorage for a given workflow.
     * Returns true if positions were loaded.
     */
    function loadPositions(workflowFile) {
        state.currentWorkflow = workflowFile
        if (!workflowFile) return false
        try {
            const stored = localStorage.getItem(SPATIAL_POSITIONS_PREFIX + workflowFile)
            if (!stored) return false
            const obj = JSON.parse(stored)
            const positions = new Map()
            Object.entries(obj).forEach(([id, pos]) => {
                positions.set(id, { x: pos.x, y: pos.y })
            })
            if (positions.size > 0) {
                state.agentPositions = positions
                return true
            }
        } catch (e) {
            console.warn('Failed to load spatial positions:', e)
        }
        return false
    }

    /**
     * Clear saved positions and re-run layout.
     */
    function resetPositions(nodes, edges) {
        if (state.currentWorkflow) {
            try {
                localStorage.removeItem(SPATIAL_POSITIONS_PREFIX + state.currentWorkflow)
            } catch (e) {
                console.warn('Failed to clear spatial positions:', e)
            }
        }
        return computeLayout(nodes, edges, state.canvasWidth, state.canvasHeight)
    }

    /**
     * Add a communication connection for animation.
     */
    function addConnection(source, target, duration = 2000) {
        state.activeConnections.push({
            source,
            target,
            startTime: Date.now(),
            duration
        })
    }

    /**
     * Remove expired connections.
     */
    function cleanupConnections() {
        const now = Date.now()
        state.activeConnections = state.activeConnections.filter(
            c => now - c.startTime < c.duration
        )
    }

    return {
        ...toRefs(state),
        computeLayout,
        setAgentPosition,
        savePositions,
        loadPositions,
        resetPositions,
        addConnection,
        cleanupConnections
    }
}
