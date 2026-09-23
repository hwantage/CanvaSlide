import { createSessionClaims } from './recovery-session'
it('does not treat a rejected Web Locks request as acquired and allows retry', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('denied', 'SecurityError'))
    .mockImplementation(async (_name, _options, callback) => callback(null))
  const claims = createSessionClaims({ request } as unknown as LockManager)
  await expect(claims.claim('a')).rejects.toThrow('denied')
  expect(claims.owns('a')).toBe(false)
  await expect(claims.claim('a')).resolves.toBe(false)
  expect(claims.owns('a')).toBe(false)
})
it('acknowledges acquisition before resolving the lock lifetime and coalesces requests', async () => {
  let released = false
  const request = vi.fn(async (_name, _options, callback) => {
    await callback({ name: 'a' })
    released = true
  })
  const claims = createSessionClaims({ request } as unknown as LockManager)
  const first = claims.claim('a')
  const second = claims.claim('a')
  expect(await first).toBe(true)
  expect(await second).toBe(true)
  expect(claims.owns('a')).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
  expect(released).toBe(false)
  claims.release('a')
  await Promise.resolve()
  expect(released).toBe(true)
  expect(claims.owns('a')).toBe(false)
})
