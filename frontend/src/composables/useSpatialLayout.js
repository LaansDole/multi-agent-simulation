import { reactive, ref, toRefs } from 'vue'

const SPATIAL_POSITIONS_PREFIX = 'devall_spatial_'
const SPATIAL_SPEED_KEY = 'devall_spatial_speed'

// ───────── AGENT STATUS CONSTANTS (workflow) ─────────

export const AGENT_STATUS = {
    IDLE: 'idle',
    THINKING: 'thinking',
    COMMUNICATING: 'communicating',
    ERROR: 'error'
}

export const STATUS_COLORS = {
    [AGENT_STATUS.IDLE]: 0x6b7280,
    [AGENT_STATUS.THINKING]: 0x3b82f6,
    [AGENT_STATUS.COMMUNICATING]: 0x22c55e,
    [AGENT_STATUS.ERROR]: 0xef4444
}

export const STATUS_PULSE = {
    [AGENT_STATUS.IDLE]: 0,
    [AGENT_STATUS.THINKING]: 2.5,
    [AGENT_STATUS.COMMUNICATING]: 1.5,
    [AGENT_STATUS.ERROR]: 3.0
}

// ───────── AGENT CONDITION CONSTANTS (contagion) ─────────

export const AGENT_CONDITION = {
    HEALTHY: 'healthy',
    INFECTED: 'infected',
    RECOVERED: 'recovered',
    DECEASED: 'deceased'
}

export const CONDITION_COLORS = {
    [AGENT_CONDITION.HEALTHY]: 0x22c55e,
    [AGENT_CONDITION.INFECTED]: 0xef4444,
    [AGENT_CONDITION.RECOVERED]: 0x3b82f6,
    [AGENT_CONDITION.DECEASED]: 0x6b7280
}

export const CONDITION_PULSE = {
    [AGENT_CONDITION.HEALTHY]: 0,
    [AGENT_CONDITION.INFECTED]: 3.0,
    [AGENT_CONDITION.RECOVERED]: 0.5,
    [AGENT_CONDITION.DECEASED]: 0
}

// ───────── SPEED PRESETS ─────────

export const MOVEMENT_SPEEDS = {
    SLOW: { id: 'slow', name: 'Slow', value: 0.008 },
    NORMAL: { id: 'normal', name: 'Normal', value: 0.02 },
    FAST: { id: 'fast', name: 'Fast', value: 0.04 }
}

export const SPEED_LIST = [MOVEMENT_SPEEDS.SLOW, MOVEMENT_SPEEDS.NORMAL, MOVEMENT_SPEEDS.FAST]

// ───────── NODE TYPE CLASSIFICATION ─────────

export const INTERACTIVE_NODE_TYPES = ['agent', 'human']

export function isInteractiveNode(node) {
    return INTERACTIVE_NODE_TYPES.includes(node?.type)
}

// ───────── COMMUNICATION CONSTANTS ─────────

export const COMMUNICATION_ANIMATION_DISTANCE = 0.85
export const MIN_MEETING_GAP = 30    // minimum px gap between meeting points
export const MIN_AGENT_SEPARATION = 40 // per-frame separation threshold
const ANIMATION_QUEUE_MAX = 10
const ANIMATION_STAGGER_MS = 500

// ───────── EMOTE SYSTEM ─────────

