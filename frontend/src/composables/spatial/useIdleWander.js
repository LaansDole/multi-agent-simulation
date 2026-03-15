/**
 * @fileoverview Idle ambient wander composable for the spatial canvas.
 * Makes idle agents wander along graph edges, creating lifelike ambient movement.
 */

// ───────── CONSTANTS ─────────

const WANDER_COOLDOWN_MIN = 3000
const WANDER_COOLDOWN_MAX = 8000
const WANDER_INITIAL_DELAY_MAX = 5000
const WANDER_DISTANCE_RATIO_MIN = 0.3
const WANDER_DISTANCE_RATIO_MAX = 0.5
const WANDER_SPEED_FACTOR = 0.5
const WANDER_RANDOM_RADIUS = 80

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {Function} options.getAgentStatus - Get agent status
 * @param {Function} options.getSpeedValue - Get current speed value
 * @param {import('vue').Ref} options.agentPositions - Agent positions ref
 * @param {string} options.AGENT_STATUS_IDLE - Idle status constant
 * @param {Function} [options.isAgentDeceased] - Check if agent is deceased (contagion). Returns true if sandbox mode is active and agent is deceased.
 */
export function useIdleWander({ ctx, getAgentStatus, getSpeedValue, agentPositions, AGENT_STATUS_IDLE, isAgentDeceased }) {
    let edgeAdjacency = new Map()
    let idleWanderTimers = new Map()

    /**
     * Build adjacency map from edges for idle wandering.
     * Maps each nodeId to the set of its connected neighbor nodeIds.
     */
    function buildEdgeAdjacency(edges) {
        edgeAdjacency.clear()
        edges.forEach(edge => {
            if (!edgeAdjacency.has(edge.from)) edgeAdjacency.set(edge.from, new Set())
            if (!edgeAdjacency.has(edge.to)) edgeAdjacency.set(edge.to, new Set())
            edgeAdjacency.get(edge.from).add(edge.to)
            edgeAdjacency.get(edge.to).add(edge.from)
        })
    }

    /**
     * Initialize idle wander timers with random stagger for all interactive agents.
     */
    function initIdleWanderTimers() {
        idleWanderTimers.clear()
        const now = Date.now()
        ctx.agentSprites.forEach((ag, nodeId) => {
            if (!ag.interactive) return
            idleWanderTimers.set(nodeId, {
                nextWanderTime: now + Math.random() * WANDER_INITIAL_DELAY_MAX
            })
        })
    }

    /**
     * Reset a single agent's wander cooldown with random delay.
     */
    function resetWanderCooldown(nodeId) {
        const delay = WANDER_COOLDOWN_MIN + Math.random() * (WANDER_COOLDOWN_MAX - WANDER_COOLDOWN_MIN)
        idleWanderTimers.set(nodeId, {
            nextWanderTime: Date.now() + delay
        })
    }

    /**
     * Check idle agents and start wander animations when cooldown has elapsed.
     * Called every frame from renderLoop().
     */
    function updateIdleWanders() {
        const now = Date.now()

        ctx.agentSprites.forEach((ag, nodeId) => {
            if (!ag.interactive) return

            // DECEASED agents never wander (frozen in place)
            if (isAgentDeceased && isAgentDeceased(nodeId)) return
            // Only wander when idle and not already animating
            const status = getAgentStatus(nodeId)
            if (status !== AGENT_STATUS_IDLE) return
            if (ctx.animatingAgents.has(nodeId)) return

            // Check cooldown
            const timer = idleWanderTimers.get(nodeId)
            if (!timer || now < timer.nextWanderTime) return

            // Pick wander target
            const agPos = agentPositions.value.get(nodeId)
            if (!agPos) return

            let targetX, targetY
            const neighbors = edgeAdjacency.get(nodeId)
            // 50/50 split: wander toward a neighbor OR in a random direction
            // to prevent visual clustering from consistently moving toward neighbors
            const useRandomDirection = Math.random() < 0.5

            if (neighbors && neighbors.size > 0 && !useRandomDirection) {
                // Pick a random connected neighbor
                const neighborArray = Array.from(neighbors)
                const randomNeighbor = neighborArray[Math.floor(Math.random() * neighborArray.length)]
                const neighborPos = agentPositions.value.get(randomNeighbor)

                if (neighborPos) {
                    // Move only part-way toward the neighbor
                    const ratio = WANDER_DISTANCE_RATIO_MIN +
                        Math.random() * (WANDER_DISTANCE_RATIO_MAX - WANDER_DISTANCE_RATIO_MIN)
                    targetX = agPos.x + (neighborPos.x - agPos.x) * ratio
                    targetY = agPos.y + (neighborPos.y - agPos.y) * ratio
                } else {
                    const angle = Math.random() * Math.PI * 2
                    targetX = agPos.x + Math.cos(angle) * WANDER_RANDOM_RADIUS
                    targetY = agPos.y + Math.sin(angle) * WANDER_RANDOM_RADIUS
                }
            } else {
                const angle = Math.random() * Math.PI * 2
                targetX = agPos.x + Math.cos(angle) * WANDER_RANDOM_RADIUS
                targetY = agPos.y + Math.sin(angle) * WANDER_RANDOM_RADIUS
            }

            // Compute path using existing pathfinder
            let wanderPath = [{ x: agPos.x, y: agPos.y }, { x: targetX, y: targetY }]
            if (ctx.pathfinder) {
                if (ctx.pathfinder.isBlocked(targetX, targetY)) {
                    const safe = ctx.pathfinder.findNearestUnblocked(targetX, targetY)
                    targetX = safe.x
                    targetY = safe.y
                }
                const computed = ctx.pathfinder.findPath(agPos.x, agPos.y, targetX, targetY)
                if (computed && computed.length > 0) {
                    wanderPath = computed
                }
            }

            // Calculate duration (slower than communication)
            let pathDist = 0
            for (let i = 1; i < wanderPath.length; i++) {
                const dx = wanderPath[i].x - wanderPath[i - 1].x
                const dy = wanderPath[i].y - wanderPath[i - 1].y
                pathDist += Math.sqrt(dx * dx + dy * dy)
            }
            const speed = getSpeedValue() * WANDER_SPEED_FACTOR
            const duration = Math.max(2000, Math.min(pathDist / speed, 5000))

            // Start wander animation
            ctx.animatingAgents.set(nodeId, {
                startTime: now,
                duration,
                startX: agPos.x,
                startY: agPos.y,
                meetX: targetX,
                meetY: targetY,
                path: wanderPath,
                pathIndex: 0,
                currentFrame: 1,
                lastTrailTime: 0,
                type: 'wander'
            })

            // Set next cooldown (will be reset again when animation completes)
            idleWanderTimers.set(nodeId, { nextWanderTime: Infinity })
        })
    }

    function cleanup() {
        edgeAdjacency.clear()
        idleWanderTimers.clear()
    }

    return {
        buildEdgeAdjacency,
        initIdleWanderTimers,
        resetWanderCooldown,
        updateIdleWanders,
        cleanup
    }
}
