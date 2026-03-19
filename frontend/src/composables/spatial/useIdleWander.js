/**
 * @fileoverview Idle ambient wander composable for the spatial canvas.
 * Makes idle agents wander along graph edges, creating lifelike ambient movement.
 */

// ───────── CONSTANTS ─────────

const WANDER_COOLDOWN_MIN = 3000
const WANDER_COOLDOWN_MAX = 8000
const POST_COMM_COOLDOWN_MIN = 500
const POST_COMM_COOLDOWN_MAX = 1500
const WANDER_INITIAL_DELAY_MAX = 5000
const WANDER_DISTANCE_RATIO_MIN = 0.3
const WANDER_DISTANCE_RATIO_MAX = 0.5
const WANDER_SPEED_FACTOR = 0.5
const WANDER_RANDOM_RADIUS = 80
const WANDER_REPULSION_RADIUS = 150
const WANDER_REPULSION_NOISE = Math.PI / 4 // ±45° angular noise
const NEIGHBOR_VISIT_CHANCE = 0.3           // 30% chance to visit a neighbor
const NEIGHBOR_MIN_DISTANCE = 60            // skip visit if already within 60px

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
    function resetWanderCooldown(nodeId, delayMin, delayMax) {
        const lo = delayMin ?? WANDER_COOLDOWN_MIN
        const hi = delayMax ?? WANDER_COOLDOWN_MAX
        const delay = lo + Math.random() * (hi - lo)
        idleWanderTimers.set(nodeId, {
            nextWanderTime: Date.now() + delay
        })
    }

    /**
     * Compute a repulsion direction that biases movement away from nearby agents.
     * Returns { dx, dy } (unit vector with noise) or null if no agents are nearby.
     */
    function computeRepulsionDirection(nodeId, agPos) {
        let rx = 0, ry = 0
        let hasNeighbor = false

        agentPositions.value.forEach((otherPos, otherId) => {
            if (otherId === nodeId) return
            const dx = agPos.x - otherPos.x
            const dy = agPos.y - otherPos.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 1 || dist > WANDER_REPULSION_RADIUS) return
            // Weight by inverse distance: closer agents push harder
            const weight = 1 / dist
            rx += (dx / dist) * weight
            ry += (dy / dist) * weight
            hasNeighbor = true
        })

        if (!hasNeighbor) return null

        // Normalize
        const mag = Math.sqrt(rx * rx + ry * ry)
        if (mag < 0.001) return null
        rx /= mag
        ry /= mag

        // Add angular noise for organic feel
        const noise = (Math.random() - 0.5) * 2 * WANDER_REPULSION_NOISE
        const cos = Math.cos(noise)
        const sin = Math.sin(noise)
        return {
            dx: rx * cos - ry * sin,
            dy: rx * sin + ry * cos
        }
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

            // Neighbor visit: occasionally wander toward a connected neighbor
            const neighbors = edgeAdjacency.get(nodeId)
            if (neighbors && neighbors.size > 0 && Math.random() < NEIGHBOR_VISIT_CHANCE) {
                const neighborIds = Array.from(neighbors)
                const neighborId = neighborIds[Math.floor(Math.random() * neighborIds.length)]
                const neighborPos = agentPositions.value.get(neighborId)
                if (neighborPos) {
                    const dx = neighborPos.x - agPos.x
                    const dy = neighborPos.y - agPos.y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    // Only visit if not already close (prevents clustering)
                    if (dist > NEIGHBOR_MIN_DISTANCE) {
                        const ratio = WANDER_DISTANCE_RATIO_MIN + Math.random() *
                            (WANDER_DISTANCE_RATIO_MAX - WANDER_DISTANCE_RATIO_MIN)
                        targetX = agPos.x + dx * ratio
                        targetY = agPos.y + dy * ratio
                    }
                }
            }

            // Fall through to repulsion/random if neighbor visit didn't set target
            if (targetX === undefined) {
                // Repulsion-based direction: bias away from nearby agents
                const repulsion = computeRepulsionDirection(nodeId, agPos)
                if (repulsion) {
                    targetX = agPos.x + repulsion.dx * WANDER_RANDOM_RADIUS
                    targetY = agPos.y + repulsion.dy * WANDER_RANDOM_RADIUS
                } else {
                    // No nearby agents — pure random wander
                    const angle = Math.random() * Math.PI * 2
                    targetX = agPos.x + Math.cos(angle) * WANDER_RANDOM_RADIUS
                    targetY = agPos.y + Math.sin(angle) * WANDER_RANDOM_RADIUS
                }
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
        computeRepulsionDirection,
        cleanup
    }
}
