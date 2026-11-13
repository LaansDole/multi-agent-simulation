/**
 * @fileoverview PixiJS application lifecycle composable for the spatial canvas.
 * Handles app initialization, destruction, zoom, background grid,
 * panning, resize observation, and keyboard handlers.
 */
import { Application, Container, Graphics, Rectangle } from 'pixi.js'
import { markRaw } from 'vue'

// ───────── CONSTANTS ─────────

const ZOOM_STEP = 0.05
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3.0

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {import('vue').Ref} options.wrapperRef - Wrapper DOM element ref
 * @param {import('vue').Ref} options.canvasRef - Canvas DOM element ref

 * @param {Function} options.renderLoop - Render loop callback
 * @param {Function} options.buildScene - Build scene callback
 * @param {Function} options.drawObstacles - Draw obstacles callback
 * @param {Function} options.deselectObstacle - Deselect obstacle callback
 * @param {Function} options.obstacleUpdatePlacementGhost - Update placement ghost callback
 * @param {Function} options.cleanupCommunication - Cleanup communication composable
 * @param {Function} options.cleanupObstacles - Cleanup obstacle composable
 * @param {Function} options.cleanupFloors - Cleanup floors composable
 * @param {Function} options.cleanupIdleWander - Cleanup idle wander composable
 * @param {Function} options.initPathfinder - Initialize pathfinder
 * @param {Function} options.emit - Component emit
 * @param {object} options.props - Component props
 * @param {import('vue').Ref} options.selectedObstacleId - Selected obstacle ID
 * @param {Function} options.executeDeleteObstacle - Execute obstacle deletion
 * @param {number} options.GRID_SIZE - Grid cell size
 */
