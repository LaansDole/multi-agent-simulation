import { useEffect, useState } from 'react'
import { BackendClient } from '../api/BackendClient'
import type { MockScenario } from '../api/types'
import { useActiveTeam } from '../store/teamStore'

/** Workflow whose task prompt is a case (Case JSON or the plain-text format of dynaclinic/plaintext.py). */
export const DYNACLINIC_WORKFLOW = 'dynaclinic_mvp.yaml'

/** Mock DynaClinic cases for demos; [] when another workflow is imported or the backend call fails. */
export function useMockScenarios(): MockScenario[] {
  const isDynaClinic = useActiveTeam().sourceYamlFile === DYNACLINIC_WORKFLOW
  const [scenarios, setScenarios] = useState<MockScenario[]>([])

  useEffect(() => {
    if (!isDynaClinic) return
    let live = true
    new BackendClient().fetchMockScenarios().then((list) => {
      if (live) setScenarios(list)
    })
    return () => {
      live = false
    }
  }, [isDynaClinic])

  return isDynaClinic ? scenarios : []
}
