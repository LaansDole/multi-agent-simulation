# Spatial Canvas Composables

Modular composables extracted from `SpatialCanvas.vue` to keep the codebase maintainable and contributor-friendly. The orchestrator (`SpatialCanvas.vue`) wires most of these together; `ObstacleEditor.vue` uses `useBrushTool` and shares `useContagionEngine` state. Each composable owns a single concern.

## Architecture

```
SpatialCanvas.vue (orchestrator)
├── useObstacleManager        — Obstacle CRUD, collision, placement ghost
├── useFloorManager           — Floor tile rendering, contamination overlays
├── useContagionEngine        — Contagion simulation (infection, recovery, floor contamination)
├── useInfectionHeatmap       — Radial heatmap and residual spots around infected agents
├── useIdleWander             — Ambient movement along graph edges
├── useCommunicationAnimation — Meeting points, animation queue, agent status
├── useAnimationLoop          — Per-frame render loop, trails, connections, emotes
├── useAgentRenderer          — Sprite creation, drag-and-drop, status glow
└── usePixiApp                — PixiJS lifecycle, zoom, grid, panning, keyboard

ObstacleEditor.vue
└── useBrushTool              — Drag-to-paint / drag-to-erase strokes with cell deduplication
```

### Dependency Flow

Composables are initialized **in order** inside `SpatialCanvas.vue` (the order of the tree above), after the shared state from `useSpatialConfig` and `useSpatialLayout`. Later composables may receive functions returned by earlier ones.

The canvas composables (all but `useContagionEngine` and `useBrushTool`) receive a shared **`ctx`** (reactive canvas context) containing:

| Key | Type | Description |
|-----|------|-------------|
| `app` | `Application \| null` | PixiJS application instance |
| `agentContainer` | `Container \| null` | Parent container for agent sprites |
| `obstacleContainer` | `Container \| null` | Parent container for obstacles |
| `agentSprites` | `Map` | `nodeId → { container, sprite, label, glow, emoteText, interactive }` |
| `obstacleSprites` | `Map` | `obstacleId → { container, graphics, highlight, shape, data }` |
| `animatingAgents` | `Map` | `nodeId → animation state` |
| `pathfinder` | `object \| null` | A* pathfinder instance from `pathfinding.js` |
| `gridGraphics` | `Graphics \| null` | Background grid graphics |
| `trailGraphics` | `Graphics \| null` | Movement trail particles |
| `connectionGraphics` | `Graphics \| null` | Communication connection lines |
| `placementGhostGraphics` | `Graphics \| null` | Obstacle placement preview |
| `floorContainer` | `Container \| null` | Parent container for floor tiles |
| `contaminationContainer` | `Container \| null` | Parent container for floor contamination overlays |
| `spatialConfig` | `object` | Reactive spatial config from `useSpatialConfig` |

---

## Composable Reference

### `usePixiApp`

PixiJS application lifecycle, zoom, background grid, panning, resize, and keyboard handlers.

| Export | Description |
|--------|-------------|
| `initPixi()` | Initialize PixiJS app, layers, event listeners, resize observer |
| `destroyPixi()` | Tear down app, clear all layers and state |
| `drawGrid()` | Redraw infinite background grid for current viewport |
| `handleKeyDown(e)` | Space = pan mode, Delete/Backspace = delete obstacle |
| `handleKeyUp(e)` | Release pan mode |
| `resetZoom()` | Reset zoom to 1.0 and center stage |

### `useAgentRenderer`

Scene building, interactive sprites, static markers, drag-and-drop, and status glow.

| Export | Description |
|--------|-------------|
| `buildScene()` | Clear and rebuild all agent sprites from props |
| `drawStatusGlow(glow, status)` | Draw colored glow ring based on agent status |

### `useAnimationLoop`

Per-frame render loop driving all visual updates.

| Export | Description |
|--------|-------------|
| `renderLoop()` | Called every frame: updates status glows, animations, trails, connections, emotes |

### `useCommunicationAnimation`

Agent-to-agent communication animations with meeting point calculation and queue processing.

| Export | Description |
|--------|-------------|
| `triggerCommunication(sourceId, targetId)` | Enqueue and start communication animation |
| `updateAgentStatus(agentId, status)` | Set agent status, cancel wander if non-idle |
| `calculateMeetingPoints(sx, sy, tx, ty)` | Compute midline-clamped meeting coordinates |
| `cleanup()` | Clear queue timer |

### `useIdleWander`

Ambient idle movement along graph edges.

| Export | Description |
|--------|-------------|
| `buildEdgeAdjacency(edges)` | Build bidirectional adjacency map from edge list |
| `initIdleWanderTimers()` | Start wander timers for all interactive agents |
| `resetWanderCooldown(agentId)` | Reset an agent's wander cooldown |
| `updateIdleWanders()` | Per-frame check: start wander animations for eligible idle agents |
| `cleanup()` | Clear all timers and internal maps |

### `useObstacleManager`

Obstacle rendering, selection, deletion, drag, placement ghost preview, and collision detection.

