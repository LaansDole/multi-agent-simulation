/**
 * @fileoverview Contagion simulation engine composable.
 * Provides per-tick simulation rules for infection spread, recovery, mortality,
 * and floor contamination decay. Reads agent positions from useSpatialLayout
 * and floor data from useSpatialConfig.
 */
import { reactive, toRefs, computed } from 'vue'
import { useSpatialLayout, AGENT_STATUS, AGENT_CONDITION } from '../useSpatialLayout.js'
import { useSpatialConfig } from '../useSpatialConfig.js'
import { configStore } from '../../utils/configStore.js'

// ───────── CONTAMINATION COLORS ─────────

export const CONTAMINATION_COLORS = {
    0: 0x22c55e, // clean  – green
    1: 0xeab308, // mild   – yellow
    2: 0xf97316, // moderate – orange
    3: 0xef4444  // severe – red
}

// ───────── HELPERS ─────────

/**
 * Find the first floor tile whose bounding box contains the given position.
 * @param {{ x: number, y: number }} pos - World position to test
 * @param {Array<{ id: string, position: { x: number, y: number }, width: number, height: number }>} floors - Floor tiles array
 * @returns {object|null} The matching floor tile, or null if none found
 */
export function findFloorTileAtPosition(pos, floors) {
    for (const floor of floors) {
        const fp = floor.position
        if (
            pos.x >= fp.x && pos.x < fp.x + floor.width &&
            pos.y >= fp.y && pos.y < fp.y + floor.height
        ) {
            return floor
        }
    }
    return null
}

// ───────── SINGLETON STATE ─────────

const MAX_LOG_ENTRIES = 200

const state = reactive({
    sandboxMode: false,
    simulationRunning: false,
    simulationPaused: false,
    elapsedTimeMs: 0,

    /** @type {Map<string, { infectedAt: number }>} */
    infectionTimers: new Map(),

    /** @type {Map<string, { recoveredAt: number }>} */
    immunityTimers: new Map(),

    /** @type {Map<string, number>} floorId → last decay timestamp */
    floorDecayTimers: new Map(),

    /** @type {Map<string, number>} floorId → last contamination timestamp (throttle for infected agent deposits) */
    floorContaminationTimers: new Map(),

    /** @type {Map<string, number>} Snapshot of initial floor contamination for reset */
    initialFloorLevels: new Map(),

    // ── Debug logging ──
    debugEnabled: false,
    /** @type {Array<{ ts: number, category: string, message: string }>} */
    contagionLog: [],

    // ── Debug throttle state (not exposed) ──
    _lastHeartbeatMs: 0,
    _lastSkipLogMs: 0,
    _lastSkipReason: ''
})

/**
 * Internal debug logger. Pushes timestamped entries when debug is enabled.
 * Also mirrors to console.debug for DevTools visibility.
 */
function _log(category, message, data = {}) {
    if (!state.debugEnabled) return
    const entry = { ts: Date.now(), category, message, ...data }
    state.contagionLog.push(entry)
    if (state.contagionLog.length > MAX_LOG_ENTRIES) {
        state.contagionLog.splice(0, state.contagionLog.length - MAX_LOG_ENTRIES)
    }
    console.debug(`[Contagion:${category}]`, message, data)
}

// ───────── COMPOSABLE ─────────

