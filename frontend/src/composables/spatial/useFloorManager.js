/**
 * @fileoverview Floor tile management composable for the spatial canvas.
 * Handles floor tile rendering.
 */
import { Assets, Sprite, Graphics } from 'pixi.js'
import { parseHexColor } from './useObstacleManager.js'

/**
 * @param {object} options
 * @param {object} options.ctx - Shared canvas context
 */
export function useFloorManager({ ctx }) {
    const floorSprites = new Map()

    async function drawFloors() {
        if (!ctx.floorContainer || !ctx.app?.renderer) return

        ctx.floorContainer.removeChildren()
        floorSprites.clear()

        const config = ctx.spatialConfig
        const floors = config?.floors || []
        if (!floors.length) return

        const floorPromises = floors.map(async (floor) => {
            const { id, position, width, height, sprite: spriteFile, color } = floor
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
                        sprite = new Sprite(texture)
                        sprite.width = width
                        sprite.height = height
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

            ctx.floorContainer.addChild(floorGroup)
            floorSprites.set(id, floorGroup)
        })

        await Promise.all(floorPromises)
    }

    function cleanup() {
        floorSprites.clear()
    }

    return {
        drawFloors,
        cleanup
    }
}