| Export | Description |
|--------|-------------|
| `selectedObstacleId` | `Ref<string \| null>` — currently selected obstacle |
| `selectedObstacle` | `Computed` — selected obstacle data |
| `obstacleTooltipStyle` | `Computed` — CSS style for obstacle tooltip |
| `showDeleteConfirm` | `Ref<boolean>` — delete confirmation dialog flag |
| `drawObstacles()` | Render all obstacles from spatial config |
| `selectObstacle(id)` | Select an obstacle by ID |
| `deselectObstacle()` | Clear obstacle selection |
| `confirmDeleteObstacle()` | Show delete confirm for large obstacles, instant-delete small ones |
| `executeDeleteObstacle()` | Delete the selected obstacle |
| `updatePlacementGhost(x, y, editorRef)` | Update placement preview at world coordinates |
| `checkAgentCollision(x, y)` | Check if position collides with an agent |
| `cleanup()` | Clear all obstacle sprites |

### `useFloorManager`

Floor tile rendering and per-cell contamination overlays.

| Export | Description |
|--------|-------------|
| `drawFloors()` | Render floor tiles from the spatial config |
| `updateContaminationOverlays(getCellContaminationFn, cellContaminationMap)` | Redraw contaminated floor cells |
| `cleanup()` | Clear floor and overlay graphics |

### `useContagionEngine`

Module-level contagion simulation state shared by `SpatialCanvas.vue` and `ObstacleEditor.vue`: infection spread, recovery, mortality, and floor contamination decay. Also exports `CONTAMINATION_COLORS`, `CELL_GRID_SIZE`, `findFloorTileAtPosition`, and `_cellKey`.

| Export | Description |
|--------|-------------|
| `initSimulation()` / `resetSimulation()` | Set up or clear the simulation state |
| `play()` / `pause()` / `stepSimulation()` | Run, pause, or advance one tick |
| `updateContagion(deltaMs)` | Per-tick infection, recovery, and decay rules |
| `seedInfection(agentId)` / `cureAgent(agentId)` | Sandbox actions on one agent |
| `toggleSandboxMode()` / `setSandboxInteractionMode(mode)` | Sandbox controls |
| `getCellContamination(cellKey)` / `setCellContamination(cellKey, level)` | Floor contamination per grid cell |
| `stats`, `getParams()`, `isAgentDeceased(agentId)` | Read-side helpers |

### `useInfectionHeatmap`

Per-frame radial heatmap around infected agents, plus fading residual spots where infected agents snapped back home.

| Export | Description |
|--------|-------------|
| `updateInfectionHeatmap()` | Redraw heatmaps for the current frame |
| `recordResidual(x, y)` | Leave a fading residual spot |
| `cleanup()` | Clear heatmap graphics |

### `useBrushTool`

Brush and eraser strokes for `ObstacleEditor.vue`, deduplicated per grid cell.

| Export | Description |
|--------|-------------|
| `toolMode`, `setToolMode(mode)`, `isToolActive()` | Current tool |
| `startStroke(x, y)` / `continueStroke(x, y)` / `endStroke()` | Stroke lifecycle |
| `snapToGrid(value)` | Snap a coordinate to the grid |

---

## Adding a New Composable

1. **Create the file** as `use<Name>.js` in this directory
2. **Export a single function** `export function use<Name>({ ctx, ...deps }) { ... }` that accepts `ctx` and any needed dependencies
3. **Return an API object** with only the functions/refs the orchestrator needs
4. **Wire it** in `SpatialCanvas.vue` in the correct initialization order
5. **Write tests** in `frontend/src/__tests__/<name>.test.js`

### Conventions

- **Parameters**: all dependencies passed as a single destructured options object
- **Naming**: `use<PascalCase>` for the composable, `camelCase` for exports
- **Cleanup**: if the composable allocates timers, listeners, or PixiJS objects, export a `cleanup()` function and call it from `destroyPixi()`
- **PixiJS mocking**: for tests, use `vi.mock('pixi.js', () => ({ ... }))` with inline class definitions (see `useObstacleManager.test.js` for the pattern)

---

## Testing

Run all spatial canvas tests:

```bash
cd frontend
npm run test          # single run
npm run test:watch    # watch mode
```

Test files live in `frontend/src/__tests__/`:

| Test File | Covers |
|-----------|--------|
| `pathfinding.test.js` | Grid generation, A* pathfinding, obstacle avoidance |
| `computeObstacleEdgePosition.test.js`, `isPointInObstacle.test.js` | Obstacle geometry helpers |
| `useAgentRenderer.test.js` | Scene building, status glow |
| `useAnimationLoop.test.js` | Per-frame render loop |
| `useBrushTool.test.js` | Stroke lifecycle, cell deduplication |
| `useCommunicationAnimation.test.js` | Meeting points, animation queue |
| `useContagionEngine.test.js` | Contagion rules, sandbox actions |
| `useFloorManager.test.js` | Floor rendering, contamination overlays |
| `useIdleWander.test.js` | Edge adjacency, timer init, wander eligibility |
| `useInfectionHeatmap.test.js` | Heatmap and residual rendering |
| `useObstacleManager.test.js` | `parseHexColor`, composable init/cleanup, delete flow |
| `useSingleFlight.test.js` | `useSingleFlight` (`frontend/src/composables/useSingleFlight.js`) |
