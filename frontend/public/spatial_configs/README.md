# Spatial Configuration Files

This directory contains spatial configuration files that define the layout and environment for multi-agent simulations.

## Configuration Format

Spatial configurations are JSON files with the following structure:

### Root Object

```json
{
  "canvas": { ... },
  "grid": { ... },
  "obstacles": [ ... ],
  "spawnZones": [ ... ]
}
```

### Canvas Configuration

Defines the dimensions and appearance of the simulation canvas.

```json
{
  "canvas": {
    "width": 1000,           // Canvas width in pixels
    "height": 700,           // Canvas height in pixels
    "backgroundColor": "#0f172a"  // Background color (hex)
  }
}
```

### Grid Configuration

Defines the grid overlay for the canvas.

```json
{
  "grid": {
    "enabled": true,         // Show/hide grid
    "cellSize": 40,          // Grid cell size in pixels
    "color": "#1e293b",      // Grid line color (hex)
    "opacity": 0.5           // Grid opacity (0-1)
  }
}
```

### Obstacles

Array of obstacles in the environment. Each obstacle has:

```json
{
  "id": "desk-1",                    // Unique identifier
  "type": "furniture",               // Type: "wall", "furniture", "decoration"
  "shape": "rectangle",              // Shape: "rectangle" or "circle"
  "position": { "x": 100, "y": 200 }, // Position coordinates
  "size": {                          // Size dimensions
    "width": 100,                    // For rectangles: width
    "height": 60                     // For rectangles: height
    // OR for circles:
    // "radius": 25                  // For circles: radius
  },
  "color": "#8b5cf6",                // Color (hex)
  "collision": true,                 // Whether agents collide with this
  "sprite": "desk.png"               // Optional: sprite filename from /sprites/obstacles/
}
```

#### Obstacle Types

- **wall**: Structural walls and barriers (typically gray/blue)
- **furniture**: Desks, chairs, beds, equipment (varied colors)
- **decoration**: Decorative elements like plants, art (no collision)

#### Obstacle Shapes

- **rectangle**: Rectangular obstacles (walls, desks, boards)
  - Required size properties: `width`, `height`
- **circle**: Circular obstacles (plants, chairs, equipment)
  - Required size property: `radius`

#### Sprites

Obstacles can optionally use PNG sprites instead of solid colors:

- Sprites are loaded from `/sprites/obstacles/` directory
- Available sprites: `hospital_bed.png`, `desk.png`, `chair.png`, `computer.png`, `wall.png`
- If sprite loading fails, falls back to solid color rendering
- Sprites are automatically scaled to fit obstacle dimensions

### Spawn Zones

Array of spawn zones where agents can appear in the simulation.

```json
{
  "id": "patient-spawn",             // Unique identifier
  "name": "Patient Entry",           // Display name
  "position": { "x": 620, "y": 420 }, // Top-left position
  "size": {                          // Zone dimensions
    "width": 100,
    "height": 100
  },
  "color": "#22c55e"                 // Optional: zone color (hex)
}
```

## Sample Configurations

### demo_hospital.json

Hospital layout with:
- Patient beds along the left wall
- Triage desk and waiting area (top center)
- Administrative desk (top right)
- Medical equipment stations
- Status board (center)
- Two spawn zones: Patient Entry and Staff Area

Matches workflow: `yaml_instance/demo_hospital.yaml`
- Agents: PatientDataGenerator, AdmissionReport, TriageReport, StatusReport, DischargeDataGenerator, HospitalMetrics, DailySummary

### ChatDev_v1.json

Software development office layout with:
- CEO desk (top left)
- CPO desk (mid left)
- Programmer workstations (top right, multiple desks)
- Code Reviewer desk (mid right)
- Tester desk (mid right)
- Meeting area with table (bottom center)
- Whiteboard (bottom right)
- Two spawn zones: Development Team and Management

Matches workflow: `yaml_instance/ChatDev_v1.yaml`
- Agents: CEO, CPO, Programmers, Code Reviewer, Software Test Engineer

### demo_dynamic.json

Travel agency layout with:
- Reception desk (top center)
- Multiple travel planner workstations (left side, 6 desks)
- Aggregator desk (center right)
- Meeting table (right side)
- Display board (bottom right)
- Two spawn zones: Travel Planners and Aggregation Hub

Matches workflow: `yaml_instance/demo_dynamic.yaml`
- Agents: Travel planners for food, fun, accommodation, transportation, and academic experiences
- Dynamic map/tree execution for parallel planning

## Creating Custom Configurations

1. Copy an existing configuration as a template
2. Modify canvas dimensions and grid settings
3. Add/remove obstacles as needed
4. Define spawn zones for your agents
5. Save with a descriptive name matching your workflow

### Best Practices

- **Consistent naming**: Use descriptive IDs like "desk-1", "chair-2", "wall-top"
- **Color coding**: Use consistent colors for similar obstacle types
- **Collision zones**: Set `collision: true` for furniture, `false` for decorations
- **Sprite usage**: Use sprites for common furniture; fall back to colors for unique items
- **Spawn zones**: Create logical spawn points for different agent types
- **Testing**: Load in browser to verify layout before using in simulations

## File Naming Convention

Configuration files should be named to match their corresponding workflow:

- Workflow: `yaml_instance/demo_hospital.yaml` → Config: `spatial_configs/demo_hospital.json`
- Workflow: `yaml_instance/ChatDev_v1.yaml` → Config: `spatial_configs/ChatDev_v1.json`
- Workflow: `yaml_instance/demo_dynamic.yaml` → Config: `spatial_configs/demo_dynamic.json`

This allows the system to automatically load the appropriate spatial configuration when a workflow is selected.

## Technical Details

### Coordinate System

- Origin (0, 0) is at the top-left corner
- X increases to the right
- Y increases downward
- Positions represent top-left corner for rectangles, center for circles

### Collision Detection

Agents will avoid obstacles with `collision: true`. Use this for:
- Walls and barriers
- Furniture (desks, beds, equipment)
- Other physical objects

Set `collision: false` for:
- Decorative elements (plants, art)
- Visual markers
- Non-physical objects

### Performance Considerations

- Keep obstacle count reasonable (< 50 for smooth performance)
- Use sprites sparingly (they require texture loading)
- Larger canvases require more rendering resources
- Grid opacity affects rendering performance

## Integration with Workflows

Spatial configurations are loaded by the frontend based on the selected workflow:

1. User selects a workflow (e.g., `demo_hospital.yaml`)
2. Frontend loads corresponding config (`spatial_configs/demo_hospital.json`)
3. Canvas renders the layout with obstacles and spawn zones
4. Agents appear in spawn zones during simulation
5. Agents navigate around collision-enabled obstacles

See `frontend/src/composables/useSpatialConfig.js` for implementation details.
