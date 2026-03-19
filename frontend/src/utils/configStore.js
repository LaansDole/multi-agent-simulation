import { reactive, watch } from 'vue'

const CONFIG_KEY = 'agent_config_settings'

const defaultSettings = {
    AUTO_SHOW_ADVANCED: false,
    AUTO_EXPAND_MESSAGES: false,
    ENABLE_HELP_TOOLTIPS: true,

    // ── Contagion simulation defaults ──
    CONTAGION_INFECTION_RADIUS: 120,            // px — max distance for proximity spread
    CONTAGION_INFECTION_PROBABILITY: 0.7,       // /sec — chance of catching infection within radius
    CONTAGION_FLOOR_INFECTION_PROBABILITY: 0.15,// /sec — chance of infection from contaminated floor
    CONTAGION_RECOVERY_TIME_MS: 60000,          // ms — time from infection to recovery/fatality
    CONTAGION_FATALITY_PROBABILITY: 0.05,       // 0-1 — chance of death vs recovery
    CONTAGION_MUTATION_PROBABILITY: 0.001,      // /sec — rare lethal mutation while infected
    CONTAGION_CONTAMINATION_DECAY_MS: 10000,    // ms — floor contamination decay interval
    CONTAGION_IMMUNITY_DURATION_MS: 30000,      // ms — immunity window after recovery
    CONTAGION_HEATMAP_RADIUS: 60,               // px — heatmap overlay radius around infected agents
}

// Initialize state from localStorage
const stored = localStorage.getItem(CONFIG_KEY)
const initialState = stored ? { ...defaultSettings, ...JSON.parse(stored) } : { ...defaultSettings }

export const configStore = reactive(initialState)

// Watch for changes and save to localStorage
watch(configStore, (newVal) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(newVal))
}, { deep: true })