export const EMOTE_RULES = [
    { keywords: ['disagree', 'incorrect', 'wrong', 'no,', 'i don\'t think', 'not quite', 'actually'], emoji: '🤔', badge: 'Hmm...' },
    { keywords: ['agree', 'great point', 'exactly', 'yes', 'correct', 'right', 'good', 'well said', 'makes sense'], emoji: '👍', badge: 'Good point!' },
    { keywords: ['interesting', 'idea', 'suggest', 'perhaps', 'consider', 'what if', 'could', 'maybe', 'approach'], emoji: '💡', badge: 'Interesting...' },
    { keywords: ['wait', 'hold on', 'however', 'although', 'on the other hand', 'not sure'], emoji: '❓', badge: 'Wait...' },
    { keywords: ['urgent', 'critical', 'important', 'warning', 'alert', 'caution', 'error', 'fail'], emoji: '❗', badge: 'Alert!' },
    { keywords: ['excellent', 'perfect', 'amazing', 'great', 'fantastic', 'wonderful', 'brilliant', 'outstanding'], emoji: '🔥', badge: 'Excellent!' },
    { keywords: ['thank', 'thanks', 'appreciate', 'helpful', 'assist'], emoji: '🙏', badge: 'Thanks!' },
    { keywords: ['sorry', 'apologi', 'mistake', 'unfortunately', 'regret'], emoji: '😔', badge: 'Sorry...' },
    { keywords: ['recommend', 'should', 'must', 'need to', 'require', 'advise'], emoji: '📋', badge: 'Noted' },
    { keywords: ['complet', 'done', 'finish', 'success', 'ready', 'result'], emoji: '✅', badge: 'Done!' },
    // Contagion simulation emotes
    { keywords: ['infected', 'infection', 'contagion', 'sick', 'ill', 'fever'], emoji: '🤒', badge: 'Infected!' },
    { keywords: ['recovered', 'recovery', 'immune', 'healed', 'cured'], emoji: '💪', badge: 'Recovered!' },
    { keywords: ['deceased', 'dead', 'fatal', 'died'], emoji: '💀', badge: 'Deceased' },
    { keywords: ['quarantine', 'isolat', 'lockdown', 'contain'], emoji: '🔒', badge: 'Quarantined' }
]

const EMOTE_DISMISS_EMOJI_MS = 3000
const EMOTE_DISMISS_BADGE_MS = 4000

/**
 * Match first emote rule against the first 200 chars of text.
 * Returns { emoji, badge } or null.
 */
export function matchEmote(text) {
    if (!text) return null
    const sample = text.slice(0, 200).toLowerCase()
    for (const rule of EMOTE_RULES) {
        for (const kw of rule.keywords) {
            if (sample.includes(kw)) {
                return { emoji: rule.emoji, badge: rule.badge }
            }
        }
    }
    // Fallback: always show a default emote so agents feel talkative
    return FALLBACK_EMOTE
}

// ───────── TRAIL PARTICLE HELPER ─────────

// Fallback emote when no keyword matches (keeps agents "talkative")
export const FALLBACK_EMOTE = { emoji: '💬', badge: 'Processing...' }
const MAX_TRAIL_PARTICLES = 20

export function createTrailParticle(x, y, color) {
    return {
        x,
        y,
        color,
        opacity: 0.6,
        size: 4,
        createdAt: Date.now()
    }
}

// ───────── FORCE-DIRECTED LAYOUT ─────────

/**
 * @typedef {object} Obstacle
 * @property {string} id
 * @property {string} shape - 'rectangle' | 'circle'
 * @property {{x: number, y: number}} position
 * @property {{width?: number, height?: number, radius?: number}} size
 */

/**
 * Check if a point is inside an obstacle.
 * @param {{x: number, y: number}} point
 * @param {Obstacle} obstacle
 * @returns {boolean}
 */
function isPointInObstacle(point, obstacle) {
    const { shape, position, size } = obstacle
    if (shape === 'rectangle') {
        const hw = (size.width || 0) / 2
        const hh = (size.height || 0) / 2
        return (
            point.x >= position.x - hw &&
            point.x <= position.x + hw &&
            point.y >= position.y - hh &&
            point.y <= position.y + hh
        )
    } else if (shape === 'circle') {
        const radius = size.radius || 0
        const dx = point.x - position.x
        const dy = point.y - position.y
        return (dx * dx + dy * dy) <= (radius * radius)
    }
    return false
}

/**
 * Check if a position is valid (not inside any obstacle with collision=true).
 * @param {{x: number, y: number}} pos
 * @param {Obstacle[]} obstacles
 * @returns {boolean}
 */