export function usePixiApp({
    ctx,
    wrapperRef,
    canvasRef,

    renderLoop,
    buildScene,
    drawObstacles,
    deselectObstacle,
    obstacleUpdatePlacementGhost,
    cleanupCommunication,
    cleanupObstacles,
    cleanupFloors,
    cleanupHeatmap,
    cleanupIdleWander,
    initPathfinder,
    emit,
    props,
    selectedObstacleId,
    executeDeleteObstacle,
    GRID_SIZE,
    moveSelectedAgentId
}) {
    let currentZoom = 1.0
    let isPanning = false
    let spaceKeyDown = false
    let panStart = { x: 0, y: 0 }
    let resizeObserver = null

    // ───────── INIT / DESTROY ─────────

    async function initPixi() {
        if (ctx.app) return

        const wrapper = wrapperRef.value
        const canvas = canvasRef.value
        if (!wrapper || !canvas) return

        const width = wrapper.clientWidth || 800
        const height = wrapper.clientHeight || 600

        const pixiApp = new Application()
        await pixiApp.init({
            canvas,
            width,
            height,
            backgroundColor: 0x1a1a2e,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        })
        ctx.app = markRaw(pixiApp)

        // Grid layer (bottommost)
        ctx.gridGraphics = markRaw(new Graphics())
        ctx.app.stage.addChild(ctx.gridGraphics)
        drawGrid()

        // Plain-canvas contamination overlay layer (below floors)
        ctx.contaminationContainer = markRaw(new Container())
        ctx.app.stage.addChild(ctx.contaminationContainer)

        // Floor layer (between contamination and obstacles)
        ctx.floorContainer = markRaw(new Container())
        ctx.app.stage.addChild(ctx.floorContainer)

        // Obstacle layer (between floor and agents)
        ctx.obstacleContainer = markRaw(new Container())
        ctx.app.stage.addChild(ctx.obstacleContainer)

        // Add background click handler for deselection + panning
        ctx.app.stage.eventMode = 'static'
        ctx.app.stage.hitArea = new Rectangle(0, 0, width, height)

        let bgPointerDown = false
        let bgDragStart = { x: 0, y: 0 }
        const PAN_THRESHOLD = 5
        let isBrushDragging = false

        /**
         * Check if the obstacle editor has an active brush/eraser tool.
         * @returns {boolean}
         */
        function isBrushOrEraserActive() {
            const editor = props.obstacleEditorRef
            if (!editor) return false
            const mode = editor.toolMode
            return mode === 'brush' || mode === 'eraser'
        }

        ctx.app.stage.on('pointerdown', (e) => {
            if (e.target === ctx.app.stage && e.button === 0) {
                bgPointerDown = true
                bgDragStart.x = e.global.x
                bgDragStart.y = e.global.y
                panStart.x = e.global.x - ctx.app.stage.x
                panStart.y = e.global.y - ctx.app.stage.y

                // If brush/eraser tool is active and not space-panning, start a drag stroke immediately
                if (!spaceKeyDown && isBrushOrEraserActive()) {
                    isBrushDragging = true
                    const worldPos = ctx.app.stage.toLocal(e.global)
                    emit('canvas-drag-start', { x: worldPos.x, y: worldPos.y })
                }
                return
            }
        })

        ctx.app.stage.on('pointermove', (e) => {
            // Handle panning detection (only when not brush-dragging)
            if (bgPointerDown && !isPanning && !isBrushDragging) {
                const dx = e.global.x - bgDragStart.x
                const dy = e.global.y - bgDragStart.y
                if (Math.sqrt(dx * dx + dy * dy) >= PAN_THRESHOLD) {
                    isPanning = true
                    wrapperRef.value.classList.add('panning')
                    deselectObstacle()
                }
            }
            // Space+drag panning takes priority and cancels any brush drag
            if (spaceKeyDown && bgPointerDown && !isPanning) {
                isPanning = true
                if (isBrushDragging) {
                    isBrushDragging = false
                    emit('canvas-drag-end')
                }
                wrapperRef.value.classList.add('panning')
                deselectObstacle()
            }
            if (isPanning) {
                ctx.app.stage.x = e.global.x - panStart.x
                ctx.app.stage.y = e.global.y - panStart.y
                drawGrid()
                return
            }
            // Emit continuous drag coordinates for brush/eraser
            if (isBrushDragging) {
                const worldPos = ctx.app.stage.toLocal(e.global)
                emit('canvas-drag', { x: worldPos.x, y: worldPos.y })
                // Also update placement ghost so user sees cursor feedback
                obstacleUpdatePlacementGhost(worldPos.x, worldPos.y, props.obstacleEditorRef)
                return
            }
            const worldPos = ctx.app.stage.toLocal(e.global)
            obstacleUpdatePlacementGhost(worldPos.x, worldPos.y, props.obstacleEditorRef)
        })

        const onStagePointerUp = (e) => {
            if (isPanning) {
                isPanning = false
                bgPointerDown = false
                wrapperRef.value.classList.remove('panning')
                return
            }
            // End brush/eraser drag stroke
            if (isBrushDragging) {
                isBrushDragging = false
                bgPointerDown = false
                emit('canvas-drag-end')
                return
            }
            if (bgPointerDown) {
                bgPointerDown = false
                deselectObstacle()
                if (moveSelectedAgentId) moveSelectedAgentId.value = null
                const worldPos = ctx.app.stage.toLocal(e.global)
                emit('canvas-click', { x: worldPos.x, y: worldPos.y })
            }
        }

        ctx.app.stage.on('pointerup', onStagePointerUp)
        ctx.app.stage.on('pointerupoutside', onStagePointerUp)

        // Placement ghost layer
        ctx.placementGhostGraphics = markRaw(new Graphics())
        ctx.placementGhostGraphics.visible = false
        ctx.app.stage.addChild(ctx.placementGhostGraphics)

        // Trail particles layer
        ctx.trailGraphics = markRaw(new Graphics())
        ctx.app.stage.addChild(ctx.trailGraphics)

        // Connection lines layer
        ctx.connectionGraphics = markRaw(new Graphics())
        ctx.app.stage.addChild(ctx.connectionGraphics)

        // Infection proximity heatmap layer (below agents, above connections)
        ctx.heatmapGraphics = markRaw(new Graphics())
        ctx.app.stage.addChild(ctx.heatmapGraphics)

        // Agent container (on top)
        ctx.agentContainer = markRaw(new Container())
        ctx.app.stage.addChild(ctx.agentContainer)

        ctx.app.ticker.add(renderLoop)

        resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width: w, height: h } = entry.contentRect
                if (w > 0 && h > 0 && ctx.app?.renderer) {
                    ctx.app.renderer.resize(w, h)
                    drawGrid()
                    drawObstacles()
                    initPathfinder(w, h)
                }
            }
        })
        resizeObserver.observe(wrapper)

        canvas.addEventListener('wheel', handleWheel, { passive: false })

        buildScene()
        initPathfinder(width, height)
    }

    function destroyPixi() {
        cleanupCommunication()
        if (resizeObserver) {
            resizeObserver.disconnect()
            resizeObserver = null
        }
        const canvas = canvasRef.value
        if (canvas) {
            canvas.removeEventListener('wheel', handleWheel)
        }
        ctx.agentSprites.clear()
        cleanupObstacles()
        cleanupFloors()
        if (cleanupHeatmap) cleanupHeatmap()
        ctx.animatingAgents.clear()
        cleanupIdleWander()

        currentZoom = 1.0
        if (ctx.app) {
            ctx.app.destroy(true, { children: true })
            ctx.app = null
            ctx.agentContainer = null
            ctx.obstacleContainer = null
            ctx.floorContainer = null
            ctx.contaminationContainer = null
            ctx.connectionGraphics = null
            ctx.trailGraphics = null
            ctx.heatmapGraphics = null
            ctx.gridGraphics = null
            ctx.placementGhostGraphics = null
        }
    }

    // ───────── ZOOM ─────────

    function handleWheel(e) {
        e.preventDefault()
        if (!ctx.app?.stage) return

        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta))
        if (newZoom === currentZoom) return

        const rect = canvasRef.value.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const stage = ctx.app.stage
        const worldX = (mouseX - stage.x) / currentZoom
        const worldY = (mouseY - stage.y) / currentZoom

        currentZoom = newZoom
        stage.scale.set(currentZoom, currentZoom)
        stage.x = mouseX - worldX * currentZoom
        stage.y = mouseY - worldY * currentZoom

        drawGrid()
    }

    // ───────── BACKGROUND GRID ─────────

    function drawGrid() {
        if (!ctx.gridGraphics || !ctx.app?.renderer) return
        ctx.gridGraphics.clear()

        const rendererW = ctx.app.renderer.width
        const rendererH = ctx.app.renderer.height

        const stageX = ctx.app.stage.x
        const stageY = ctx.app.stage.y
        const zoom = currentZoom || 1

        const worldLeft = -stageX / zoom
        const worldTop = -stageY / zoom
        const worldRight = worldLeft + rendererW / zoom
        const worldBottom = worldTop + rendererH / zoom

        ctx.app.stage.hitArea = new Rectangle(
            worldLeft, worldTop,
            worldRight - worldLeft, worldBottom - worldTop
        )

        const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE
        const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE
        const endX = Math.ceil(worldRight / GRID_SIZE) * GRID_SIZE
        const endY = Math.ceil(worldBottom / GRID_SIZE) * GRID_SIZE

        for (let x = startX; x <= endX; x += GRID_SIZE) {
            ctx.gridGraphics.moveTo(x, startY)
            ctx.gridGraphics.lineTo(x, endY)
        }
        for (let y = startY; y <= endY; y += GRID_SIZE) {
            ctx.gridGraphics.moveTo(startX, y)
            ctx.gridGraphics.lineTo(endX, y)
        }
        ctx.gridGraphics.stroke({ width: 1, color: 0x2a2a4a, alpha: 0.3 })
    }

    // ───────── KEYBOARD HANDLERS ─────────

    function handleKeyDown(e) {
        if (e.code === 'Space' && !spaceKeyDown) {
            spaceKeyDown = true
            if (wrapperRef.value && !isPanning) {
                wrapperRef.value.classList.add('pan-ready')
            }
            e.preventDefault()
            return
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObstacleId.value) {
            e.preventDefault()
            executeDeleteObstacle()
        }
    }

    function handleKeyUp(e) {
        if (e.code === 'Space') {
            spaceKeyDown = false
            if (wrapperRef.value) {
                wrapperRef.value.classList.remove('pan-ready')
                wrapperRef.value.classList.remove('panning')
            }
        }
    }

    function resetZoom() {
        if (!ctx.app?.stage) return
        currentZoom = 1.0
        ctx.app.stage.scale.set(1, 1)
        ctx.app.stage.x = 0
        ctx.app.stage.y = 0
        drawGrid()
    }

    return {
        initPixi,
        destroyPixi,
        drawGrid,
        handleKeyDown,
        handleKeyUp,
        resetZoom
    }
}
