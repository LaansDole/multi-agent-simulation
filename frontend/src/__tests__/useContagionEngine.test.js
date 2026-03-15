import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock useSpatialLayout
import { ref } from 'vue'
const mockSetAgentStatus = vi.fn()
const mockSetAgentCondition = vi.fn()
const mockGetAgentCondition = vi.fn(() => 'healthy')
const mockSetAgentEmote = vi.fn()
const mockAgentPositions = { value: new Map() }
const mockConditionVersion = ref(0)
const mockIsAgentNode = vi.fn((id) => id.startsWith('agent'))

vi.mock('../composables/useSpatialLayout.js', () => ({
    useSpatialLayout: () => ({
        agentPositions: mockAgentPositions,
        conditionVersion: mockConditionVersion,
        setAgentCondition: mockSetAgentCondition,
        getAgentCondition: mockGetAgentCondition,
        setAgentStatus: mockSetAgentStatus,
        setAgentEmote: mockSetAgentEmote,
        isAgentNode: mockIsAgentNode
    }),
    AGENT_STATUS: {
        IDLE: 'idle',
        THINKING: 'thinking',
        COMMUNICATING: 'communicating',
        ERROR: 'error'
    },
    AGENT_CONDITION: {
        HEALTHY: 'healthy',
        INFECTED: 'infected',
        RECOVERED: 'recovered',
        DECEASED: 'deceased'
    }
}))

// Mock useSpatialConfig
const mockGetConfig = vi.fn(() => ({ simulation: {} }))
const mockGetFloorTiles = vi.fn(() => [])
const mockUpdateFloorTile = vi.fn()

vi.mock('../composables/useSpatialConfig.js', () => ({
    useSpatialConfig: () => ({
        getConfig: mockGetConfig,
        getFloorTiles: mockGetFloorTiles,
        updateFloorTile: mockUpdateFloorTile
    })
}))

// Mock configStore (contagion defaults) — must use vi.hoisted() because vi.mock is hoisted
const mockConfigStore = vi.hoisted(() => ({
    CONTAGION_INFECTION_RADIUS: 120,
    CONTAGION_INFECTION_PROBABILITY: 0.7,
    CONTAGION_FLOOR_INFECTION_PROBABILITY: 0.15,
    CONTAGION_RECOVERY_TIME_MS: 60000,
    CONTAGION_FATALITY_PROBABILITY: 0.05,
    CONTAGION_MUTATION_PROBABILITY: 0.001,
    CONTAGION_CONTAMINATION_DECAY_MS: 10000,
    CONTAGION_IMMUNITY_DURATION_MS: 30000,
}))

vi.mock('../utils/configStore.js', () => ({
    configStore: mockConfigStore
}))

import { useContagionEngine } from '../composables/spatial/useContagionEngine.js'

