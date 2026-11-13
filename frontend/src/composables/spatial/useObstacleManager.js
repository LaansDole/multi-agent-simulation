/**
 * @fileoverview Obstacle management composable for the spatial canvas.
 * Handles obstacle rendering, selection, deletion, drag, and placement ghost preview.
 */
import { ref, computed, markRaw } from 'vue'
import { Container, Sprite, Graphics, Assets, Rectangle, Circle } from 'pixi.js'

// ───────── HELPERS ─────────

/**
 * Parse a hex color string to integer.
 * @param {string} hex - Hex color string (e.g., '#ff0000')
 * @returns {number} Color as integer
 */
export function parseHexColor(hex) {
    if (!hex || typeof hex !== 'string') return 0x666666
    const cleanHex = hex.replace('#', '')
    return parseInt(cleanHex, 16)
}

/**
 * Get alpha value based on obstacle type.
 * @param {string} type - Obstacle type (wall, furniture, decoration)
 * @returns {number} Alpha value (0-1)
 */
function getObstacleAlpha(type) {
    switch (type) {
        case 'wall':
            return 1.0
        case 'furniture':
            return 0.6
        case 'decoration':
            return 0.4
        default:
            return 0.7
    }
}

// Agent approach offset from obstacle edge
const EDGE_APPROACH_OFFSET = 10

/**
 * Compute the nearest point on an obstacle's edge from an agent's position.
 * @param {number} agentX - Agent X
 * @param {number} agentY - Agent Y
 * @param {number} obstacleX - Obstacle position X
 * @param {number} obstacleY - Obstacle position Y
 * @param {string} shape - 'rectangle' or 'circle'
 * @param {object} size - { width, height } or { radius }
 * @returns {{ x: number, y: number }}
 */
export function computeObstacleEdgePosition(agentX, agentY, obstacleX, obstacleY, shape, size) {
    if (shape === 'circle') {
        const radius = (size.radius || 25) + EDGE_APPROACH_OFFSET
        const dx = agentX - obstacleX
        const dy = agentY - obstacleY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) {
            // Agent is at center — pick arbitrary edge
            return { x: obstacleX + radius, y: obstacleY }
        }
        return {
            x: obstacleX + (dx / dist) * radius,
            y: obstacleY + (dy / dist) * radius
        }
    }

    // Rectangle: find nearest point on perimeter
    const w = size.width || 50
    const h = size.height || 50
    // Rectangle origin is top-left corner
    const cx = obstacleX + w / 2
    const cy = obstacleY + h / 2
    const hw = w / 2 + EDGE_APPROACH_OFFSET
    const hh = h / 2 + EDGE_APPROACH_OFFSET

    const dx = agentX - cx
    const dy = agentY - cy

    // Clamp to box edge
    const clampedX = Math.max(-hw, Math.min(hw, dx))
    const clampedY = Math.max(-hh, Math.min(hh, dy))

    // If agent is inside the expanded box, project to nearest edge
    if (Math.abs(clampedX) < hw && Math.abs(clampedY) < hh) {
        const distToLeft = clampedX + hw
        const distToRight = hw - clampedX
        const distToTop = clampedY + hh
        const distToBottom = hh - clampedY
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom)
        if (minDist === distToLeft) return { x: cx - hw, y: cy + clampedY }
        if (minDist === distToRight) return { x: cx + hw, y: cy + clampedY }
        if (minDist === distToTop) return { x: cx + clampedX, y: cy - hh }
        return { x: cx + clampedX, y: cy + hh }
    }

    return { x: cx + clampedX, y: cy + clampedY }
}

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {import('vue').Ref} options.canvasRef - Canvas element ref
 * @param {object} options.spatialConfig - Spatial config composable
 * @param {Function} options.emit - Component emit function
 * @param {Function} options.initPathfinder - Pathfinder init callback
 * @param {Function} options.scheduleConfigSave - Debounced config save callback
 * @param {Function} options.snapToGrid - Grid snap helper
 */
