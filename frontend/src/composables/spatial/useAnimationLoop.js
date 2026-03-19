/**
 * @fileoverview Animation loop composable for the spatial canvas.
 * Handles the render loop, active states, animation state machine,
 * per-frame separation, emotes, trail particles, and connection rendering.
 */
import { Assets, Sprite } from 'pixi.js'
import { spriteFetcher } from '../../utils/spriteFetcher.js'
import { getFloorBrightnessAt } from '../../utils/colorUtils.js'

// ───────── HELPERS ─────────

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {import('vue').Ref} options.canvasRef - Canvas element ref
 * @param {import('vue').Ref} options.agentPositions - Agent positions ref
 * @param {import('vue').Ref} options.trailParticles - Trail particles ref
 * @param {import('vue').Ref} options.activeConnections - Active connections ref

 * @param {Function} options.getAgentStatus - Get agent status
 * @param {Function} options.getAgentEmote - Get agent emote
 * @param {Function} options.addTrailParticle - Add a trail particle
 * @param {Function} options.cleanupTrailParticles - Cleanup expired trail particles
 * @param {Function} options.cleanupConnections - Cleanup expired connections
 * @param {Function} options.updateIdleWanders - Update idle wander animations
 * @param {Function} options.resetWanderCooldown - Reset wander cooldown
 * @param {object} options.STATUS_COLORS - Status color map
 * @param {object} options.STATUS_PULSE - Status pulse speed map
 * @param {object} options.AGENT_STATUS - Agent status enum
 * @param {number} options.MIN_AGENT_SEPARATION - Per-frame separation threshold
 */
