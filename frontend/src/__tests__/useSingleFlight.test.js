/**
 * @fileoverview Unit tests for useSingleFlight composable (Launch double-POST guard)
 */
import { describe, it, expect, vi } from 'vitest'
import { useSingleFlight } from '../composables/useSingleFlight.js'

function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

describe('useSingleFlight', () => {
    it('drops a call made while the first is still in flight', async () => {
        const pending = deferred()
        const fetchFn = vi.fn(() => pending.promise)
        const { run, inFlight } = useSingleFlight(fetchFn)

        const first = run()
        const second = run()
        expect(fetchFn).toHaveBeenCalledTimes(1)
        expect(inFlight.value).toBe(true)

        pending.resolve('ok')
        await expect(first).resolves.toBe('ok')
        await expect(second).resolves.toBeUndefined()
        expect(inFlight.value).toBe(false)
    })

    it('allows a new call after the first resolves', async () => {
        const fetchFn = vi.fn(async () => 'ok')
        const { run } = useSingleFlight(fetchFn)

        await run()
        await run()
        expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('allows a new call after the first rejects', async () => {
        const fetchFn = vi.fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce('ok')
        const { run, inFlight } = useSingleFlight(fetchFn)

        await expect(run()).rejects.toThrow('network down')
        expect(inFlight.value).toBe(false)
        await expect(run()).resolves.toBe('ok')
        expect(fetchFn).toHaveBeenCalledTimes(2)
    })
})
