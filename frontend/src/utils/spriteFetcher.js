/**
 * SpriteFetcher manages sprite image selection.
 * Characters are assigned deterministically based on node ID hash to ensure
 * each agent always gets the same unique sprite, even across HMR reloads.
 */
export class SpriteFetcher {
  constructor() {
    // Available character list (1-12)
    this.availableCharacters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    // Map of characters already bound to node_id
    this.nodeCharacterMap = new Map()
    // Track which characters are assigned to guarantee uniqueness
    this.assignedCharacters = new Set()
  }

  /**
   * Simple string hash for deterministic character selection.
   * @param {string} str
   * @returns {number}
   */
  _hashString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + ch
      hash |= 0 // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Get a sprite image path with deterministic, unique character assignment.
   * @param {string} node_id - Node ID used to bind a character.
   * @param {string} stance - Stance ('D', 'L', 'R', 'U').
   * @param {number} frame - Frame number (1, 2, 3).
   * @returns {string} Image path.
   */
  fetchSprite(node_id = null, stance = 'D', frame = 1) {
    let character

    if (node_id) {
      // Use the bound character if this node already has one.
      if (this.nodeCharacterMap.has(node_id)) {
        character = this.nodeCharacterMap.get(node_id)
      } else {
        // Deterministic pick based on node_id hash
        const hash = this._hashString(node_id)
        const totalChars = this.availableCharacters.length

        // Try the hash-preferred character first, then walk forward to find
        // an unassigned one (guaranteed if < 12 nodes)
        let preferred = hash % totalChars
        character = this.availableCharacters[preferred]

        if (this.assignedCharacters.has(character)) {
          // Walk through all characters to find an unassigned one
          let found = false
          for (let i = 1; i < totalChars; i++) {
            const candidate = this.availableCharacters[(preferred + i) % totalChars]
            if (!this.assignedCharacters.has(candidate)) {
              character = candidate
              found = true
              break
            }
          }
          // If all 12 are taken, use the hash pick (duplicate, but > 12 agents)
          if (!found) {
            character = this.availableCharacters[preferred]
          }
        }

        // Bind the character to the node
        this.nodeCharacterMap.set(node_id, character)
        this.assignedCharacters.add(character)
      }
    } else {
      // If no node_id is specified, select based on a fallback
      character = this.availableCharacters[0]
    }

    // Build the sprite path.
    const spritePath = `/sprites/${character}-${stance}-${frame}.png`

    return spritePath
  }

  /**
   * Get current usage status.
   * @returns {Object} Usage status summary.
   */
  getStatus() {
    return {
      totalCharacters: this.availableCharacters.length,
      assignedNodes: this.nodeCharacterMap.size,
      unassignedCount: this.availableCharacters.length - this.assignedCharacters.size,
      nodeCharacterMap: Object.fromEntries(this.nodeCharacterMap),
      assignedCharacters: [...this.assignedCharacters].sort((a, b) => a - b)
    }
  }

  /**
   * Reset usage state and clear used sprite records.
   */
  reset() {
    this.nodeCharacterMap.clear()
    this.assignedCharacters.clear()
    console.log('Sprite usage state reset')
  }
}

// Create a singleton instance.
export const spriteFetcher = new SpriteFetcher()
