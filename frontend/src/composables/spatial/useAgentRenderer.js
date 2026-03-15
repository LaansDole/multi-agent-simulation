/**
 * @fileoverview Agent renderer composable for the spatial canvas.
 * Handles scene building, interactive sprite creation, static markers,
 * drag-and-drop setup, and status glow rendering.
 */
import { Container, Graphics, Sprite, Text, TextStyle, Assets } from 'pixi.js'
import { markRaw } from 'vue'
import { spriteFetcher } from '../../utils/spriteFetcher.js'

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 * @param {object} options.props - Component props
 * @param {Function} options.emit - Component emit
 * @param {import('vue').Ref} options.agentPositions - Agent positions ref

 * @param {Function} options.loadPositions - Load saved positions
 * @param {Function} options.computeLayout - Compute force-directed layout
 * @param {Function} options.setAgentPosition - Set agent position
 * @param {Function} options.getAgentStatus - Get agent status
 * @param {Function} options.isInteractiveNode - Check if node is interactive
 * @param {Function} options.buildEdgeAdjacency - Build edge adjacency map
 * @param {Function} options.initIdleWanderTimers - Initialize wander timers
 * @param {Function} options.normalizeWorkflowName - Normalize workflow name
 * @param {object} options.spatialConfig - Spatial config composable
 * @param {Function} options.seedInfection - Seed infection on agent
 * @param {Function} options.cureAgent - Cure an infected agent
 * @param {object} options.STATUS_COLORS - Status color map
 * @param {object} options.AGENT_STATUS - Agent status enum
 */
