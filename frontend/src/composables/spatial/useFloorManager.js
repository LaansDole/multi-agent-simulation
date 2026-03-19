/**
 * @fileoverview Floor tile management composable for the spatial canvas.
 * Handles floor tile rendering.
 */
import { Assets, TilingSprite, Graphics } from 'pixi.js'
import { parseHexColor } from './useObstacleManager.js'
import { CELL_GRID_SIZE, _cellKey, findFloorTileAtPosition } from './useContagionEngine.js'

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

            // Note: contamination overlay is rendered per-cell in updateContaminationOverlays()
            // No per-tile contamination overlay at draw time

            ctx.floorContainer.addChild(floorGroup)
            floorSprites.set(id, floorGroup)
        })

        await Promise.all(floorPromises)
    }

    /**
     * Update contamination overlays using per-cell data from the contagion engine.
     * Renders 40×40 cell overlays within each floor tile, plus orphan cells on plain canvas.
     */
    function updateContaminationOverlays(getCellContaminationFn, cellContaminationMap) {
        const config = ctx.spatialConfig
        const floors = config?.floors || []

        floors.forEach(floor => {
            const group = floorSprites.get(floor.id)
            if (!group) return
            const fp = floor.position || { x: 0, y: 0 }

            // Remove existing contamination overlays
            const existingOverlays = group.children.filter(c => c.label === 'contamination-overlay')
            existingOverlays.forEach(o => group.removeChild(o))

            // If no getCellContamination function, fall back to per-tile level
            if (!getCellContaminationFn) {
                const level = floor.contaminationLevel || 0
                if (level > 0) {
                    const overlayStyle = CONTAMINATION_OVERLAY[Math.min(3, level)]
                    if (overlayStyle) {
                        const contamGraphics = new Graphics()
                        contamGraphics.rect(0, 0, floor.width, floor.height)
                        contamGraphics.fill({ color: overlayStyle.color, alpha: overlayStyle.alpha })
                        contamGraphics.label = 'contamination-overlay'
                        group.addChild(contamGraphics)
                    }
                }
                return
            }

            // Render per-cell contamination overlays
            const contamGraphics = new Graphics()
            contamGraphics.label = 'contamination-overlay'
            let hasContamination = false

            for (let cx = fp.x; cx < fp.x + floor.width; cx += CELL_GRID_SIZE) {
                for (let cy = fp.y; cy < fp.y + floor.height; cy += CELL_GRID_SIZE) {
                    const key = _cellKey(cx, cy)
                    const cellLevel = getCellContaminationFn(key)
                    if (cellLevel > 0) {
                        const overlayStyle = CONTAMINATION_OVERLAY[Math.min(3, cellLevel)]
                        if (overlayStyle) {
                            // Draw relative to the floor group's position
                            contamGraphics.rect(
                                cx - fp.x, cy - fp.y,
                                CELL_GRID_SIZE, CELL_GRID_SIZE
                            )
                            contamGraphics.fill({ color: overlayStyle.color, alpha: overlayStyle.alpha })
                            hasContamination = true
                        }
                    }
                }
            }

            if (hasContamination) {
                group.addChild(contamGraphics)
            }
        })

        // ── Orphan-cell rendering: contaminated cells outside any floor tile ──
        if (ctx.contaminationContainer && cellContaminationMap && getCellContaminationFn) {
            ctx.contaminationContainer.removeChildren()

            if (cellContaminationMap.size > 0) {
                const orphanGraphics = new Graphics()
                orphanGraphics.label = 'orphan-contamination'
                let hasOrphans = false

                cellContaminationMap.forEach((level, key) => {
                    if (level <= 0) return
                    // Parse cell coordinates from key
                    const [cxStr, cyStr] = key.split(',')
                    const cx = Number(cxStr)
                    const cy = Number(cyStr)

                    // Skip cells that fall within a floor tile
                    if (findFloorTileAtPosition({ x: cx, y: cy }, floors)) return

                    const overlayStyle = CONTAMINATION_OVERLAY[Math.min(3, level)]
                    if (overlayStyle) {
                        orphanGraphics.rect(cx, cy, CELL_GRID_SIZE, CELL_GRID_SIZE)
                        orphanGraphics.fill({ color: overlayStyle.color, alpha: overlayStyle.alpha })
                        hasOrphans = true
                    }
                })

                if (hasOrphans) {
                    ctx.contaminationContainer.addChild(orphanGraphics)
                }
            }
        }
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