export function useObstacleManager({ ctx, canvasRef, spatialConfig, emit, initPathfinder, scheduleConfigSave, snapToGrid, moveSelectedAgentId, getExecuteAgentMove }) {
    const selectedObstacleId = ref(null)
    const showDeleteConfirm = ref(false)

    // ── Computed ──

    const selectedObstacle = computed(() => {
        if (!selectedObstacleId.value) return null
        const obs = ctx.obstacleSprites.get(selectedObstacleId.value)
        return obs?.data || null
    })

    const obstacleTooltipStyle = computed(() => {
        if (!selectedObstacle.value || !ctx.app?.renderer) {
            return { display: 'none' }
        }
        const obs = ctx.obstacleSprites.get(selectedObstacleId.value)
        if (!obs) return { display: 'none' }

        const canvasRect = canvasRef.value?.getBoundingClientRect()
        if (!canvasRect) return { display: 'none' }

        const scaleX = canvasRect.width / ctx.app.renderer.width
        const scaleY = canvasRect.height / ctx.app.renderer.height

        const bounds = obs.container.getBounds()
        const left = (bounds.x + bounds.width / 2) * scaleX
        const top = bounds.y * scaleY - 10

        return {
            left: `${left}px`,
            top: `${top}px`
        }
    })

    // ── Agent Collision Check ──

    function checkAgentCollision(obstacleX, obstacleY, shape, size) {
        const collisionRadius = 30
        let obstacleRadius

        if (shape === 'rectangle') {
            const width = size.width || 50
            const height = size.height || 50
            obstacleRadius = Math.sqrt(width * width + height * height) / 2
        } else {
            obstacleRadius = size.radius || 25
        }

        for (const [, ag] of ctx.agentSprites) {
            if (!ag.interactive) continue
            const dx = ag.container.x - obstacleX
            const dy = ag.container.y - obstacleY
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < obstacleRadius + collisionRadius) {
                return true
            }
        }
        return false
    }

    // ── Placement Ghost ──

    function updatePlacementGhost(worldX, worldY, obstacleEditorRef) {
        if (!ctx.placementGhostGraphics) return

        const CELL_SIZE = 40 // GRID_SIZE constant
        const toolMode = obstacleEditorRef?.toolMode?.value || obstacleEditorRef?.toolMode || 'pointer'

        // ── Eraser ghost: red-tinted cell with X indicator ──
        if (toolMode === 'eraser') {
            const snappedX = snapToGrid(worldX)
            const snappedY = snapToGrid(worldY)
            const eraserColor = 0xef4444

            ctx.placementGhostGraphics.clear()

            // Red cell background
            ctx.placementGhostGraphics.rect(snappedX, snappedY, CELL_SIZE, CELL_SIZE)
            ctx.placementGhostGraphics.fill({ color: eraserColor, alpha: 0.2 })
            ctx.placementGhostGraphics.rect(snappedX, snappedY, CELL_SIZE, CELL_SIZE)
            ctx.placementGhostGraphics.stroke({ width: 2, color: eraserColor, alpha: 0.7 })

            // X indicator
            const pad = 10
            ctx.placementGhostGraphics.moveTo(snappedX + pad, snappedY + pad)
            ctx.placementGhostGraphics.lineTo(snappedX + CELL_SIZE - pad, snappedY + CELL_SIZE - pad)
            ctx.placementGhostGraphics.moveTo(snappedX + CELL_SIZE - pad, snappedY + pad)
            ctx.placementGhostGraphics.lineTo(snappedX + pad, snappedY + CELL_SIZE - pad)
            ctx.placementGhostGraphics.stroke({ width: 2, color: eraserColor, alpha: 0.6 })

            ctx.placementGhostGraphics.visible = true
            return
        }

        // ── Obstacle placement ghost ──
        const info = obstacleEditorRef?.getPlacementInfo?.()

        if (info) {
            const snappedX = snapToGrid(worldX)
            const snappedY = snapToGrid(worldY)
            const colorInt = parseHexColor(info.color)

            ctx.placementGhostGraphics.clear()

            if (info.shape === 'circle') {
                const radius = info.size.radius || 20
                ctx.placementGhostGraphics.circle(snappedX, snappedY, radius)
                ctx.placementGhostGraphics.fill({ color: colorInt, alpha: 0.25 })
                ctx.placementGhostGraphics.circle(snappedX, snappedY, radius)
                ctx.placementGhostGraphics.stroke({ width: 2, color: colorInt, alpha: 0.6 })
            } else {
                const w = info.size.width || 50
                const h = info.size.height || 50
                ctx.placementGhostGraphics.rect(snappedX, snappedY, w, h)
                ctx.placementGhostGraphics.fill({ color: colorInt, alpha: 0.25 })
                ctx.placementGhostGraphics.rect(snappedX, snappedY, w, h)
                ctx.placementGhostGraphics.stroke({ width: 2, color: colorInt, alpha: 0.6 })
            }

            ctx.placementGhostGraphics.visible = true
            return
        }

        // ── Floor tile ghost: colored cell ──
        const floorInfo = obstacleEditorRef?.getFloorInfo?.()

        if (floorInfo) {
            const snappedX = snapToGrid(worldX)
            const snappedY = snapToGrid(worldY)
            const colorInt = floorInfo.color ? parseHexColor(floorInfo.color) : 0x4ade80

            ctx.placementGhostGraphics.clear()

            ctx.placementGhostGraphics.rect(snappedX, snappedY, CELL_SIZE, CELL_SIZE)
            ctx.placementGhostGraphics.fill({ color: colorInt, alpha: 0.25 })
            ctx.placementGhostGraphics.rect(snappedX, snappedY, CELL_SIZE, CELL_SIZE)
            ctx.placementGhostGraphics.stroke({ width: 2, color: colorInt, alpha: 0.6 })

            ctx.placementGhostGraphics.visible = true
            return
        }

        // No valid ghost to show
        ctx.placementGhostGraphics.visible = false
    }

    // ── Drawing ──

    async function drawObstacles() {
        if (!ctx.obstacleContainer || !ctx.app?.renderer) return

        // Clear selection when redrawing
        selectedObstacleId.value = null

        // Clear existing obstacles
        ctx.obstacleContainer.removeChildren()
        ctx.obstacleSprites.clear()

        const config = spatialConfig.value
        const obstacles = config?.obstacles || []
        if (!obstacles.length) return

        const obstaclePromises = obstacles.map(async (obstacle) => {
            const { id, shape, position, size, color, type, sprite: spriteFile } = obstacle
            if (!shape || !position || !size) return

            const alpha = getObstacleAlpha(type)
            const colorInt = parseHexColor(color)

            const obstacleGroup = new Container()
            obstacleGroup.x = position.x
            obstacleGroup.y = position.y
            obstacleGroup.eventMode = 'static'
            obstacleGroup.cursor = 'pointer'

            const graphics = new Graphics()
            let sprite = null

            if (spriteFile) {
                try {
                    const spritePath = `/sprites/obstacles/${spriteFile}`
                    const texture = await Assets.load(spritePath)

                    if (texture) {
                        sprite = new Sprite(texture)

                        if (shape === 'rectangle') {
                            const width = size.width || 50
                            const height = size.height || 50
                            sprite.width = width
                            sprite.height = height
                        } else if (shape === 'circle') {
                            const radius = size.radius || 25
                            const diameter = radius * 2
                            sprite.width = diameter
                            sprite.height = diameter
                            sprite.anchor.set(0.5, 0.5)
                            sprite.x = 0
                            sprite.y = 0
                        }

                        obstacleGroup.addChild(sprite)
                    }
                } catch (error) {
                    console.warn(`Failed to load sprite for obstacle ${id}:`, error)
                    sprite = null
                }
            }

            if (!sprite) {
                if (shape === 'rectangle') {
                    const width = size.width || 50
                    const height = size.height || 50

                    graphics.rect(0, 0, width, height)
                    graphics.fill({ color: colorInt, alpha })

                    graphics.rect(0, 0, width, height)
                    graphics.stroke({ width: 2, color: colorInt, alpha: alpha * 0.8 })

                    obstacleGroup.hitArea = new Rectangle(0, 0, width, height)
                } else if (shape === 'circle') {
                    const radius = size.radius || 25

                    graphics.circle(0, 0, radius)
                    graphics.fill({ color: colorInt, alpha })

                    graphics.circle(0, 0, radius)
                    graphics.stroke({ width: 2, color: colorInt, alpha: alpha * 0.8 })

                    obstacleGroup.hitArea = new Circle(0, 0, radius)
                }

                obstacleGroup.addChild(graphics)
            } else {
                if (shape === 'rectangle') {
                    const width = size.width || 50
                    const height = size.height || 50
                    obstacleGroup.hitArea = new Rectangle(0, 0, width, height)
                } else if (shape === 'circle') {
                    const radius = size.radius || 25
                    obstacleGroup.hitArea = new Circle(0, 0, radius)
                }
            }

            // Selection highlight (initially hidden)
            const highlight = new Graphics()
            highlight.visible = false
            obstacleGroup.addChild(highlight)

            // Click handler
            obstacleGroup.on('pointerdown', (e) => {
                e.stopPropagation()
                // If an agent is move-selected, animate it to this obstacle's edge
                const executeFn = getExecuteAgentMove?.()
                if (moveSelectedAgentId?.value && executeFn) {
                    const agentId = moveSelectedAgentId.value
                    const agPos = ctx.agentSprites.get(agentId)
                    if (agPos) {
                        const ax = agPos.container.x
                        const ay = agPos.container.y
                        const edge = computeObstacleEdgePosition(
                            ax, ay, obstacleGroup.x, obstacleGroup.y, shape, size
                        )
                        executeFn(agentId, edge.x, edge.y)
                        moveSelectedAgentId.value = null
                    }
                    return
                }
                selectObstacle(id, obstacle, obstacleGroup, highlight, graphics, shape, size)
            })

            // Drag handler
            setupObstacleDrag(obstacleGroup, id, shape, size, graphics, highlight)

            ctx.obstacleContainer.addChild(obstacleGroup)

            ctx.obstacleSprites.set(id, markRaw({
                container: obstacleGroup,
                graphics,
                highlight,
                shape,
                data: obstacle
            }))
        })

        await Promise.all(obstaclePromises)
    }

    // ── Selection ──

    function selectObstacle(id, obstacleData, container, highlight, graphics, shape, size) {
        // Deselect previous
        if (selectedObstacleId.value && selectedObstacleId.value !== id) {
            const prev = ctx.obstacleSprites.get(selectedObstacleId.value)
            if (prev) {
                prev.highlight.visible = false
            }
        }

        // Toggle selection
        if (selectedObstacleId.value === id) {
            selectedObstacleId.value = null
            highlight.visible = false
            emit('obstacle-selected', null)
        } else {
            selectedObstacleId.value = id

            // Draw highlight
            highlight.clear()
            const glowColor = 0x818cf8

            if (shape === 'rectangle') {
                const width = size.width || 50
                const height = size.height || 50
                const padding = 6

                highlight.rect(-padding, -padding, width + padding * 2, height + padding * 2)
                highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

                highlight.rect(-padding - 2, -padding - 2, width + padding * 2 + 4, height + padding * 2 + 4)
                highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
            } else if (shape === 'circle') {
                const radius = size.radius || 25
                const padding = 6

                highlight.circle(0, 0, radius + padding)
                highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

                highlight.circle(0, 0, radius + padding + 3)
                highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
            }

            highlight.visible = true
            emit('obstacle-selected', obstacleData)
        }
    }

    function deselectObstacle() {
        if (selectedObstacleId.value) {
            const prev = ctx.obstacleSprites.get(selectedObstacleId.value)
            if (prev) {
                prev.highlight.visible = false
            }
            selectedObstacleId.value = null
            emit('obstacle-selected', null)
        }
    }

    // ── Delete ──

    function confirmDeleteObstacle() {
        if (!selectedObstacleId.value) return

        const obstacle = ctx.obstacleSprites.get(selectedObstacleId.value)
        if (!obstacle) return

        const { shape, data } = obstacle
        let isLarge = false

        if (shape === 'rectangle') {
            const width = data.size?.width || 50
            const height = data.size?.height || 50
            isLarge = width > 100 || height > 100
        } else if (shape === 'circle') {
            const radius = data.size?.radius || 25
            isLarge = radius > 50
        }

        if (isLarge) {
            showDeleteConfirm.value = true
        } else {
            executeDeleteObstacle()
        }
    }

    function executeDeleteObstacle() {
        if (!selectedObstacleId.value) return

        const obstacleId = selectedObstacleId.value

        const obstacle = ctx.obstacleSprites.get(obstacleId)
        if (obstacle && ctx.obstacleContainer) {
            ctx.obstacleContainer.removeChild(obstacle.container)
            ctx.obstacleSprites.delete(obstacleId)
        }

        spatialConfig.removeObstacle(obstacleId)

        selectedObstacleId.value = null
        showDeleteConfirm.value = false

        if (ctx.app?.renderer) {
            initPathfinder(ctx.app.renderer.width, ctx.app.renderer.height)
        }

        emit('obstacle-selected', null)
        emit('config-changed', spatialConfig.value)
    }

    // ── Drag ──

    function setupObstacleDrag(container, obstacleId, shape, size, graphics, highlight) {
        let dragging = false
        let dragPending = false
        let dragStartPos = { x: 0, y: 0 }
        let dragOffset = { x: 0, y: 0 }
        const DRAG_THRESHOLD = 5

        container.on('pointerdown', (e) => {
            // Record start position but don't start drag yet
            dragPending = true
            dragging = false
            const globalPos = e.global
            dragStartPos.x = globalPos.x
            dragStartPos.y = globalPos.y
            dragOffset.x = container.x - globalPos.x
            dragOffset.y = container.y - globalPos.y
        })

        container.on('globalpointermove', (e) => {
            if (!dragPending && !dragging) return
            const globalPos = e.global

            // Check if movement exceeds threshold to start actual drag
            if (dragPending && !dragging) {
                const dx = globalPos.x - dragStartPos.x
                const dy = globalPos.y - dragStartPos.y
                if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

                // Threshold exceeded — start actual drag
                dragging = true
                dragPending = false
                container.cursor = 'grabbing'
                container.alpha = 0.85
                ctx.obstacleContainer.setChildIndex(container, ctx.obstacleContainer.children.length - 1)

                // Hide tooltip during drag by deselecting
                selectedObstacleId.value = null
            }

            if (!dragging) return

            let newX = globalPos.x + dragOffset.x
            let newY = globalPos.y + dragOffset.y

            newX = snapToGrid(newX)
            newY = snapToGrid(newY)

            container.x = newX
            container.y = newY

            const hasCollision = checkAgentCollision(newX, newY, shape, size)

            highlight.clear()
            const glowColor = hasCollision ? 0xef4444 : 0x818cf8

            if (shape === 'rectangle') {
                const width = size.width || 50
                const height = size.height || 50
                const padding = 6

                highlight.rect(-padding, -padding, width + padding * 2, height + padding * 2)
                highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

                highlight.rect(-padding - 2, -padding - 2, width + padding * 2 + 4, height + padding * 2 + 4)
                highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
            } else if (shape === 'circle') {
                const radius = size.radius || 25
                const padding = 6

                highlight.circle(0, 0, radius + padding)
                highlight.stroke({ width: 3, color: glowColor, alpha: 0.9 })

                highlight.circle(0, 0, radius + padding + 3)
                highlight.stroke({ width: 1, color: glowColor, alpha: 0.4 })
            }

            highlight.visible = true
        })

        const onPointerUp = () => {
            const wasDragging = dragging
            dragging = false
            dragPending = false

            if (wasDragging) {
                // Actual drag occurred — finalize position
                container.cursor = 'pointer'
                container.alpha = 1

                const snappedX = snapToGrid(container.x)
                const snappedY = snapToGrid(container.y)

                spatialConfig.updateObstaclePosition(obstacleId, { x: snappedX, y: snappedY })
                initPathfinder(ctx.app.renderer.width, ctx.app.renderer.height)
                scheduleConfigSave()

                highlight.clear()
                highlight.visible = false
            }
        }

        container.on('pointerup', onPointerUp)
        container.on('pointerupoutside', onPointerUp)
    }

    // ── Cleanup ──

    function cleanup() {
        ctx.obstacleSprites.clear()
        selectedObstacleId.value = null
        showDeleteConfirm.value = false
    }

    return {
        selectedObstacleId,
        selectedObstacle,
        obstacleTooltipStyle,
        showDeleteConfirm,
        drawObstacles,
        selectObstacle,
        deselectObstacle,
        confirmDeleteObstacle,
        executeDeleteObstacle,
        updatePlacementGhost,
        checkAgentCollision,
        cleanup
    }
}
