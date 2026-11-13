/**
 * @fileoverview Infection proximity heatmap composable for the spatial canvas.
 * Renders per-frame radial heatmap overlays around INFECTED agents to
 * visualise the infection radius zone and help predict next infections.
 * Also renders fading residual spots at positions where infected agents
 * snapped back to home after completing an animation.
 */

// ───────── CONSTANTS ─────────

/**
 * Concentric ring definitions for the heatmap gradient.
 * Each band is drawn as a filled circle (largest first) to create
 * an additive-blending appearance.
 */
const HEATMAP_BANDS = [
    { radiusRatio: 1.0, color: 0xeab308, alpha: 0.06 },  // outer – yellow
    { radiusRatio: 0.66, color: 0xf97316, alpha: 0.10 },  // middle – orange
    { radiusRatio: 0.33, color: 0xef4444, alpha: 0.15 }   // inner – red
]

/** How long residual heatmap spots last (ms) before fully fading out */
const RESIDUAL_DECAY_MS = 3000

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context (must have ctx.heatmapGraphics, ctx.agentSprites)
 * @param {import('vue').Ref<Map>} options.agentPositions - Agent positions ref (used as fallback)
 * @param {Function} options.getAgentCondition - Get agent condition string
 * @param {Function} options.getParams - Get contagion engine parameters (infectionRadius)
 * @param {import('vue').Ref<boolean>} options.sandboxMode - Whether sandbox mode is active
 * @param {import('vue').Ref<boolean>} options.simulationRunning - Whether simulation is running
 * @param {Function} options.isAgentNode - Check if a node ID is an agent
 */
export function useInfectionHeatmap({
    ctx,
    agentPositions,
    getAgentCondition,
    getParams,
    sandboxMode,
    simulationRunning,
    isAgentNode
}) {
    /** @type {Array<{x: number, y: number, createdAt: number}>} */
    const residualSpots = []

    /**
     * Called every frame from the render loop (AFTER updateAnimations).
     * Clears and redraws heatmap circles around all INFECTED agents
     * using their actual visual position (container.x/y), plus fading
     * residual spots at previous snap-back positions.
     */
    function updateInfectionHeatmap() {
        if (!ctx.heatmapGraphics) return

        ctx.heatmapGraphics.clear()

        // Only render when sandbox is active and simulation is running
        if (!sandboxMode?.value || !simulationRunning?.value) return

        const params = getParams()
        const radius = params.heatmapRadius ?? params.infectionRadius
        const now = Date.now()

        // ── Active infected agents ──
        // Use container.x/y (actual visual position) so the heatmap
        // follows agents during ALL animation types (wander + communication)
        ctx.agentSprites.forEach((ag, agentId) => {
            if (!ag.interactive) return
            if (!isAgentNode(agentId)) return
            const condition = getAgentCondition(agentId)
            if (condition !== 'infected') return

            const x = ag.container.x
            const y = ag.container.y

            for (const band of HEATMAP_BANDS) {
                const r = radius * band.radiusRatio
                ctx.heatmapGraphics.circle(x, y, r)
                ctx.heatmapGraphics.fill({ color: band.color, alpha: band.alpha })
            }
        })

        // ── Residual spots (decaying) ──
        let i = 0
        while (i < residualSpots.length) {
            const spot = residualSpots[i]
            const age = now - spot.createdAt
            if (age >= RESIDUAL_DECAY_MS) {
                residualSpots.splice(i, 1)
                continue
            }
            const decay = 1.0 - age / RESIDUAL_DECAY_MS
            for (const band of HEATMAP_BANDS) {
                const r = radius * band.radiusRatio
                ctx.heatmapGraphics.circle(spot.x, spot.y, r)
                ctx.heatmapGraphics.fill({ color: band.color, alpha: band.alpha * decay })
            }
            i++
        }
    }

    /**
     * Record a residual heatmap spot at the given position.
     * Called by the animation loop when an infected agent completes
     * an animation and snaps back to its home position.
     * @param {number} x
     * @param {number} y
     */
    function recordResidual(x, y) {
        residualSpots.push({ x, y, createdAt: Date.now() })
    }

    function cleanup() {
        if (ctx.heatmapGraphics) {
            ctx.heatmapGraphics.clear()
        }
        residualSpots.length = 0
    }

    return {
        updateInfectionHeatmap,
        recordResidual,
        cleanup
    }
}