function isPositionValid(pos, obstacles) {
    return !obstacles.some(obs => obs.collision && isPointInObstacle(pos, obs))
}

/**
 * Find a valid position near the target that is not inside any obstacle.
 * @param {{x: number, y: number}} targetPos
 * @param {Obstacle[]} obstacles
 * @param {number} width
 * @param {number} height
 * @returns {{x: number, y: number}}
 */
function findValidPositionNear(targetPos, obstacles, width, height) {
    const searchRadius = 150
    const step = 20

    if (isPositionValid(targetPos, obstacles)) {
        return targetPos
    }

    // Spiral search outward from target
    for (let r = step; r <= searchRadius; r += step) {
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) {
            const newX = targetPos.x + r * Math.cos(angle)
            const newY = targetPos.y + r * Math.sin(angle)
            const pos = {
                x: Math.max(60, Math.min(width - 60, newX)),
                y: Math.max(60, Math.min(height - 60, newY))
            }
            if (isPositionValid(pos, obstacles)) {
                return pos
            }
        }
    }

    // Fallback: return target (user can drag out if needed)
    return targetPos
}

function forceDirectedLayout(nodes, edges, width, height, iterations = 100, obstacles = []) {
    if (!nodes.length) return new Map()

    const positions = new Map()
    const center = { x: width / 2, y: height / 2 }

    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length
        const radius = Math.min(width, height) * 0.3
        positions.set(node.id, {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
        })
    })

    // Build interactivity lookup
    const interactiveSet = new Set(
        nodes.filter(n => isInteractiveNode(n)).map(n => n.id)
    )

    const neighbors = new Map()
    nodes.forEach(n => neighbors.set(n.id, new Set()))
    edges.forEach(e => {
        neighbors.get(e.from)?.add(e.to)
        neighbors.get(e.to)?.add(e.from)
    })

    const repulsionStrength = 8000
    const attractionStrength = 0.005
    const damping = 0.9
    // Collision-aware min distances: agent-agent = 100px, static = 60px
    const minDistanceAgentAgent = 100
    const minDistanceStatic = 60
    const velocities = new Map()
    nodes.forEach(n => velocities.set(n.id, { x: 0, y: 0 }))

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = positions.get(nodes[i].id)
                const b = positions.get(nodes[j].id)
                const dx = a.x - b.x
                const dy = a.y - b.y
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                const force = repulsionStrength / (dist * dist)
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                velocities.get(nodes[i].id).x += fx
                velocities.get(nodes[i].id).y += fy
                velocities.get(nodes[j].id).x -= fx
                velocities.get(nodes[j].id).y -= fy
            }
        }

        edges.forEach(e => {
            const a = positions.get(e.from)
            const b = positions.get(e.to)
            if (!a || !b) return
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            // Use appropriate minimum distance based on node types
            const bothInteractive = interactiveSet.has(e.from) && interactiveSet.has(e.to)
            const minDist = bothInteractive ? minDistanceAgentAgent : minDistanceStatic
            if (dist < minDist) return
            const force = (dist - minDist) * attractionStrength
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            velocities.get(e.from).x += fx
            velocities.get(e.from).y += fy
            velocities.get(e.to).x -= fx
            velocities.get(e.to).y -= fy
        })

        // Obstacle repulsion force
        const obstacleRepulsionStrength = 5000
        obstacles.forEach(obs => {
            if (!obs.collision) return
            nodes.forEach(n => {
                const pos = positions.get(n.id)
                const vel = velocities.get(n.id)
                let dx, dy
                if (obs.shape === 'rectangle') {
                    const hw = (obs.size.width || 0) / 2
                    const hh = (obs.size.height || 0) / 2
                    const closestX = Math.max(obs.position.x - hw, Math.min(pos.x, obs.position.x + hw))
                    const closestY = Math.max(obs.position.y - hh, Math.min(pos.y, obs.position.y + hh))
                    dx = pos.x - closestX
                    dy = pos.y - closestY
                } else if (obs.shape === 'circle') {
                    dx = pos.x - obs.position.x
                    dy = pos.y - obs.position.y
                } else {
                    return
                }
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                // Stronger repulsion when close to obstacle
                const minDist = obs.shape === 'circle' ? obs.size.radius || 30 : 30
                if (dist < minDist * 2) {
                    const force = obstacleRepulsionStrength / (dist * dist)
                    const fx = (dx / dist) * force
                    const fy = (dy / dist) * force
                    vel.x += fx
                    vel.y += fy
                }
            })
        })

        nodes.forEach(n => {
            const pos = positions.get(n.id)
            const vel = velocities.get(n.id)
            vel.x += (center.x - pos.x) * 0.001
            vel.y += (center.y - pos.y) * 0.001
        })

        nodes.forEach(n => {
            const pos = positions.get(n.id)
            const vel = velocities.get(n.id)
            pos.x += vel.x
            pos.y += vel.y
            vel.x *= damping
            vel.y *= damping
            const pad = 60
            pos.x = Math.max(pad, Math.min(width - pad, pos.x))
            pos.y = Math.max(pad, Math.min(height - pad, pos.y))
        })
    }

    // Final pass: ensure all positions are valid (not inside obstacles)
    let invalidCount = 0
    positions.forEach((pos, nodeId) => {
        if (!isPositionValid(pos, obstacles)) {
            const newPos = findValidPositionNear(pos, obstacles, width, height)
            positions.set(nodeId, newPos)
            if (!isPositionValid(newPos, obstacles)) {
                invalidCount++
            }
        }
    })

    if (invalidCount > 0) {
        console.warn(
            `[forceDirectedLayout] Failed to find obstacle-free positions for ${invalidCount} node(s). ` +
            `Users can drag agents to desired positions.`
        )
    }

    return positions
}

