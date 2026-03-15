/**
 * @fileoverview Floor tile management composable for the spatial canvas.
 * Handles floor tile rendering.
 */
import { Assets, TilingSprite, Graphics } from 'pixi.js'
import { parseHexColor } from './useObstacleManager.js'

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 */
export function useFloorManager({ ctx }) {
    const floorSprites = new Map()

    /** Contamination overlay colors by level */
    const CONTAMINATION_OVERLAY = {
        1: { color: 0xeab308, alpha: 0.25 }, // mild – yellow
        2: { color: 0xf97316, alpha: 0.35 }, // moderate – orange
        3: { color: 0xef4444, alpha: 0.45 }  // severe – red
    }

    async function drawFloors() {
        if (!ctx.floorContainer || !ctx.app?.renderer) return

        ctx.floorContainer.removeChildren()
        floorSprites.clear()

        const config = ctx.spatialConfig
        const floors = config?.floors || []
        if (!floors.length) return

        const floorPromises = floors.map(async (floor) => {
            const { id, position, width, height, sprite: spriteFile, color, contaminationLevel } = floor
            if (!position || !width || !height) return

            const floorGroup = new Graphics()
            floorGroup.x = position.x
            floorGroup.y = position.y

            let sprite = null

            if (spriteFile) {
                try {
                    const spritePath = spriteFile.startsWith('data:')
                        ? spriteFile
                        : `/sprites/tiles/${spriteFile}`
                    const texture = await Assets.load(spritePath)

                    if (texture) {
                        sprite = new TilingSprite({ texture, width, height })
                        floorGroup.addChild(sprite)
                    }
                } catch (error) {
                    console.warn(`Failed to load sprite for floor ${id}:`, error)
                    sprite = null
                }
            }

            if (!sprite && color) {
                const colorInt = parseHexColor(color)
                floorGroup.rect(0, 0, width, height)
                floorGroup.fill({ color: colorInt, alpha: 0.6 })
            }

            // Contamination overlay
            if (contaminationLevel && contaminationLevel > 0) {
                const overlay = CONTAMINATION_OVERLAY[Math.min(3, contaminationLevel)]
                if (overlay) {
                    const contamGraphics = new Graphics()
                    contamGraphics.rect(0, 0, width, height)
                    contamGraphics.fill({ color: overlay.color, alpha: overlay.alpha })
                    contamGraphics.label = 'contamination-overlay'
                    floorGroup.addChild(contamGraphics)
                }
            }

            ctx.floorContainer.addChild(floorGroup)
            floorSprites.set(id, floorGroup)
        })

        await Promise.all(floorPromises)
    }

    /**
     * Update contamination overlays without full redraw.
     * Iterates floor sprites and adds/updates/removes contamination overlays.
     */
    function updateContaminationOverlays() {
        const config = ctx.spatialConfig
        const floors = config?.floors || []

        floors.forEach(floor => {
            const group = floorSprites.get(floor.id)
            if (!group) return

            // Find existing contamination overlay
            const existingOverlay = group.children.find(c => c.label === 'contamination-overlay')
            const level = floor.contaminationLevel || 0

            if (level <= 0) {
                if (existingOverlay) group.removeChild(existingOverlay)
                return
            }

            const overlay = CONTAMINATION_OVERLAY[Math.min(3, level)]
            if (!overlay) return

            if (existingOverlay) {
                // Update existing overlay
                existingOverlay.clear()
                existingOverlay.rect(0, 0, floor.width, floor.height)
                existingOverlay.fill({ color: overlay.color, alpha: overlay.alpha })
            } else {
                // Create new overlay
                const contamGraphics = new Graphics()
                contamGraphics.rect(0, 0, floor.width, floor.height)
                contamGraphics.fill({ color: overlay.color, alpha: overlay.alpha })
                contamGraphics.label = 'contamination-overlay'
                group.addChild(contamGraphics)
            }
        })
    }

    function cleanup() {
        floorSprites.clear()
    }

    return {
        drawFloors,
        updateContaminationOverlays,
        cleanup
    }
}
