/**
 * @fileoverview Communication animation composable for the spatial canvas.
 * Handles meeting point calculation, animation queue processing,
 * and communication animation execution between agents.
 */

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {Function} options.getSpeedValue - Get current speed value
 * @param {Function} options.setAgentStatus - Set agent status
 * @param {Function} options.getAgentStatus - Get agent status
 * @param {Function} options.enqueueAnimation - Queue an animation
 * @param {Function} options.dequeueAnimation - Dequeue next animation
 * @param {Function} options.getStaggerDelay - Get queue stagger delay
 * @param {Function} options.addConnection - Add visual connection between agents
 * @param {import('vue').Ref} options.isProcessingQueue - Queue processing flag
 * @param {import('vue').Ref} options.agentPositions - Agent positions ref
 * @param {Function} options.resetWanderCooldown - Reset wander cooldown for an agent
 * @param {object} options.AGENT_STATUS - Agent status enum
 * @param {number} options.COMMUNICATION_ANIMATION_DISTANCE - How far agents move toward each other
 * @param {number} options.MIN_MEETING_GAP - Minimum gap between meeting points
 */
export function useCommunicationAnimation({
    ctx,
    getSpeedValue,
    setAgentStatus,
    getAgentStatus,
    enqueueAnimation,
    dequeueAnimation,
    getStaggerDelay,
    addConnection,
    isProcessingQueue,
    agentPositions,
    resetWanderCooldown,
    AGENT_STATUS,
    COMMUNICATION_ANIMATION_DISTANCE,
    MIN_MEETING_GAP
}) {
    let queueTimerId = null

    /**
     * Calculate meeting points that never cross the midline.
     * Each agent's meeting point is clamped so they stop before the midpoint.
     */
    function calculateMeetingPoints(sx, sy, tx, ty) {
        const dx = tx - sx
        const dy = ty - sy
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < 1) {
            return {
                sourceMeet: { x: sx, y: sy },
                targetMeet: { x: tx, y: ty }
            }
        }

        const maxMove = Math.max(0, dist / 2 - MIN_MEETING_GAP / 2)
        const desiredMove = dist * COMMUNICATION_ANIMATION_DISTANCE
        const actualMove = Math.min(desiredMove, maxMove)
        const ratio = actualMove / dist

        return {
            sourceMeet: {
                x: sx + dx * ratio,
                y: sy + dy * ratio
            },
            targetMeet: {
                x: tx - dx * ratio,
                y: ty - dy * ratio
            }
        }
    }

    // ───────── ANIMATION QUEUE PROCESSOR ─────────

    function processAnimationQueue() {
        const item = dequeueAnimation()
        if (!item) {
            isProcessingQueue.value = false
            return
        }

        isProcessingQueue.value = true
        executeCommunicationAnimation(item.sourceId, item.targetId)

        queueTimerId = setTimeout(() => {
            processAnimationQueue()
        }, getStaggerDelay())
    }

    function startQueueProcessing() {
        if (isProcessingQueue.value) return
        processAnimationQueue()
    }

    // ───────── PUBLIC API ─────────

    function triggerCommunication(sourceId, targetId) {
        const sourceAg = ctx.agentSprites.get(sourceId)
        const targetAg = ctx.agentSprites.get(targetId)
        if (!sourceAg || !targetAg) return
        if (!sourceAg.interactive && !targetAg.interactive) return

        enqueueAnimation(sourceId, targetId)
        startQueueProcessing()
    }

    function executeCommunicationAnimation(sourceId, targetId) {
        const sourceAg = ctx.agentSprites.get(sourceId)
        const targetAg = ctx.agentSprites.get(targetId)
        if (!sourceAg || !targetAg) return

        const sx = sourceAg.container.x
        const sy = sourceAg.container.y
        const tx = targetAg.container.x
        const ty = targetAg.container.y

        // Use midline-clamped meeting points
        let { sourceMeet, targetMeet } = calculateMeetingPoints(sx, sy, tx, ty)

        // Adjust meeting points if they fall inside obstacles
        if (ctx.pathfinder) {
            if (ctx.pathfinder.isBlocked(sourceMeet.x, sourceMeet.y)) {
                sourceMeet = ctx.pathfinder.findNearestUnblocked(sourceMeet.x, sourceMeet.y)
            }
            if (ctx.pathfinder.isBlocked(targetMeet.x, targetMeet.y)) {
                targetMeet = ctx.pathfinder.findNearestUnblocked(targetMeet.x, targetMeet.y)
            }
        }

        // Calculate paths from start to meeting points using pathfinding
        let sourcePath = [{ x: sx, y: sy }, { x: sourceMeet.x, y: sourceMeet.y }]
        let targetPath = [{ x: tx, y: ty }, { x: targetMeet.x, y: targetMeet.y }]

        if (ctx.pathfinder) {
            const srcPath = ctx.pathfinder.findPath(sx, sy, sourceMeet.x, sourceMeet.y)
            if (srcPath && srcPath.length > 0) {
                sourcePath = srcPath
            }
            const tgtPath = ctx.pathfinder.findPath(tx, ty, targetMeet.x, targetMeet.y)
            if (tgtPath && tgtPath.length > 0) {
                targetPath = tgtPath
            }
        }

        // Calculate total path distance for duration
        const calcPathDistance = (path) => {
            let dist = 0
            for (let i = 1; i < path.length; i++) {
                const dx = path[i].x - path[i - 1].x
                const dy = path[i].y - path[i - 1].y
                dist += Math.sqrt(dx * dx + dy * dy)
            }
            return dist
        }

        const sourceDistance = calcPathDistance(sourcePath)
        const targetDistance = calcPathDistance(targetPath)
        const maxDistance = Math.max(sourceDistance, targetDistance)

        const speed = getSpeedValue()
        const duration = Math.max(1500, Math.min(maxDistance / speed, 6000))

        if (sourceAg.interactive) {
            setAgentStatus(sourceId, AGENT_STATUS.COMMUNICATING)
            ctx.animatingAgents.set(sourceId, {
                startTime: Date.now(),
                duration,
                startX: sx,
                startY: sy,
                meetX: sourceMeet.x,
                meetY: sourceMeet.y,
                path: sourcePath,
                pathIndex: 0,
                currentFrame: 1,
                lastTrailTime: 0
            })
        }

        if (targetAg.interactive) {
            setAgentStatus(targetId, AGENT_STATUS.COMMUNICATING)
            ctx.animatingAgents.set(targetId, {
                startTime: Date.now(),
                duration,
                startX: tx,
                startY: ty,
                meetX: targetMeet.x,
                meetY: targetMeet.y,
                path: targetPath,
                pathIndex: 0,
                currentFrame: 1,
                lastTrailTime: 0
            })
        }

        addConnection(sourceId, targetId, duration)

        setTimeout(() => {
            if (sourceAg.interactive && getAgentStatus(sourceId) === AGENT_STATUS.COMMUNICATING) {
                setAgentStatus(sourceId, AGENT_STATUS.IDLE)
            }
            if (targetAg.interactive && getAgentStatus(targetId) === AGENT_STATUS.COMMUNICATING) {
                setAgentStatus(targetId, AGENT_STATUS.IDLE)
            }
        }, duration)
    }

    function updateAgentStatus(agentId, status) {
        const ag = ctx.agentSprites.get(agentId)
        if (ag && ag.interactive) {
            setAgentStatus(agentId, status)

            // Cancel wander animation when entering non-idle status
            if (status !== AGENT_STATUS.IDLE) {
                const anim = ctx.animatingAgents.get(agentId)
                if (anim && anim.type === 'wander') {
                    ctx.animatingAgents.delete(agentId)
                    const origPos = agentPositions.value.get(agentId)
                    if (origPos) {
                        ag.container.x = origPos.x
                        ag.container.y = origPos.y
                    }
                }
            } else {
                // Returning to idle — reset wander cooldown
                resetWanderCooldown(agentId)
            }
        }
    }

    function cleanup() {
        if (queueTimerId) {
            clearTimeout(queueTimerId)
            queueTimerId = null
        }
    }

    return {
        triggerCommunication,
        updateAgentStatus,
        calculateMeetingPoints,
        cleanup
    }
}
