/**
 * Simple hash function for strings
 */
function getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash | 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Curated list of pastel, 3-stop gradients based on user feedback
// Style: High lightness, medium saturation, smooth transitions
const PREDEFINED_PALETTES = [
    // 0. Blue -> Aqua -> Spring Green (User Ref: Agent)
    { gradient: 'linear-gradient(135deg, #a0c4ff, #99eaf9, #baf9b1)', shadow: 'rgba(153, 234, 249, 0.5)' },

    // 1. Mint -> Teal -> Sky (User Ref: Model)
    { gradient: 'linear-gradient(135deg, #c7f9cc, #8ef6e4, #7bdff2)', shadow: 'rgba(123, 223, 242, 0.5)' },

    // 2. Coral -> Apricot -> Butter (User Ref: Human)
    { gradient: 'linear-gradient(135deg, #ff9b9b, #ffb876, #ffe59d)', shadow: 'rgba(255, 184, 118, 0.5)' },

    // 3. Lemon -> Meadow -> Sky (User Ref: Subgraph)
    { gradient: 'linear-gradient(135deg, #fdf2a0, #baf9b1, #99eaf9)', shadow: 'rgba(186, 249, 177, 0.5)' },

    // 4. Periwinkle -> Lavender -> Rose (User Ref: Python)
    { gradient: 'linear-gradient(135deg, #b4c5ff, #c9a7eb, #ffb4ed)', shadow: 'rgba(201, 167, 235, 0.5)' },

    // 5. Blossom -> Rose -> Peach
    { gradient: 'linear-gradient(135deg, #ffc6ff, #ff9ec7, #ffd6a5)', shadow: 'rgba(255, 158, 199, 0.5)' },

    // 6. Lavender -> Denim -> Sky
    { gradient: 'linear-gradient(135deg, #e0c3fc, #a6c1ee, #8ec5fc)', shadow: 'rgba(166, 193, 238, 0.5)' },

    // 7. Mint -> Sky -> Jade
    { gradient: 'linear-gradient(135deg, #d3f9d8, #a9def9, #9ee6a6)', shadow: 'rgba(169, 222, 249, 0.5)' },

    // 8. Lemon -> Pear -> Seafoam
    { gradient: 'linear-gradient(135deg, #fef3a5, #c8f7c5, #8be0ce)', shadow: 'rgba(200, 247, 197, 0.5)' },

    // 9. Peach -> Raspberry -> Honey
    { gradient: 'linear-gradient(135deg, #ffd8be, #ff9aa2, #ffc87c)', shadow: 'rgba(255, 154, 162, 0.5)' },

    // 10. Mist -> Lilac -> Blush
    { gradient: 'linear-gradient(135deg, #e8e9f3, #cddafd, #f6d6ff)', shadow: 'rgba(205, 218, 253, 0.5)' },

    // 11. Aqua -> Indigo -> Orchid
    { gradient: 'linear-gradient(135deg, #9efcff, #a9b8ff, #e3b4ff)', shadow: 'rgba(169, 184, 255, 0.5)' },

    // 12. Gold -> Orange -> Rose
    { gradient: 'linear-gradient(135deg, #fde68a, #fdba74, #fda4af)', shadow: 'rgba(253, 186, 116, 0.5)' },

    // 13. Emerald -> Teal -> Cerulean
    { gradient: 'linear-gradient(135deg,rgb(134, 247, 207),rgb(87, 224, 219),rgb(119, 175, 224))', shadow: 'rgba(76, 212, 208, 0.5)' },

    // 14. Warm Gray -> Sand -> Lilac
    { gradient: 'linear-gradient(135deg, #e6e0d4, #f7e7ce, #d4c5f5)', shadow: 'rgba(214, 197, 245, 0.5)' }
];

// Cache for consistent mapping within a session to avoid collisions
const assignedColors = new Map();
const usedIndices = new Set();

/**
 * Generate stable dynamic styles for a node based on its type string.
 * This ensures new node types automatically get distinct, pleasant colors
 * by mapping them to a curated list of harmonious palettes.
 * 
 * @param {string} nodeType - The type of the node (e.g., 'agent', 'python', 'custom')
 * @returns {Object} CSS variable overrides for the node
 */