export function useAgentRenderer({
    ctx,
    props,
    emit,
    agentPositions,

    loadPositions,
    computeLayout,
    setAgentPosition,
    getAgentStatus,
    isInteractiveNode,
    buildEdgeAdjacency,
    initIdleWanderTimers,
    normalizeWorkflowName,
    spatialConfig,
    STATUS_COLORS,
    AGENT_STATUS,
    sandboxMode,
    sandboxInteractionMode,
    seedInfection,
    cureAgent,
    setNodeTypes
}) {

    // ───────── SCENE BUILDING ─────────

    function buildScene() {
        if (!ctx.app || !ctx.agentContainer) return

        ctx.agentContainer.removeChildren()
        ctx.agentSprites.clear()

        const nodes = props.nodes || []
        const edges = props.edges || []
        if (!nodes.length) return

        const width = ctx.app.renderer?.width || 800
        const height = ctx.app.renderer?.height || 600

        const loaded = loadPositions(normalizeWorkflowName(props.workflowFile))
        if (!loaded) {
            const obstacles = spatialConfig.value?.obstacles || []
            computeLayout(nodes, edges, width, height, obstacles)
        } else {
            // computeLayout() populates nodeTypes, but when positions are loaded
            // from localStorage it is skipped. Populate nodeTypes explicitly so
            // isAgentNode() (used by the contagion engine stats) works correctly.
            setNodeTypes(nodes)
        }

        nodes.forEach(node => {
            const interactive = isInteractiveNode(node)
            if (interactive) {
                createInteractiveSprite(node)
            } else {
                createStaticMarker(node)
            }
        })

        // Build adjacency map for idle wandering
        buildEdgeAdjacency(edges)
        initIdleWanderTimers()
    }

    /**
     * Create a full interactive agent sprite (agent/human nodes).
     */
    async function createInteractiveSprite(node) {
        if (!ctx.agentContainer) return

        const pos = agentPositions.value.get(node.id) || { x: 400, y: 300 }

        const agentGroup = new Container()
        agentGroup.x = pos.x
        agentGroup.y = pos.y
        agentGroup.eventMode = 'static'
        agentGroup.cursor = 'pointer'

        // Status glow
        const glow = new Graphics()
        const status = getAgentStatus(node.id)
        drawStatusGlow(glow, status)
        agentGroup.addChild(glow)

        // Load sprite
        const spritePath = spriteFetcher.fetchSprite(node.id, 'D', 1)
        let texture
        try {
            texture = await Assets.load(spritePath)
        } catch {
            texture = null
        }

        let sprite
        if (texture) {
            sprite = new Sprite(texture)
            sprite.anchor.set(0.5, 0.5)
            sprite.width = 40
            sprite.height = 48
        } else {
            sprite = new Graphics()
            sprite.circle(0, 0, 20)
            sprite.fill(0x6366f1)
        }
        agentGroup.addChild(sprite)

        // Name label
        const label = new Text({
            text: node.id,
            style: new TextStyle({
                fontSize: 11,
                fontFamily: 'Inter, system-ui, sans-serif',
                fill: 0xffffff,
                align: 'center',
                fontWeight: '500'
            })
        })
        label.anchor.set(0.5, 0)
        label.y = 28
        agentGroup.addChild(label)

        // Emoji emote text (PixiJS, hidden by default)
        const emoteText = new Text({
            text: '',
            style: new TextStyle({
                fontSize: 24,
                fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif',
                fill: 0xffffff,
                align: 'center'
            })
        })
        emoteText.anchor.set(0.5, 1)
        emoteText.y = -42
        emoteText.visible = false
        agentGroup.addChild(emoteText)

        // Badge text (PixiJS, adjacent to emoji, hidden by default)
        const badgeText = new Text({
            text: '',
            style: new TextStyle({
                fontSize: 10,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: '500',
                fill: 0xe0e7ff,
                align: 'left'
            })
        })
        badgeText.anchor.set(0.5, 1)
        badgeText.y = -44
        badgeText.visible = false
        agentGroup.addChild(badgeText)

        // Drag-and-drop
        setupDrag(agentGroup, node.id)

        // Click to open agent info panel or seed/cure infection in sandbox mode
        agentGroup.on('pointerdown', () => {
            if (sandboxMode?.value) {
                const mode = sandboxInteractionMode?.value || 'pointer'
                if (mode === 'infect' && seedInfection) {
                    seedInfection(node.id)
                } else if (mode === 'cure' && cureAgent) {
                    cureAgent(node.id)
                } else {
                    // pointer mode — open agent panel
                    emit('agent-selected', { nodeId: node.id, node })
                }
            } else {
                emit('agent-selected', { nodeId: node.id, node })
            }
        })

        ctx.agentContainer.addChild(agentGroup)

        ctx.agentSprites.set(node.id, markRaw({
            container: agentGroup,
            sprite,
            label,
            glow,
            emoteText,
            badgeText,
            interactive: true
        }))
    }

    /**
     * Create a small static marker for non-agent nodes.
     */
    function createStaticMarker(node) {
        if (!ctx.agentContainer) return

        const pos = agentPositions.value.get(node.id) || { x: 400, y: 300 }

        const markerGroup = new Container()
        markerGroup.x = pos.x
        markerGroup.y = pos.y
        markerGroup.eventMode = 'static'
        markerGroup.cursor = 'move'

        // Small diamond shape
        const shape = new Graphics()
        shape.moveTo(0, -8)
        shape.lineTo(8, 0)
        shape.lineTo(0, 8)
        shape.lineTo(-8, 0)
        shape.closePath()
        shape.fill({ color: 0x4b5563, alpha: 0.6 })
        shape.stroke({ width: 1, color: 0x6b7280, alpha: 0.4 })
        markerGroup.addChild(shape)

        // Smaller muted label
        const label = new Text({
            text: node.id,
            style: new TextStyle({
                fontSize: 9,
                fontFamily: 'Inter, system-ui, sans-serif',
                fill: 0x9ca3af,
                align: 'center',
                fontWeight: '400'
            })
        })
        label.anchor.set(0.5, 0)
        label.y = 12
        markerGroup.addChild(label)

        // Draggable
        setupDrag(markerGroup, node.id)

        ctx.agentContainer.addChild(markerGroup)

        ctx.agentSprites.set(node.id, markRaw({
            container: markerGroup,
            sprite: shape,
            label,
            glow: null,
            emoteText: null,
            badgeText: null,
            interactive: false
        }))
    }

    // ───────── DRAG SETUP ─────────

    function setupDrag(container, nodeId) {
        let dragging = false
        let dragOffset = { x: 0, y: 0 }

        container.on('pointerdown', (e) => {
            dragging = true
            container.cursor = 'grabbing'
            const globalPos = e.global
            dragOffset.x = container.x - globalPos.x
            dragOffset.y = container.y - globalPos.y
            container.alpha = 0.85
            ctx.agentContainer.setChildIndex(container, ctx.agentContainer.children.length - 1)
        })

        container.on('globalpointermove', (e) => {
            if (!dragging) return
            const globalPos = e.global
            container.x = globalPos.x + dragOffset.x
            container.y = globalPos.y + dragOffset.y
        })

        const onPointerUp = () => {
            if (!dragging) return
            dragging = false
            const ag = ctx.agentSprites.get(nodeId)
            container.cursor = ag?.interactive ? 'pointer' : 'move'
            container.alpha = 1
            setAgentPosition(nodeId, container.x, container.y)
        }

        container.on('pointerup', onPointerUp)
        container.on('pointerupoutside', onPointerUp)
    }

    // ───────── STATUS GLOW ─────────

    function drawStatusGlow(glow, status) {
        glow.clear()
        const color = STATUS_COLORS[status] || STATUS_COLORS[AGENT_STATUS.IDLE]
        const alpha = status === AGENT_STATUS.IDLE ? 0.15 : 0.35
        glow.circle(0, 0, 28)
        glow.fill({ color, alpha })
    }

    return {
        buildScene,
        drawStatusGlow
    }
}