// ───────── SINGLETON STATE ─────────
// Module-level state so all consumers share the same instance.

/** Reactive counter incremented on every setAgentStatus() call. */
const statusVersion = ref(0)

/** Reactive counter incremented on every setAgentCondition() call.
 *  External computeds (e.g. useContagionEngine.stats) read this to
 *  guarantee re-evaluation when any agent condition changes. */
const conditionVersion = ref(0)

const state = reactive({
    /** @type {Map<string, {x: number, y: number}>} */
    agentPositions: new Map(),
    /** @type {Array<{source: string, target: string, startTime: number, duration: number}>} */
    activeConnections: [],
    /** @type {Map<string, string>} agentId -> AGENT_STATUS (workflow) */
    agentStatuses: new Map(),
    /** @type {Map<string, string>} agentId -> AGENT_CONDITION (contagion) */
    agentConditions: new Map(),
    /** @type {Map<string, string>} agentId -> last output message */
    agentMessages: new Map(),
    /** @type {Array<{x: number, y: number, color: number, opacity: number, size: number, createdAt: number}>} */
    trailParticles: [],
    currentWorkflow: '',
    canvasWidth: 800,
    canvasHeight: 600,
    /** @type {string} */
    currentSpeed: loadSavedSpeed(),
    /** @type {Array<{sourceId: string, targetId: string}>} */
    animationQueue: [],
    /** @type {boolean} */
    isProcessingQueue: false,
    /** @type {Map<string, {emoji: string, badge: string, startTime: number, timerId: number}>} */
    agentEmotes: new Map(),
    /** @type {Map<string, Array<{text: string, timestamp: number}>>} */
    agentOutputHistory: new Map(),
    /** @type {Map<string, string>} nodeId -> node type string */
    nodeTypes: new Map()
})

// ───────── COMPOSABLE ─────────

