import { ref } from 'vue'

/**
 * Wrap an async function so calls made while one is in flight are no-ops.
 *
 * The flag is set synchronously on entry, so two calls in the same tick
 * (double click, repeated Cmd+Enter) still produce one invocation.
 *
 * @param {(...args: any[]) => Promise<any>} fn
 * @returns {{ run: (...args: any[]) => Promise<any>, inFlight: import('vue').Ref<boolean> }}
 */
export function useSingleFlight(fn) {
  const inFlight = ref(false)

  const run = async (...args) => {
    if (inFlight.value) return undefined
    inFlight.value = true
    try {
      return await fn(...args)
    } finally {
      inFlight.value = false
    }
  }

  return { run, inFlight }
}