describe('useContagionEngine', () => {
    let engine

    beforeEach(() => {
        vi.clearAllMocks()
        mockAgentPositions.value = new Map([
            ['agent-1', { x: 100, y: 100 }],
            ['agent-2', { x: 150, y: 100 }],
            ['agent-3', { x: 500, y: 500 }]
        ])
        mockGetAgentCondition.mockReturnValue('healthy')
        mockGetFloorTiles.mockReturnValue([])
        mockGetConfig.mockReturnValue({ simulation: {} })
        mockConditionVersion.value = 0

        // Reset configStore to defaults
        Object.assign(mockConfigStore, {
            CONTAGION_INFECTION_RADIUS: 120,
            CONTAGION_INFECTION_PROBABILITY: 0.7,
            CONTAGION_FLOOR_INFECTION_PROBABILITY: 0.15,
            CONTAGION_RECOVERY_TIME_MS: 60000,
            CONTAGION_FATALITY_PROBABILITY: 0.05,
            CONTAGION_MUTATION_PROBABILITY: 0.001,
            CONTAGION_CONTAMINATION_DECAY_MS: 10000,
            CONTAGION_IMMUNITY_DURATION_MS: 30000,
        })

        engine = useContagionEngine()

        // Reset singleton state — the engine uses module-level reactive state
        // If sandbox was left on from a previous test, toggle it off
        if (engine.sandboxMode.value) {
            engine.toggleSandboxMode()
        }
        // Reset debug state
        if (engine.debugEnabled.value) {
            engine.toggleDebugLog()
        }
        engine.clearLog()
    })

    describe('sandbox mode lifecycle', () => {
        it('starts with sandbox mode disabled', () => {
            expect(engine.sandboxMode.value).toBe(false)
        })

        it('toggles sandbox mode on', () => {
            engine.toggleSandboxMode()
            expect(engine.sandboxMode.value).toBe(true)
        })

        it('sets all agents to HEALTHY on init', () => {
            engine.toggleSandboxMode()
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-1', 'healthy')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-2', 'healthy')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-3', 'healthy')
        })

        it('resets agents to IDLE when sandbox mode is toggled off', () => {
            engine.toggleSandboxMode() // on
            mockSetAgentStatus.mockClear()
            engine.toggleSandboxMode() // off
            expect(engine.sandboxMode.value).toBe(false)
            // Should set agents to IDLE when leaving sandbox
            expect(mockSetAgentStatus).toHaveBeenCalledWith('agent-1', 'idle')
        })
    })

    describe('infection seeding', () => {
        it('infects a healthy agent', () => {
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleSandboxMode()
            mockSetAgentCondition.mockClear()

            engine.seedInfection('agent-1')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-1', 'infected')
        })

        it('does not infect an already infected agent', () => {
            mockGetAgentCondition.mockReturnValue('infected')
            engine.toggleSandboxMode()
            mockSetAgentCondition.mockClear()

            engine.seedInfection('agent-1')
            expect(mockSetAgentCondition).not.toHaveBeenCalled()
        })
    })

    describe('cureAgent', () => {
        it('cures an infected agent', () => {
            mockGetAgentCondition.mockReturnValue('infected')
            engine.toggleSandboxMode()
            mockSetAgentCondition.mockClear()

            engine.cureAgent('agent-1')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-1', 'healthy')
        })

        it('does nothing to a healthy agent', () => {
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleSandboxMode()
            mockSetAgentCondition.mockClear()

            engine.cureAgent('agent-1')
            expect(mockSetAgentCondition).not.toHaveBeenCalled()
        })
    })

    describe('play/pause/step lifecycle', () => {
        it('starts simulation on play', () => {
            engine.toggleSandboxMode()
            engine.play()
            expect(engine.simulationRunning.value).toBe(true)
            expect(engine.simulationPaused.value).toBe(false)
        })

        it('pauses simulation', () => {
            engine.toggleSandboxMode()
            engine.play()
            engine.pause()
            expect(engine.simulationPaused.value).toBe(true)
        })

        it('step starts simulation if not running', () => {
            engine.toggleSandboxMode()
            expect(engine.simulationRunning.value).toBe(false)

            engine.stepSimulation()
            expect(engine.simulationRunning.value).toBe(true)
            expect(engine.simulationPaused.value).toBe(true) // paused after stepping
        })
    })

    describe('updateContagion does nothing when inactive', () => {
        it('skips if sandbox mode is off', () => {
            engine.updateContagion(16)
            expect(engine.elapsedTimeMs.value).toBe(0)
        })

        it('skips if simulation is not running', () => {
            engine.toggleSandboxMode()
            // not playing
            engine.updateContagion(16)
            expect(engine.elapsedTimeMs.value).toBe(0)
        })

        it('skips if simulation is paused', () => {
            engine.toggleSandboxMode()
            engine.play()
            engine.pause()
            engine.updateContagion(16)
            expect(engine.elapsedTimeMs.value).toBe(0)
        })

        it('accumulates elapsed time when running', () => {
            engine.toggleSandboxMode()
            engine.play()
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.updateContagion(16)
            engine.updateContagion(16)
            expect(engine.elapsedTimeMs.value).toBe(32)
        })
    })

    describe('proximity transmission', () => {
        it('can infect a nearby healthy agent from an infected agent', () => {
            // agent-1 at (100,100) and agent-2 at (150,100) are 50px apart
            // Default infectionRadius = 80
            engine.toggleSandboxMode()
            engine.play()

            // Set agent-1 as infected, agent-2 as healthy
            const statusMap = { 'agent-1': 'infected', 'agent-2': 'healthy', 'agent-3': 'healthy' }
            mockGetAgentCondition.mockImplementation(id => statusMap[id] || 'healthy')
            mockSetAgentCondition.mockClear()

            // Need to seed infection timer for agent-1
            engine.seedInfection('agent-1')
            mockSetAgentCondition.mockClear()

            // Run many ticks to increase probability of transmission
            // With prob=0.3 per second and 50px < 80px radius
            for (let i = 0; i < 100; i++) {
                engine.updateContagion(100) // 100ms per tick
            }

            // agent-2 should have been infected at some point (probabilistic)
            const infectCalls = mockSetAgentCondition.mock.calls.filter(
                c => c[0] === 'agent-2' && c[1] === 'infected'
            )
            // agent-3 at (500,500) is far away, should not be infected
            const agent3InfectCalls = mockSetAgentCondition.mock.calls.filter(
                c => c[0] === 'agent-3' && c[1] === 'infected'
            )

            expect(infectCalls.length).toBeGreaterThan(0)
            expect(agent3InfectCalls.length).toBe(0)
        })
    })

    describe('getParams', () => {
        it('returns defaults when no simulation config', () => {
            mockGetConfig.mockReturnValue({})
            const params = engine.getParams()
            expect(params.infectionRadius).toBe(120)
            expect(params.infectionProbability).toBe(0.7)
            expect(params.recoveryTimeMs).toBe(60000)
            expect(params.mutationProbability).toBe(0.001)
        })

        it('uses config values when provided', () => {
            mockGetConfig.mockReturnValue({
                simulation: { infectionRadius: 200, fatalityProbability: 0.1, mutationProbability: 0.5 }
            })
            const params = engine.getParams()
            expect(params.infectionRadius).toBe(200)
            expect(params.fatalityProbability).toBe(0.1)
            expect(params.mutationProbability).toBe(0.5)
            expect(params.infectionProbability).toBe(0.7) // default
        })

        it('reads configStore overrides when set', () => {
            mockGetConfig.mockReturnValue({})
            mockConfigStore.CONTAGION_INFECTION_RADIUS = 250
            mockConfigStore.CONTAGION_FATALITY_PROBABILITY = 0.2
            const params = engine.getParams()
            expect(params.infectionRadius).toBe(250)
            expect(params.fatalityProbability).toBe(0.2)
            // Untouched configStore values use their defaults
            expect(params.infectionProbability).toBe(0.7)
        })

        it('spatial config overrides configStore', () => {
            mockConfigStore.CONTAGION_INFECTION_RADIUS = 250
            mockGetConfig.mockReturnValue({
                simulation: { infectionRadius: 300 }
            })
            const params = engine.getParams()
            expect(params.infectionRadius).toBe(300) // spatial wins
        })
    })

    describe('mutation mechanic', () => {
        it('kills an infected agent immediately when mutation triggers', () => {
            // Use very high mutation probability to guarantee trigger
            mockGetConfig.mockReturnValue({
                simulation: { mutationProbability: 1.0 }
            })
            // Start healthy so seedInfection sets the timer
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleSandboxMode()
            engine.play()

            // Seed infection — sets infection timer for agent-1
            engine.seedInfection('agent-1')

            // Now mock returns infected so mutation check finds the agent
            mockGetAgentCondition.mockReturnValue('infected')
            mockSetAgentCondition.mockClear()

            // Run a single tick — mutation should fire with prob=1.0
            engine.updateContagion(100)

            // agent-1 should be set to deceased via mutation
            const deceasedCalls = mockSetAgentCondition.mock.calls.filter(
                c => c[0] === 'agent-1' && c[1] === 'deceased'
            )
            expect(deceasedCalls.length).toBeGreaterThan(0)
        })
    })

    describe('isAgentDeceased', () => {
        it('returns false when not in sandbox mode', () => {
            // Ensure sandbox is off
            expect(engine.sandboxMode.value).toBe(false)
            mockGetAgentCondition.mockReturnValue('deceased')
            expect(engine.isAgentDeceased('agent-1')).toBe(false)
        })

        it('returns true for deceased agents in sandbox mode', () => {
            engine.toggleSandboxMode()
            // After toggle, agents are set to HEALTHY by initSimulation,
            // so override the mock to return deceased
            mockGetAgentCondition.mockReturnValue('deceased')
            expect(engine.isAgentDeceased('agent-1')).toBe(true)
        })

        it('returns false for healthy agents in sandbox mode', () => {
            engine.toggleSandboxMode()
            mockGetAgentCondition.mockReturnValue('healthy')
            expect(engine.isAgentDeceased('agent-1')).toBe(false)
        })
    })

    describe('resetSimulation', () => {
        it('resets elapsed time to 0', () => {
            engine.toggleSandboxMode()
            engine.play()
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.updateContagion(1000)
            expect(engine.elapsedTimeMs.value).toBe(1000)

            engine.resetSimulation()
            expect(engine.elapsedTimeMs.value).toBe(0)
        })

        it('sets all agents back to HEALTHY', () => {
            engine.toggleSandboxMode()
            mockSetAgentCondition.mockClear()
            engine.resetSimulation()
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-1', 'healthy')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-2', 'healthy')
            expect(mockSetAgentCondition).toHaveBeenCalledWith('agent-3', 'healthy')
        })
    })

    describe('stats computed reactivity', () => {
        it('shows correct healthy count when sandbox activates', () => {
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleSandboxMode()
            const statsVal = engine.stats.value
            expect(statsVal.healthy).toBe(3)
            expect(statsVal.infected).toBe(0)
            expect(statsVal.recovered).toBe(0)
            expect(statsVal.deceased).toBe(0)
        })

        it('returns all zeros when sandbox mode is off', () => {
            const statsVal = engine.stats.value
            expect(statsVal.healthy).toBe(0)
            expect(statsVal.infected).toBe(0)
        })

        it('does not activate sandbox when no agents exist', () => {
            mockAgentPositions.value = new Map()
            engine.toggleSandboxMode()
            expect(engine.sandboxMode.value).toBe(false)
        })

        it('excludes non-agent nodes from stats', () => {
            // Add a mix of agent and non-agent nodes
            mockAgentPositions.value = new Map([
                ['agent-1', { x: 100, y: 100 }],
                ['agent-2', { x: 150, y: 100 }],
                ['DayStart', { x: 200, y: 200 }],   // literal node
                ['LoopTimer', { x: 300, y: 300 }],   // loop_timer node
            ])
            mockIsAgentNode.mockImplementation((id) => id.startsWith('agent'))
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleSandboxMode()
            const statsVal = engine.stats.value
            // Only 2 agent nodes should be counted, not the 2 non-agent nodes
            expect(statsVal.healthy).toBe(2)
            expect(statsVal.infected).toBe(0)
        })
    })

    describe('debug logging', () => {
        it('logs state snapshot when debug is enabled', () => {
            engine.toggleSandboxMode() // sandbox on first (before debug)
            engine.toggleDebugLog() // enable debug — should log snapshot

            const log = engine.contagionLog.value
            const snapshotLogs = log.filter(e => e.category === 'snapshot')
            expect(snapshotLogs.length).toBe(1)
            expect(snapshotLogs[0].message).toContain('sandbox=true')
            expect(snapshotLogs[0].message).toContain('agents=')
        })

        it('captures sandbox toggle event when debug is enabled', () => {
            engine.toggleDebugLog() // enable debug
            engine.toggleSandboxMode() // toggle on

            const log = engine.contagionLog.value
            const lifecycleLogs = log.filter(e => e.category === 'lifecycle')
            expect(lifecycleLogs.length).toBeGreaterThanOrEqual(1)
            // Should have a toggleSandboxMode entry
            const toggleLog = lifecycleLogs.find(e => e.message.includes('toggleSandboxMode'))
            expect(toggleLog).toBeDefined()
        })

        it('captures seed infection event when debug is enabled', () => {
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleDebugLog() // enable debug
            engine.toggleSandboxMode()
            engine.seedInfection('agent-1')

            const log = engine.contagionLog.value
            const infectionLogs = log.filter(e => e.category === 'infection')
            expect(infectionLogs.length).toBeGreaterThanOrEqual(1)
            expect(infectionLogs.some(e => e.message.includes('agent-1'))).toBe(true)
        })

        it('has empty log when debug mode is disabled', () => {
            // Debug is off by default
            expect(engine.debugEnabled.value).toBe(false)
            engine.toggleSandboxMode()
            engine.seedInfection('agent-1')

            const log = engine.contagionLog.value
            expect(log.length).toBe(0)
        })

        it('clearLog empties the log array', () => {
            engine.toggleDebugLog() // enable debug
            engine.toggleSandboxMode()

            const log = engine.contagionLog.value
            expect(log.length).toBeGreaterThan(0)

            engine.clearLog()
            expect(engine.contagionLog.value.length).toBe(0)
        })

        it('emits heartbeat during idle running ticks after 2s', () => {
            mockGetAgentCondition.mockReturnValue('healthy')
            engine.toggleDebugLog()
            engine.toggleSandboxMode()
            engine.play()
            engine.clearLog() // clear setup logs

            // Simulate >2s of idle ticks (all agents healthy, no events)
            // The heartbeat uses Date.now() internally, so we advance it
            const originalNow = Date.now
            let fakeTime = originalNow.call(Date)
            Date.now = () => fakeTime

            // Run some ticks — heartbeat won't fire until 2s elapsed
            engine.updateContagion(16)
            const logAfterFirst = engine.contagionLog.value.filter(e => e.category === 'heartbeat')
            expect(logAfterFirst.length).toBe(0)

            // Advance time by 2.1s
            fakeTime += 2100
            engine.updateContagion(16)
            const logAfterHeartbeat = engine.contagionLog.value.filter(e => e.category === 'heartbeat')
            expect(logAfterHeartbeat.length).toBe(1)
            expect(logAfterHeartbeat[0].message).toContain('running')
            expect(logAfterHeartbeat[0].message).toContain('H:')

            Date.now = originalNow // restore
        })
    })
})