export function getNodeStyles(nodeType) {
    if (!nodeType) return {};

    // Return cached assignment if exists
    if (assignedColors.has(nodeType)) {
        const cachedIndex = assignedColors.get(nodeType);
        const cachedPalette = PREDEFINED_PALETTES[cachedIndex];
        return {
            '--node-gradient': cachedPalette.gradient,
            '--node-shadow-color': cachedPalette.shadow
        };
    }

    const hash = getHash(nodeType);
    const len = PREDEFINED_PALETTES.length;
    let index = hash % len + 1;

    // Open addressing: Linear probing to find the next available color slot
    // This helps avoid visual collisions for different node types in the same session
    for (let i = 0; i < len; i++) {
        const candidateIndex = (index + i) % len;
        if (!usedIndices.has(candidateIndex)) {
            index = candidateIndex;
            break;
        }
    }

    assignedColors.set(nodeType, index);
    usedIndices.add(index);

    const palette = PREDEFINED_PALETTES[index];
    return {
        '--node-gradient': palette.gradient,
        '--node-shadow-color': palette.shadow
    };
}

// ───────── FLOOR BRIGHTNESS UTILITIES ─────────

/**
 * Default canvas background color (dark theme).
 */
const DEFAULT_CANVAS_BG = '#1a1a2e'

/**
 * Parse a hex color string (3, 4, 6, or 8 digit) into { r, g, b } with values 0-255.
 * Returns null if the string is not a valid hex color.
 *
 * @param {string} hex - Hex color string, e.g. '#e8e8e8', '#fff', 'aabbcc'
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function parseHexColor(hex) {
    if (!hex || typeof hex !== 'string') return null
    let h = hex.replace(/^#/, '')
    // Expand shorthand (3 or 4 digits)
    if (h.length === 3 || h.length === 4) {
        h = h.split('').map(c => c + c).join('')
    }
    if (h.length !== 6 && h.length !== 8) return null
    const num = parseInt(h.substring(0, 6), 16)
    if (isNaN(num)) return null
    return {
        r: (num >> 16) & 0xff,
        g: (num >> 8) & 0xff,
        b: num & 0xff
    }
}

/**
 * Compute the perceived brightness of a floor color composited over the
 * canvas background at alpha 0.6.
 *
 * The compositing formula per channel is:
 *   effective = floor_channel * 0.6 + bg_channel * 0.4
 *
 * Perceived brightness uses the NTSC/PAL luma formula:
 *   Y = 0.299 * R + 0.587 * G + 0.114 * B   (values normalized to 0-1)
 *
 * @param {number} x - World x coordinate
 * @param {number} y - World y coordinate
 * @param {object|null} spatialConfig - Spatial config object with optional `floors` array
 * @param {string} [canvasBgColor] - Canvas background hex color (default '#1a1a2e')
 * @returns {number} Perceived brightness 0.0 - 1.0.  Returns 0.0 when no floor covers the point.
 */
export function getFloorBrightnessAt(x, y, spatialConfig, canvasBgColor) {
    const floors = spatialConfig?.floors
    if (!floors || !floors.length) return 0.0

    // Find the floor tile containing (x, y)
    let matchedFloor = null
    for (const floor of floors) {
        const fp = floor.position
        if (
            x >= fp.x && x < fp.x + floor.width &&
            y >= fp.y && y < fp.y + floor.height
        ) {
            matchedFloor = floor
            break
        }
    }

    if (!matchedFloor || !matchedFloor.color) return 0.0

    const floorRgb = parseHexColor(matchedFloor.color)
    if (!floorRgb) return 0.0

    const bgRgb = parseHexColor(canvasBgColor || DEFAULT_CANVAS_BG) || { r: 26, g: 26, b: 46 }

    // Composite floor color at alpha 0.6 over background
    const er = (floorRgb.r * 0.6 + bgRgb.r * 0.4) / 255
    const eg = (floorRgb.g * 0.6 + bgRgb.g * 0.4) / 255
    const eb = (floorRgb.b * 0.6 + bgRgb.b * 0.4) / 255

    // NTSC/PAL luma
    return 0.299 * er + 0.587 * eg + 0.114 * eb
}
