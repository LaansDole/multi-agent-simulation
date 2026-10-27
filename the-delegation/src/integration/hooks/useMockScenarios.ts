import { useEffect, useState } from 'react'
import { BackendClient } from '../api/BackendClient'
import type { MockScenario } from '../api/types'
import { useActiveTeam } from '../store/teamStore'

/** Workflow whose task prompt is a case (Case JSON or the plain-text format of dynaclinic/plaintext.py). */
export const DYNACLINIC_WORKFLOW = 'dynaclinic_mvp.yaml'

export interface MockScenariosState {
  /** Imported workflow file; undefined when none is imported (nothing is fetched). */
  file: string | undefined
  loading: boolean
  /** The last fetch failed (e.g. the backend predates the endpoint). */
  failed: boolean
  scenarios: MockScenario[]
  retry: () => void
}

/** One line under the "Mock scenarios" heading. */
export function mockScenariosLabel(file: string): string {
  return file === DYNACLINIC_WORKFLOW ? 'Mock patients for demonstration, not real data.' : `Mock scenarios from ${file}`
}

/** graph.demo_scenarios of the imported workflow, fetched once per file (and per retry). */
export function useMockScenarios(): MockScenariosState {
  const file = useActiveTeam().sourceYamlFile
  const [attempt, setAttempt] = useState(0)
  const key = `${file}#${attempt}`
  // scenarios === null: the fetch for `key` failed.
  const [result, setResult] = useState<{ key: string; scenarios: MockScenario[] | null } | null>(null)

  useEffect(() => {
    if (!file) return
    let live = true
    new BackendClient().fetchWorkflowScenarios(file).then(
      (scenarios) => live && setResult({ key, scenarios }),
      () => live && setResult({ key, scenarios: null }),
    )
    return () => {
      live = false
    }
  }, [file, key])

  const current = file && result?.key === key ? result : null
  return {
    file,
    loading: Boolean(file) && !current,
    failed: current?.scenarios === null,
    scenarios: current?.scenarios ?? [],
    retry: () => setAttempt((n) => n + 1),
  }
}