export function useSpatialLayout() {

    function computeLayout(nodes, edges, width, height, obstacles = []) {
        state.canvasWidth = width || 800
        state.canvasHeight = height || 600
        const positions = forceDirectedLayout(
            nodes,
            edges,
            state.canvasWidth,
            state.canvasHeight,
            100,
            obstacles
        )
        state.agentPositions = positions
        // Store node types for contagion engine filtering
        state.nodeTypes.clear()
        nodes.forEach(n => state.nodeTypes.set(n.id, n.type))
        return positions
    }

    function setAgentPosition(agentId, x, y) {
        state.agentPositions.set(agentId, { x, y })
        savePositions()
    }

    // ── Status management ──

    function setAgentStatus(agentId, status) {
        state.agentStatuses.set(agentId, status)
        statusVersion.value++
    }

    function getAgentStatus(agentId) {
        return state.agentStatuses.get(agentId) || AGENT_STATUS.IDLE
    }

    // ── Condition management (contagion layer) ──

    function setAgentCondition(agentId, condition) {
        state.agentConditions.set(agentId, condition)
        conditionVersion.value++
    }

    function getAgentCondition(agentId) {
        return state.agentConditions.get(agentId) || AGENT_CONDITION.HEALTHY
    }

    // ── Message management + emotes ──

    function setAgentMessage(agentId, message) {
        state.agentMessages.set(agentId, message)

        // Accumulate output history
        if (message) {
            const history = state.agentOutputHistory.get(agentId) || []
            history.push({ text: message, timestamp: Date.now() })
            // Keep last 50 entries
            if (history.length > 50) history.shift()
            state.agentOutputHistory.set(agentId, history)
        }

        // Trigger emote matching
        const emote = matchEmote(message)
        if (emote) {
            setAgentEmote(agentId, emote.emoji, emote.badge)
        }
    }

    function getAgentMessage(agentId) {
        return state.agentMessages.get(agentId) || ''
    }

    function getAgentOutputHistory(agentId) {
        return state.agentOutputHistory.get(agentId) || []
    }

    // ── Emote management ──

    function setAgentEmote(agentId, emoji, badge) {
        // Clear existing emote timers
        const existing = state.agentEmotes.get(agentId)
        if (existing?.timerId) {
            clearTimeout(existing.timerId)
        }

        const startTime = Date.now()
        const timerId = setTimeout(() => {
            state.agentEmotes.delete(agentId)
        }, Math.max(EMOTE_DISMISS_EMOJI_MS, EMOTE_DISMISS_BADGE_MS))

        state.agentEmotes.set(agentId, {
            emoji,
            badge,
            startTime,
            timerId
        })
    }

    function getAgentEmote(agentId) {
        const emote = state.agentEmotes.get(agentId)
        if (!emote) return null

        const elapsed = Date.now() - emote.startTime
        return {
            emoji: elapsed < EMOTE_DISMISS_EMOJI_MS ? emote.emoji : null,
            badge: elapsed < EMOTE_DISMISS_BADGE_MS ? emote.badge : null
        }
    }

    // ── Speed management ──

    function setSpeed(speedId) {
        state.currentSpeed = speedId
        try {
            localStorage.setItem(SPATIAL_SPEED_KEY, speedId)
        } catch (e) {
            console.warn('Failed to save speed setting:', e)
        }
    }

    function getSpeedValue() {
        const preset = SPEED_LIST.find(s => s.id === state.currentSpeed)
        return preset ? preset.value : MOVEMENT_SPEEDS.NORMAL.value
    }

    // ── Trail particles ──

    function addTrailParticle(x, y, color) {
        if (state.trailParticles.length > MAX_TRAIL_PARTICLES * 2) {
            // Aggressive cleanup if too many
            cleanupTrailParticles()
        }
        state.trailParticles.push(createTrailParticle(x, y, color))
    }

    function cleanupTrailParticles() {
        const now = Date.now()
        state.trailParticles = state.trailParticles.filter(
            p => now - p.createdAt < 600
        )
    }

    // ── Position persistence ──

    function savePositions() {
        if (!state.currentWorkflow) return
        try {
            const obj = {}
            state.agentPositions.forEach((pos, id) => {
                obj[id] = pos
            })
            localStorage.setItem(
                SPATIAL_POSITIONS_PREFIX + state.currentWorkflow,
                JSON.stringify(obj)
            )
        } catch (e) {
            console.warn('Failed to save spatial positions:', e)
        }
    }

    function loadPositions(workflowFile) {
        state.currentWorkflow = workflowFile
        if (!workflowFile) return false
        try {
            const stored = localStorage.getItem(SPATIAL_POSITIONS_PREFIX + workflowFile)
            if (!stored) return false
            const obj = JSON.parse(stored)
            const positions = new Map()
            Object.entries(obj).forEach(([id, pos]) => {
                positions.set(id, { x: pos.x, y: pos.y })
            })
            if (positions.size > 0) {
                state.agentPositions = positions
                return true
            }
        } catch (e) {
            console.warn('Failed to load spatial positions:', e)
        }
        return false
    }

    function resetPositions(nodes, edges) {
        if (state.currentWorkflow) {
            try {
                localStorage.removeItem(SPATIAL_POSITIONS_PREFIX + state.currentWorkflow)
            } catch (e) {
                console.warn('Failed to clear spatial positions:', e)
            }
        }
        return computeLayout(nodes, edges, state.canvasWidth, state.canvasHeight)
    }

    // ── Connection management ──

    function addConnection(source, target, duration = 2000) {
        state.activeConnections.push({
            source,
            target,
            startTime: Date.now(),
            duration
        })
    }

    function cleanupConnections() {
        const now = Date.now()
        state.activeConnections = state.activeConnections.filter(
            c => now - c.startTime < c.duration
        )
    }

    // ── Animation queue ──

    /**
     * Push a communication event onto the queue.
     * Returns a function that should be called to trigger the actual animation.
     */
    function enqueueAnimation(sourceId, targetId) {
        if (state.animationQueue.length >= ANIMATION_QUEUE_MAX) {
            state.animationQueue.shift()
        }
        state.animationQueue.push({ sourceId, targetId })
    }

    /**
     * Dequeue the next animation. Returns { sourceId, targetId } or null.
     */
    function dequeueAnimation() {
        if (!state.animationQueue.length) return null
        return state.animationQueue.shift()
    }

    function getStaggerDelay() {
        return ANIMATION_STAGGER_MS
    }

    /**
     * Populate nodeTypes Map from a list of nodes.
     * Must be called whenever nodes are available, even if computeLayout()
     * is skipped (e.g. when positions are loaded from localStorage).
     */
    function setNodeTypes(nodes) {
        state.nodeTypes.clear()
        nodes.forEach(n => state.nodeTypes.set(n.id, n.type))
    }

    /**
     * Check if a node ID corresponds to an agent/human type.
     * Only these node types participate in the contagion simulation.
     */
    function isAgentNode(nodeId) {
        const type = state.nodeTypes.get(nodeId)
        return INTERACTIVE_NODE_TYPES.includes(type)
    }

    return {
        ...toRefs(state),
        statusVersion,
        conditionVersion,
        computeLayout,
        setAgentPosition,
        savePositions,
        loadPositions,
        resetPositions,
        addConnection,
        cleanupConnections,
        setAgentStatus,
        getAgentStatus,
        setAgentCondition,
        getAgentCondition,
        setAgentMessage,
        getAgentMessage,
        getAgentOutputHistory,
        setAgentEmote,
        getAgentEmote,
        setSpeed,
        getSpeedValue,
        addTrailParticle,
        cleanupTrailParticles,
        enqueueAnimation,
        dequeueAnimation,
        getStaggerDelay,
        isAgentNode,
        setNodeTypes
    }
}

// ── Helper ──

function loadSavedSpeed() {
    try {
        const saved = localStorage.getItem(SPATIAL_SPEED_KEY)
        if (saved && SPEED_LIST.some(s => s.id === saved)) {
            return saved
        }
    } catch {
        // ignore
    }
    return MOVEMENT_SPEEDS.NORMAL.id
}
