/**
 * @fileoverview Infection proximity heatmap composable for the spatial canvas.
 * Renders per-frame radial heatmap overlays around INFECTED agents to
 * visualise the infection radius zone and help predict next infections.
 */

// ───────── HEATMAP BANDS ─────────

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

// ───────── COMPOSABLE ─────────

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context (must have ctx.heatmapGraphics)
 * @param {import('vue').Ref<Map>} options.agentPositions - Agent positions ref
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
    /**
     * Called every frame from the render loop.
     * Clears and redraws heatmap circles around all INFECTED agents.
     */
    function updateInfectionHeatmap() {
        if (!ctx.heatmapGraphics) return

        ctx.heatmapGraphics.clear()

        // Only render when sandbox is active and simulation is running
        if (!sandboxMode?.value || !simulationRunning?.value) return

        const params = getParams()
        const radius = params.infectionRadius

        agentPositions.value.forEach((pos, agentId) => {
            if (!isAgentNode(agentId)) return
            const condition = getAgentCondition(agentId)
            if (condition !== 'infected') return

            // Draw bands from outermost to innermost
            for (const band of HEATMAP_BANDS) {
                const r = radius * band.radiusRatio
                ctx.heatmapGraphics.circle(pos.x, pos.y, r)
                ctx.heatmapGraphics.fill({ color: band.color, alpha: band.alpha })
            }
        })
    }

    function cleanup() {
        if (ctx.heatmapGraphics) {
            ctx.heatmapGraphics.clear()
        }
    }

    return {
        updateInfectionHeatmap,
        cleanup
    }
}