export function useContagionEngine() {
    const {
        agentPositions,
        conditionVersion,
        setAgentCondition,
        getAgentCondition,
        setAgentStatus,
        setAgentEmote,
        clearAllEmotes,
        isAgentNode
    } = useSpatialLayout()

    const { getConfig, getFloorTiles, updateFloorTile } = useSpatialConfig()

    // ── Parameter helpers ──

    function getParams() {
        const config = getConfig()
        const sim = config?.simulation || {}
        // Priority: spatialConfig.simulation > configStore (user settings) > inline defaults
        return {
            infectionRadius: sim.infectionRadius ?? configStore.CONTAGION_INFECTION_RADIUS ?? 120,
            infectionProbability: sim.infectionProbability ?? configStore.CONTAGION_INFECTION_PROBABILITY ?? 0.7,
            floorInfectionProbability: sim.floorInfectionProbability ?? configStore.CONTAGION_FLOOR_INFECTION_PROBABILITY ?? 0.15,
            recoveryTimeMs: sim.recoveryTimeMs ?? configStore.CONTAGION_RECOVERY_TIME_MS ?? 60000,
            fatalityProbability: sim.fatalityProbability ?? configStore.CONTAGION_FATALITY_PROBABILITY ?? 0.05,
            mutationProbability: sim.mutationProbability ?? configStore.CONTAGION_MUTATION_PROBABILITY ?? 0.001,
            contaminationDecayMs: sim.contaminationDecayMs ?? configStore.CONTAGION_CONTAMINATION_DECAY_MS ?? 10000,
            immunityDurationMs: sim.immunityDurationMs ?? configStore.CONTAGION_IMMUNITY_DURATION_MS ?? 30000
        }
    }

    // ── Computed stats ──

    const stats = computed(() => {
        // Read conditionVersion to create an explicit reactive dependency.
        // This ensures the computed re-evaluates when any agent condition
        // changes via setAgentCondition(), even though the actual condition
        // values are stored in a separate reactive Map.
        conditionVersion.value
        let healthy = 0, infected = 0, recovered = 0, deceased = 0
        if (!state.sandboxMode) return { healthy, infected, recovered, deceased }

        agentPositions.value.forEach((_, agentId) => {
            if (!isAgentNode(agentId)) return // skip non-agent nodes
            const condition = getAgentCondition(agentId)
            switch (condition) {
                case AGENT_CONDITION.HEALTHY: healthy++; break
                case AGENT_CONDITION.INFECTED: infected++; break
                case AGENT_CONDITION.RECOVERED: recovered++; break
                case AGENT_CONDITION.DECEASED: deceased++; break
                default: healthy++ // treat unknown as healthy
            }
        })
        return { healthy, infected, recovered, deceased }
    })

    // ── Lifecycle ──

    function initSimulation() {
        const now = Date.now()
        state.elapsedTimeMs = 0
        state.simulationRunning = false
        state.simulationPaused = false
        state.infectionTimers.clear()
        state.immunityTimers.clear()
        state.floorDecayTimers.clear()
        state.floorContaminationTimers.clear()
        state.initialFloorLevels.clear()

        // Set all agent/human nodes to HEALTHY condition (skip non-agent nodes)
        let agentCount = 0
        agentPositions.value.forEach((_, agentId) => {
            if (!isAgentNode(agentId)) return
            setAgentCondition(agentId, AGENT_CONDITION.HEALTHY)
            agentCount++
        })

        // Snapshot floor contamination levels for reset
        const floors = getFloorTiles()
        let contaminatedFloors = 0
        floors.forEach(f => {
            if (f.contaminationLevel !== undefined) {
                state.initialFloorLevels.set(f.id, f.contaminationLevel)
            }
            if (f.contaminationLevel > 0) {
                state.floorDecayTimers.set(f.id, now)
                contaminatedFloors++
            }
        })

        _log('lifecycle', 'initSimulation', {
            agentCount,
            totalPositions: agentPositions.value.size,
            floorTiles: floors.length,
            contaminatedFloors
        })
    }

    function resetSimulation() {
        state.elapsedTimeMs = 0
        state.simulationRunning = false
        state.simulationPaused = false
        state.infectionTimers.clear()
        state.immunityTimers.clear()
        state.floorContaminationTimers.clear()

        // Clear all emotes (including persistent ones like deceased skull)
        clearAllEmotes()

        // Clear debug log for a fresh start
        state.contagionLog.splice(0, state.contagionLog.length)

        // Restore agent conditions (agent/human nodes only)
        agentPositions.value.forEach((_, agentId) => {
            if (!isAgentNode(agentId)) return
            setAgentCondition(agentId, AGENT_CONDITION.HEALTHY)
        })

        // Restore floor contamination to initial snapshot
        state.initialFloorLevels.forEach((level, floorId) => {
            updateFloorTile(floorId, { contaminationLevel: level })
        })

        // Reset timers for restored contamination
        const now = Date.now()
        state.floorDecayTimers.clear()
        state.initialFloorLevels.forEach((level, floorId) => {
            if (level > 0) {
                state.floorDecayTimers.set(floorId, now)
            }
        })
    }

    function play() {
        state.simulationRunning = true
        state.simulationPaused = false
    }

    function pause() {
        state.simulationPaused = true
    }

    function stepSimulation() {
        if (!state.simulationRunning) {
            state.simulationRunning = true
            state.simulationPaused = true
        }
        updateContagion(16.67) // simulate ~1 frame at 60fps
    }

    // ── Infection seeding ──

    function seedInfection(agentId) {
        const condition = getAgentCondition(agentId)
        if (condition === AGENT_CONDITION.HEALTHY) {
            setAgentCondition(agentId, AGENT_CONDITION.INFECTED)
            state.infectionTimers.set(agentId, { infectedAt: Date.now() })
            setAgentEmote(agentId, '🤒', 'Infected!')
            _log('infection', `seedInfection: ${agentId} HEALTHY → INFECTED`)
        } else {
            _log('infection', `seedInfection: ${agentId} skipped (condition=${condition})`)
        }
    }

    function cureAgent(agentId) {
        const condition = getAgentCondition(agentId)
        if (condition === AGENT_CONDITION.INFECTED) {
            setAgentCondition(agentId, AGENT_CONDITION.HEALTHY)
            state.infectionTimers.delete(agentId)
            setAgentEmote(agentId, '😊', 'Cured!')
            _log('infection', `cureAgent: ${agentId} INFECTED → HEALTHY`)
        } else {
            _log('infection', `cureAgent: ${agentId} skipped (condition=${condition})`)
        }
    }

    // ── Toggle sandbox mode ──

    function toggleSandboxMode() {
        if (!state.sandboxMode && agentPositions.value.size === 0) {
            console.warn('[ContagionEngine] Cannot activate sandbox: no agents on the canvas. Select a workflow YAML first.')
            _log('lifecycle', 'toggleSandboxMode: blocked — no agents on canvas')
            return
        }
        state.sandboxMode = !state.sandboxMode
        if (state.sandboxMode) {
            _log('lifecycle', `toggleSandboxMode: ON (agents=${agentPositions.value.size})`)
            initSimulation()
        } else {
            _log('lifecycle', 'toggleSandboxMode: OFF')
            resetSimulation()
            // Return agents to IDLE for normal mode
            agentPositions.value.forEach((_, agentId) => {
                if (!isAgentNode(agentId)) return
                setAgentStatus(agentId, AGENT_STATUS.IDLE)
            })
        }
    }

    // ── Core simulation tick ──

    function updateContagion(deltaMs) {
        const _now = Date.now()
        if (!state.sandboxMode) {
            if (state.debugEnabled && (state._lastSkipReason !== 'off' || _now - state._lastSkipLogMs >= 2000)) {
                _log('tick-skip', 'sandbox mode OFF')
                state._lastSkipLogMs = _now; state._lastSkipReason = 'off'
            }
            return
        }
        if (!state.simulationRunning) {
            if (state.debugEnabled && (state._lastSkipReason !== 'not-running' || _now - state._lastSkipLogMs >= 2000)) {
                _log('tick-skip', 'simulation not running')
                state._lastSkipLogMs = _now; state._lastSkipReason = 'not-running'
            }
            return
        }
        if (state.simulationPaused) {
            if (state.debugEnabled && (state._lastSkipReason !== 'paused' || _now - state._lastSkipLogMs >= 2000)) {
                _log('tick-skip', 'simulation paused')
                state._lastSkipLogMs = _now; state._lastSkipReason = 'paused'
            }
            return
        }
        // Clear skip reason when tick body executes
        state._lastSkipReason = ''

        state.elapsedTimeMs += deltaMs
        const now = Date.now()
        const params = getParams()
        const floors = getFloorTiles()
        const GRID_SIZE = 40

        // Tick counters for debug summary
        let tickProximityHits = 0
        let tickFloorHits = 0
        let tickFloorDeposits = 0
        let tickRecoveries = 0
        let tickFatalities = 0
        let tickMutations = 0
        let tickImmunityExpiries = 0

        // 1. Floor contact: HEALTHY agents on contaminated tiles
        agentPositions.value.forEach((pos, agentId) => {
            if (!isAgentNode(agentId)) return // skip non-agent nodes
            const condition = getAgentCondition(agentId)
            if (condition !== AGENT_CONDITION.HEALTHY) return

            // Find floor tile under agent
            const floor = findFloorTileAtPosition(pos, floors)
            if (floor && floor.contaminationLevel > 0) {
                const prob = params.floorInfectionProbability * (floor.contaminationLevel / 3)
                // Scale probability by deltaMs to make it frame-rate independent
                const scaledProb = 1 - Math.pow(1 - prob, deltaMs / 1000)
                if (Math.random() < scaledProb) {
                    setAgentCondition(agentId, AGENT_CONDITION.INFECTED)
                    state.infectionTimers.set(agentId, { infectedAt: now })
                    setAgentEmote(agentId, '🤒', 'Infected!')
                    tickFloorHits++
                }
            }
        })

        // 1b. Infected agents contaminate floor tiles they stand on
        const FLOOR_CONTAMINATION_THROTTLE_MS = 1000
        agentPositions.value.forEach((pos, agentId) => {
            if (!isAgentNode(agentId)) return
            const condition = getAgentCondition(agentId)
            if (condition !== AGENT_CONDITION.INFECTED) return

            const floor = findFloorTileAtPosition(pos, floors)
            if (!floor) return
            if (floor.contaminationLevel >= 3) return // already at max

            // Throttle: only deposit once per FLOOR_CONTAMINATION_THROTTLE_MS per tile
            const lastDeposit = state.floorContaminationTimers.get(floor.id) || 0
            if (now - lastDeposit < FLOOR_CONTAMINATION_THROTTLE_MS) return

            const newLevel = Math.min((floor.contaminationLevel || 0) + 1, 3)
            updateFloorTile(floor.id, { contaminationLevel: newLevel })
            state.floorContaminationTimers.set(floor.id, now)
            // Ensure decay timer is set for newly contaminated tiles
            if (!state.floorDecayTimers.has(floor.id)) {
                state.floorDecayTimers.set(floor.id, now)
            }
            tickFloorDeposits++
        })

        // 2. Proximity transmission: INFECTED ↔ HEALTHY within radius
        const agents = Array.from(agentPositions.value.entries()).filter(([id]) => isAgentNode(id))
        for (let i = 0; i < agents.length; i++) {
            const [idA, posA] = agents[i]
            const condA = getAgentCondition(idA)
            if (condA !== AGENT_CONDITION.INFECTED) continue

            for (let j = 0; j < agents.length; j++) {
                if (i === j) continue
                const [idB, posB] = agents[j]
                const condB = getAgentCondition(idB)
                if (condB !== AGENT_CONDITION.HEALTHY) continue

                const dx = posA.x - posB.x
                const dy = posA.y - posB.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist <= params.infectionRadius) {
                    const scaledProb = 1 - Math.pow(1 - params.infectionProbability, deltaMs / 1000)
                    if (Math.random() < scaledProb) {
                        setAgentCondition(idB, AGENT_CONDITION.INFECTED)
                        state.infectionTimers.set(idB, { infectedAt: now })
                        setAgentEmote(idB, '🤒', 'Infected!')
                        tickProximityHits++

                        // Contaminate floor tile under newly infected agent
                        const floorUnderB = findFloorTileAtPosition(posB, floors)
                        if (floorUnderB && floorUnderB.contaminationLevel < 3) {
                            const newLevel = Math.min((floorUnderB.contaminationLevel || 0) + 1, 3)
                            updateFloorTile(floorUnderB.id, { contaminationLevel: newLevel })
                            if (!state.floorDecayTimers.has(floorUnderB.id)) {
                                state.floorDecayTimers.set(floorUnderB.id, now)
                            }
                            tickFloorDeposits++
                        }
                    }
                }
            }
        }

        // 3. Mutation check + Recovery / fatality timers
        state.infectionTimers.forEach((timer, agentId) => {
            const condition = getAgentCondition(agentId)
            if (condition !== AGENT_CONDITION.INFECTED) return

            // 3a. Mutation — rare per-tick chance of lethal mutation (100% fatal)
            if (params.mutationProbability > 0) {
                const scaledMutationProb = 1 - Math.pow(1 - params.mutationProbability, deltaMs / 1000)
                if (Math.random() < scaledMutationProb) {
                    setAgentCondition(agentId, AGENT_CONDITION.DECEASED)
                    state.infectionTimers.delete(agentId)
                    setAgentEmote(agentId, '💀', 'Mutated! 🧬', true)
                    tickMutations++
                    return // skip recovery check — already deceased
                }
            }

            // 3b. Recovery / fatality — checked after recoveryTimeMs
            if (now - timer.infectedAt >= params.recoveryTimeMs) {
                if (Math.random() < params.fatalityProbability) {
                    // Death
                    setAgentCondition(agentId, AGENT_CONDITION.DECEASED)
                    state.infectionTimers.delete(agentId)
                    setAgentEmote(agentId, '💀', 'Deceased', true)
                    tickFatalities++
                } else {
                    // Recovery
                    setAgentCondition(agentId, AGENT_CONDITION.RECOVERED)
                    state.infectionTimers.delete(agentId)
                    if (params.immunityDurationMs > 0) {
                        state.immunityTimers.set(agentId, { recoveredAt: now })
                    }
                    setAgentEmote(agentId, '💪', 'Recovered!')
                    tickRecoveries++
                }
            }
        })

        // 4. Immunity expiry
        if (params.immunityDurationMs > 0) {
            state.immunityTimers.forEach((timer, agentId) => {
                if (now - timer.recoveredAt >= params.immunityDurationMs) {
                    const condition = getAgentCondition(agentId)
                    if (condition === AGENT_CONDITION.RECOVERED) {
                        setAgentCondition(agentId, AGENT_CONDITION.HEALTHY)
                        state.immunityTimers.delete(agentId)
                        setAgentEmote(agentId, '🛡️', 'Immunity expired')
                        tickImmunityExpiries++
                    }
                }
            })
        }

        // 5. Floor contamination decay
        floors.forEach(floor => {
            if (!floor.contaminationLevel || floor.contaminationLevel <= 0) return
            const lastDecay = state.floorDecayTimers.get(floor.id) || now
            if (now - lastDecay >= params.contaminationDecayMs) {
                const newLevel = floor.contaminationLevel - 1
                updateFloorTile(floor.id, { contaminationLevel: newLevel })
                state.floorDecayTimers.set(floor.id, now)
            }
        })

        // Count current status distribution (used by both tick summary and heartbeat)
        const anyEvents = tickProximityHits || tickFloorHits || tickFloorDeposits || tickRecoveries || tickFatalities || tickMutations || tickImmunityExpiries
        let h = 0, inf = 0, rec = 0, dec = 0
        if (state.debugEnabled && (anyEvents || now - state._lastHeartbeatMs >= 2000)) {
            agents.forEach(([id]) => {
                const c = getAgentCondition(id)
                switch (c) {
                    case AGENT_CONDITION.HEALTHY: h++; break
                    case AGENT_CONDITION.INFECTED: inf++; break
                    case AGENT_CONDITION.RECOVERED: rec++; break
                    case AGENT_CONDITION.DECEASED: dec++; break
                    default: h++
                }
            })
        }

        // Tick summary (only log if something happened)
        if (anyEvents) {
            _log('tick', `Δ${Math.round(deltaMs)}ms | H:${h} I:${inf} R:${rec} D:${dec}`, {
                proximityHits: tickProximityHits,
                floorHits: tickFloorHits,
                floorDeposits: tickFloorDeposits,
                recoveries: tickRecoveries,
                fatalities: tickFatalities,
                mutations: tickMutations,
                immunityExpiries: tickImmunityExpiries
            })
            state._lastHeartbeatMs = now
        } else if (state.debugEnabled && now - state._lastHeartbeatMs >= 2000) {
            // Heartbeat: periodic log when simulation is running but idle
            _log('heartbeat', `running | H:${h} I:${inf} R:${rec} D:${dec} | ${Math.round(state.elapsedTimeMs / 1000)}s elapsed`)
            state._lastHeartbeatMs = now
        }
    }

    // ── Check if agent is deceased (for idle wander filtering) ──

    function isAgentDeceased(agentId) {
        return state.sandboxMode && getAgentCondition(agentId) === AGENT_CONDITION.DECEASED
    }

    // ── Debug log controls ──

    function toggleDebugLog() {
        state.debugEnabled = !state.debugEnabled
        if (state.debugEnabled) {
            // Log state snapshot so user has context even if debug was enabled late
            const agentCount = Array.from(agentPositions.value.entries()).filter(([id]) => isAgentNode(id)).length
            const infectedCount = state.infectionTimers.size
            const params = getParams()
            _log('snapshot', [
                `sandbox=${state.sandboxMode}`,
                `running=${state.simulationRunning}`,
                `paused=${state.simulationPaused}`,
                `agents=${agentCount}`,
                `infected=${infectedCount}`,
                `elapsed=${Math.round(state.elapsedTimeMs / 1000)}s`,
                `radius=${params.infectionRadius}`,
                `prob=${params.infectionProbability}`
            ].join(' | '))
        } else {
            _log('lifecycle', 'debug logging disabled')
        }
    }

    function clearLog() {
        state.contagionLog.splice(0, state.contagionLog.length)
    }

    return {
        ...toRefs(state),
        stats,
        getParams,
        initSimulation,
        resetSimulation,
        play,
        pause,
        stepSimulation,
        seedInfection,
        cureAgent,
        toggleSandboxMode,
        updateContagion,
        isAgentDeceased,
        toggleDebugLog,
        clearLog,
        CONTAMINATION_COLORS
    }
}