export function useAnimationLoop({
    ctx,
    canvasRef,
    agentPositions,
    trailParticles,
    activeConnections,

    getAgentStatus,
    getAgentCondition,
    getAgentEmote,
    addTrailParticle,
    cleanupTrailParticles,
    cleanupConnections,
    updateIdleWanders,
    resetWanderCooldown,
    STATUS_COLORS,
    STATUS_PULSE,
    AGENT_STATUS,
    CONDITION_COLORS,
    CONDITION_PULSE,
    MIN_AGENT_SEPARATION,
    updateContagion,
    updateContaminationOverlays,
    updateInfectionHeatmap,
    recordResidual,
    sandboxMode,
    moveSelectedAgentId
}) {

    let lastFrameTime = Date.now()

    // ───── Adaptive label color state ─────
    // Track per-agent: last position when brightness was sampled and last sample time.
    // Updates are throttled to every 500ms OR when an agent moves >= 40px.
    const LABEL_UPDATE_INTERVAL_MS = 500
    const LABEL_UPDATE_DISTANCE_PX = 40
    const BRIGHTNESS_THRESHOLD = 0.55

    /** @type {Map<string, { x: number, y: number, time: number, bright: boolean }>} */
    const labelColorState = new Map()

    /**
     * Apply dark or light label styles based on whether the floor beneath
     * the agent is bright or dark.
     *
     * @param {object} ag - Agent sprite record from ctx.agentSprites
     * @param {boolean} isBright - true when floor brightness > BRIGHTNESS_THRESHOLD
     */
    function applyLabelStyle(ag, isBright) {
        if (!ag.label?.style) return
        const isMarker = !ag.interactive
        if (isBright) {
            // Dark text on bright floor
            ag.label.style.fill = '#1e1e3a'
        } else {
            // Light text on dark floor
            ag.label.style.fill = isMarker ? '#c9d1d9' : '#f9fafb'
        }

        // Redraw label backdrop with matching brightness
        if (ag.labelBackdrop && ag.label) {
            ag.labelBackdrop.clear()
            const padX = isMarker ? 3 : 4
            const padY = isMarker ? 1 : 2
            const w = (ag.label.width || 30) + padX * 2
            const h = (ag.label.height || 12) + padY * 2
            const radius = 4
            const color = isBright ? 0xffffff : 0x000000
            const alpha = isMarker ? 0.45 : 0.55
            ag.labelBackdrop.roundRect(-w / 2, ag.label.y - padY, w, h, radius)
            ag.labelBackdrop.fill({ color, alpha })
        }
    }

    /**
     * Throttled per-agent label color update.
     * Checks each interactive agent and re-evaluates floor brightness
     * when enough time has passed or the agent moved significantly.
     */
    function updateLabelColors() {
        const config = ctx.spatialConfig
        // ctx.spatialConfig is the raw object (reactive unwrapped) in SpatialCanvas.vue
        // If it is a Vue ref, unwrap it; otherwise use as-is.
        const spatialCfg = config?.value !== undefined ? config.value : config
        if (!spatialCfg?.floors?.length) {
            // No floors → reset any agent still in "bright" mode to dark-floor defaults
            labelColorState.forEach((state, nodeId) => {
                if (state.bright) {
                    const ag = ctx.agentSprites.get(nodeId)
                    if (ag) applyLabelStyle(ag, false)
                    state.bright = false
                }
            })
            return
        }

        const now = Date.now()

        ctx.agentSprites.forEach((ag, nodeId) => {
            if (!ag.label) return

            const cx = ag.container.x
            const cy = ag.container.y

            const prev = labelColorState.get(nodeId)
            if (prev) {
                const dx = cx - prev.x
                const dy = cy - prev.y
                const distSq = dx * dx + dy * dy
                const timeDelta = now - prev.time
                // Skip unless enough time passed or agent moved >= 40px
                if (timeDelta < LABEL_UPDATE_INTERVAL_MS &&
                    distSq < LABEL_UPDATE_DISTANCE_PX * LABEL_UPDATE_DISTANCE_PX) {
                    return
                }
            }

            const brightness = getFloorBrightnessAt(cx, cy, spatialCfg)
            const isBright = brightness > BRIGHTNESS_THRESHOLD

            // Only repaint if the brightness band changed (or first time)
            if (!prev || prev.bright !== isBright) {
                applyLabelStyle(ag, isBright)
            }

            labelColorState.set(nodeId, { x: cx, y: cy, time: now, bright: isBright })
        })
    }

    function renderLoop() {
        const now = Date.now()
        const deltaMs = now - lastFrameTime
        lastFrameTime = now

        updateActiveStates()
        updateIdleWanders()
        if (updateContagion) updateContagion(deltaMs)
        if (updateContaminationOverlays) updateContaminationOverlays()
        updateAnimations()
        if (updateInfectionHeatmap) updateInfectionHeatmap()
        applyPerFrameSeparation()
        updateEmotes()
        updateLabelColors()
        drawTrailParticles()
        drawConnections()
        cleanupConnections()
        cleanupTrailParticles()
    }

    function updateActiveStates() {
        ctx.agentSprites.forEach((ag, nodeId) => {
            if (!ag.interactive || !ag.glow) return

            // When sandbox mode is active, use contagion condition for glow;
            // otherwise fall back to workflow status
            let color, pulseSpeed
            if (sandboxMode?.value && getAgentCondition) {
                const condition = getAgentCondition(nodeId)
                color = CONDITION_COLORS?.[condition] ?? STATUS_COLORS[AGENT_STATUS.IDLE]
                pulseSpeed = CONDITION_PULSE?.[condition] ?? 0
            } else {
                const status = getAgentStatus(nodeId)
                color = STATUS_COLORS[status] || STATUS_COLORS[AGENT_STATUS.IDLE]
                pulseSpeed = STATUS_PULSE[status] || 0
            }

            ag.glow.clear()
            if (pulseSpeed > 0) {
                const pulse = 0.25 + 0.15 * Math.sin(Date.now() / (300 / pulseSpeed))
                ag.glow.circle(0, 0, 28)
                ag.glow.fill({ color, alpha: pulse })

                const scale = 1 + 0.04 * Math.sin(Date.now() / (300 / pulseSpeed))
                ag.container.scale.set(scale, scale)
            } else {
                ag.glow.circle(0, 0, 28)
                ag.glow.fill({ color, alpha: 0.15 })
                ag.container.scale.set(1, 1)
            }

            // Deceased agents get reduced opacity for faded/ghostly appearance
            if (sandboxMode?.value && getAgentCondition) {
                const condition = getAgentCondition(nodeId)
                if (ag.sprite) {
                    ag.sprite.alpha = condition === 'deceased' ? 0.4 : 1.0
                }
            }

            // Move-selection ring (cyan pulsing ring)
            if (ag.moveSelectRing) {
                const isSelected = moveSelectedAgentId?.value === nodeId
                if (isSelected) {
                    ag.moveSelectRing.clear()
                    const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 200)
                    ag.moveSelectRing.circle(0, 0, 32)
                    ag.moveSelectRing.stroke({ width: 2.5, color: 0x22d3ee, alpha: pulse })
                    ag.moveSelectRing.circle(0, 0, 36)
                    ag.moveSelectRing.stroke({ width: 1, color: 0x22d3ee, alpha: pulse * 0.4 })
                    ag.moveSelectRing.visible = true
                } else {
                    ag.moveSelectRing.visible = false
                }
            }
        })
    }

    function updateAnimations() {
        const now = Date.now()
        const toRemove = []

        ctx.animatingAgents.forEach((anim, nodeId) => {
            const ag = ctx.agentSprites.get(nodeId)
            if (!ag) {
                toRemove.push(nodeId)
                return
            }

            const elapsed = now - anim.startTime
            const progress = Math.min(elapsed / anim.duration, 1)

            const path = anim.path || []
            let currentX, currentY

            if (anim.type === 'move') {
                // One-way movement: walk forward along path only (no return trip)
                const moveProgress = easeInOutQuad(progress)
                currentX = getPositionAlongPath(path, moveProgress, false).x
                currentY = getPositionAlongPath(path, moveProgress, false).y
            } else if (progress < 0.5) {
                const moveProgress = easeInOutQuad(progress * 2)
                currentX = getPositionAlongPath(path, moveProgress, false).x
                currentY = getPositionAlongPath(path, moveProgress, false).y
            } else {
                const returnProgress = easeInOutQuad((progress - 0.5) * 2)
                currentX = getPositionAlongPath(path, returnProgress, true).x
                currentY = getPositionAlongPath(path, returnProgress, true).y
            }

            const prevX = ag.container.x
            const prevY = ag.container.y
            ag.container.x = currentX
            ag.container.y = currentY

            // Sync visual position to agentPositions so contagion
            // proximity checks use the actual on-screen position
            // during ALL animation types (wander + communication)
            agentPositions.value.set(nodeId, { x: currentX, y: currentY })

            // Skip trail particles for idle wander animations
            if (anim.type !== 'wander' && (!anim.lastTrailTime || now - anim.lastTrailTime > 100)) {
                addTrailParticle(ag.container.x, ag.container.y, 0x818cf8)
                anim.lastTrailTime = now
            }

            const frameIndex = Math.floor(elapsed / 250) % 4
            let targetFrame
            if (frameIndex === 0 || frameIndex === 2) targetFrame = 1
            else if (frameIndex === 1) targetFrame = 2
            else targetFrame = 3

            let direction = 'D'
            const moveX = currentX - prevX
            const moveY = currentY - prevY
            if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
                if (Math.abs(moveX) > Math.abs(moveY)) {
                    direction = moveX > 0 ? 'R' : 'L'
                } else {
                    direction = moveY > 0 ? 'D' : 'U'
                }
            }

            if (anim.currentFrame !== targetFrame || anim.currentDirection !== direction) {
                anim.currentFrame = targetFrame
                anim.currentDirection = direction
                const newSpritePath = spriteFetcher.fetchSprite(nodeId, direction, targetFrame)
                Assets.load(newSpritePath).then(tex => {
                    if (ag.sprite instanceof Sprite) {
                        ag.sprite.texture = tex
                    }
                }).catch(() => { })
            }

            if (progress >= 1) {
                toRemove.push(nodeId)

                // Record residual heatmap spot for infected agents
                // before snapping back to home position
                if (recordResidual && getAgentCondition) {
                    const condition = getAgentCondition(nodeId)
                    if (condition === 'infected') {
                        recordResidual(currentX, currentY)
                    }
                }

                if (anim.type === 'move') {
                    // Move animation: update home to destination (agent stays there)
                    const destX = anim.meetX
                    const destY = anim.meetY
                    ag.container.x = destX
                    ag.container.y = destY
                    agentPositions.value.set(nodeId, { x: destX, y: destY })
                    resetWanderCooldown(nodeId, 500, 1500)
                } else {
                    // Restore home position from anim.startX/startY
                    // (agentPositions was synced to mid-animation position)
                    const homeX = anim.startX
                    const homeY = anim.startY
                    ag.container.x = homeX
                    ag.container.y = homeY
                    agentPositions.value.set(nodeId, { x: homeX, y: homeY })

                    if (anim.type === 'wander') {
                        resetWanderCooldown(nodeId)
                    } else {
                        // Communication completed — shorter delay before wander resumes
                        resetWanderCooldown(nodeId, 500, 1500)
                    }
                }

                const idlePath = spriteFetcher.fetchSprite(nodeId, 'D', 1)
                Assets.load(idlePath).then(tex => {
                    if (ag.sprite instanceof Sprite) {
                        ag.sprite.texture = tex
                    }
                }).catch(() => { })
            }
        })

        toRemove.forEach(id => ctx.animatingAgents.delete(id))
    }

    /**
     * Get position along a path at given progress (0-1).
     * @param {Array<{x: number, y: number}>} path - Array of waypoints
     * @param {number} progress - Progress value 0-1
     * @param {boolean} reverse - Whether to traverse path in reverse
     * @returns {{x: number, y: number}} Interpolated position
     */
    function getPositionAlongPath(path, progress, reverse) {
        if (!path || path.length === 0) {
            return { x: 0, y: 0 }
        }

        const workingPath = reverse ? [...path].reverse() : path

        if (workingPath.length === 1) {
            return workingPath[0]
        }

        const totalSegments = workingPath.length - 1
        const scaledProgress = progress * totalSegments
        const segmentIndex = Math.min(Math.floor(scaledProgress), totalSegments - 1)
        const segmentProgress = scaledProgress - segmentIndex
        const eased = easeInOutQuad(segmentProgress)

        const start = workingPath[segmentIndex]
        const end = workingPath[segmentIndex + 1]

        return {
            x: start.x + (end.x - start.x) * eased,
            y: start.y + (end.y - start.y) * eased
        }
    }

    /**
     * Per-frame separation force: push animating agents apart
     * when they come within MIN_AGENT_SEPARATION of each other.
     */
    function applyPerFrameSeparation() {
        const ids = Array.from(ctx.animatingAgents.keys())
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const agA = ctx.agentSprites.get(ids[i])
                const agB = ctx.agentSprites.get(ids[j])
                if (!agA || !agB) continue

                const dx = agA.container.x - agB.container.x
                const dy = agA.container.y - agB.container.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < MIN_AGENT_SEPARATION && dist > 0) {
                    const overlap = (MIN_AGENT_SEPARATION - dist) / 2
                    const nx = dx / dist
                    const ny = dy / dist
                    agA.container.x += nx * overlap
                    agA.container.y += ny * overlap
                    agB.container.x -= nx * overlap
                    agB.container.y -= ny * overlap

                    // Revert if pushed into an obstacle
                    if (ctx.pathfinder) {
                        if (ctx.pathfinder.isBlocked(agA.container.x, agA.container.y)) {
                            agA.container.x -= nx * overlap
                            agA.container.y -= ny * overlap
                        }
                        if (ctx.pathfinder.isBlocked(agB.container.x, agB.container.y)) {
                            agB.container.x += nx * overlap
                            agB.container.y += ny * overlap
                        }
                    }
                }
            }
        }
    }

    /**
     * Update emote visuals: emoji bubbles + text badges (both PixiJS)
     */
    function updateEmotes() {
        ctx.agentSprites.forEach((ag, nodeId) => {
            if (!ag.interactive || !ag.emoteText) return

            const emote = getAgentEmote(nodeId)

            if (emote && emote.emoji) {
                ag.emoteText.text = emote.emoji
                ag.emoteText.visible = true
            } else {
                ag.emoteText.visible = false
            }

            // Update badge text (PixiJS, adjacent to emoji)
            if (ag.badgeText) {
                if (emote && emote.badge) {
                    ag.badgeText.text = emote.badge
                    ag.badgeText.visible = true
                    // Position badge to the right of the emoji
                    const gap = 2.50
                    const emojiWidth = ag.emoteText.visible ? ag.emoteText.width / 2 * (1 + gap) : 0
                    ag.badgeText.x = emojiWidth
                } else {
                    ag.badgeText.visible = false
                }
            }
        })
    }

    function drawTrailParticles() {
        if (!ctx.trailGraphics) return
        ctx.trailGraphics.clear()

        const now = Date.now()
        trailParticles.value.forEach(p => {
            const age = now - p.createdAt
            const lifeProgress = Math.min(age / 600, 1)
            const alpha = p.opacity * (1 - lifeProgress)
            const size = p.size * (1 - lifeProgress * 0.5)

            if (alpha > 0.01) {
                ctx.trailGraphics.circle(p.x, p.y, size)
                ctx.trailGraphics.fill({ color: p.color, alpha })
            }
        })
    }

    function drawConnections() {
        if (!ctx.connectionGraphics) return

        ctx.connectionGraphics.clear()
        const now = Date.now()

        activeConnections.value.forEach(conn => {
            const sourceAg = ctx.agentSprites.get(conn.source)
            const targetAg = ctx.agentSprites.get(conn.target)
            if (!sourceAg || !targetAg) return

            const elapsed = now - conn.startTime
            const progress = Math.min(elapsed / conn.duration, 1)
            const alpha = progress < 0.7 ? 0.6 : 0.6 * (1 - (progress - 0.7) / 0.3)

            const sx = sourceAg.container.x
            const sy = sourceAg.container.y
            const tx = targetAg.container.x
            const ty = targetAg.container.y

            ctx.connectionGraphics.moveTo(sx, sy)
            ctx.connectionGraphics.lineTo(tx, ty)
            ctx.connectionGraphics.stroke({ width: 3, color: 0x818cf8, alpha })

            // Arrow at midpoint
            const mx = (sx + tx) / 2
            const my = (sy + ty) / 2
            const angle = Math.atan2(ty - sy, tx - sx)
            const arrowSize = 8

            ctx.connectionGraphics.moveTo(mx + arrowSize * Math.cos(angle), my + arrowSize * Math.sin(angle))
            ctx.connectionGraphics.lineTo(mx + arrowSize * Math.cos(angle + 2.5), my + arrowSize * Math.sin(angle + 2.5))
            ctx.connectionGraphics.moveTo(mx + arrowSize * Math.cos(angle), my + arrowSize * Math.sin(angle))
            ctx.connectionGraphics.lineTo(mx + arrowSize * Math.cos(angle - 2.5), my + arrowSize * Math.sin(angle - 2.5))
            ctx.connectionGraphics.stroke({ width: 2, color: 0x818cf8, alpha })

            // Animated particle
            const particleProgress = (elapsed % 1000) / 1000
            const px = sx + (tx - sx) * particleProgress
            const py = sy + (ty - sy) * particleProgress
            ctx.connectionGraphics.circle(px, py, 4)
            ctx.connectionGraphics.fill({ color: 0xc4b5fd, alpha: alpha * 1.2 })
        })
    }

    return {
        renderLoop
    }
}
