#!/usr/bin/env node

import { createCanvas, loadImage } from 'canvas'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = 150

const CONFIGS_DIR = path.join(__dirname, '../public/spatial_configs')
const THUMBNAILS_DIR = path.join(CONFIGS_DIR, 'thumbnails')
const SPRITES_DIR = path.join(__dirname, '../public/sprites')

async function loadSprite(spritePath) {
  try {
    const fullPath = path.join(SPRITES_DIR, spritePath)
    if (fs.existsSync(fullPath)) {
      return await loadImage(fullPath)
    }
  } catch (error) {
    console.warn(`Warning: Could not load sprite ${spritePath}: ${error.message}`)
  }
  return null
}

async function generateThumbnail(configPath, outputPath) {
  console.log(`Generating thumbnail for ${path.basename(configPath)}...`)
  
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const { canvas: canvasConfig, floors = [], obstacles = [], grid = {} } = configData
  
  const canvas = createCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  const ctx = canvas.getContext('2d')
  
  const layoutWidth = canvasConfig.width
  const layoutHeight = canvasConfig.height
  
  const scaleX = THUMBNAIL_WIDTH / layoutWidth
  const scaleY = THUMBNAIL_HEIGHT / layoutHeight
  const scale = Math.min(scaleX, scaleY)
  
  const offsetX = (THUMBNAIL_WIDTH - layoutWidth * scale) / 2
  const offsetY = (THUMBNAIL_HEIGHT - layoutHeight * scale) / 2
  
  ctx.fillStyle = canvasConfig.backgroundColor || '#1a1a2e'
  ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  
  if (floors.length > 0) {
    for (const floor of floors) {
      const x = offsetX + floor.position.x * scale
      const y = offsetY + floor.position.y * scale
      const width = floor.width * scale
      const height = floor.height * scale
      
      const sprite = await loadSprite(`tiles/${floor.sprite}`)
      if (sprite) {
        const pattern = ctx.createPattern(sprite, 'repeat')
        ctx.save()
        ctx.translate(x, y)
        ctx.fillStyle = pattern
        ctx.scale(scale * 0.5, scale * 0.5)
        ctx.fillRect(0, 0, floor.width * 2, floor.height * 2)
        ctx.restore()
      } else {
        ctx.fillStyle = floor.color || '#4a7c23'
        ctx.fillRect(x, y, width, height)
      }
    }
  }
  
  if (grid && grid.enabled) {
    ctx.strokeStyle = grid.color || '#333344'
    ctx.globalAlpha = (grid.opacity || 0.3) * 0.3
    ctx.lineWidth = 0.5
    
    const cellSize = (grid.cellSize || 40) * scale
    const startX = offsetX % cellSize
    const startY = offsetY % cellSize
    
    for (let x = startX; x < THUMBNAIL_WIDTH; x += cellSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, THUMBNAIL_HEIGHT)
      ctx.stroke()
    }
    
    for (let y = startY; y < THUMBNAIL_HEIGHT; y += cellSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(THUMBNAIL_WIDTH, y)
      ctx.stroke()
    }
    
    ctx.globalAlpha = 1
  }
  
  for (const obstacle of obstacles) {
    const x = offsetX + obstacle.position.x * scale
    const y = offsetY + obstacle.position.y * scale
    const width = obstacle.size.width * scale
    const height = obstacle.size.height * scale
    
    const sprite = obstacle.sprite ? await loadSprite(`obstacles/${obstacle.sprite}`) : null
    
    if (sprite && width > 5 && height > 5) {
      ctx.drawImage(sprite, x, y, width, height)
    } else {
      ctx.fillStyle = obstacle.color || '#64748b'
      ctx.fillRect(x, y, width, height)
    }
  }
  
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(outputPath, buffer)
  
  console.log(`  Saved: ${outputPath}`)
}

async function updateConfigWithThumbnail(configPath, thumbnailFilename) {
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  
  if (!configData.metadata) {
    configData.metadata = {}
  }
  
  configData.metadata.thumbnail = `thumbnails/${thumbnailFilename}`
  
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n')
  console.log(`  Updated metadata in ${path.basename(configPath)}`)
}

async function main() {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true })
    console.log(`Created thumbnails directory: ${THUMBNAILS_DIR}`)
  }
  
  const files = fs.readdirSync(CONFIGS_DIR)
  const configFiles = files.filter(file => file.endsWith('.json'))
  
  console.log(`\nFound ${configFiles.length} layout configurations\n`)
  
  for (const configFile of configFiles) {
    const configPath = path.join(CONFIGS_DIR, configFile)
    const thumbnailFilename = configFile.replace('.json', '.png')
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename)
    
    try {
      await generateThumbnail(configPath, thumbnailPath)
      await updateConfigWithThumbnail(configPath, thumbnailFilename)
    } catch (error) {
      console.error(`Error processing ${configFile}:`, error.message)
    }
  }
  
  console.log('\nThumbnail generation complete!')
}

main().catch(console.error)
