import { invokeCommand } from './native-command'
import { isTauriRuntime } from './tauri-runtime'

/**
 * Who owns which stored recovery record.
 *
 * Several tabs can have the app open on one origin, sharing one store. Without an owner per record
 * they overwrite and delete each other's unsaved work. Web Locks answer the question that matters:
 * a lock is released by the browser itself when the tab holding it goes away, so a lock that can
 * still be taken names a session nobody is editing any more — something a heartbeat can only guess.
 *
 * Why a claim is *held* and not merely probed: a momentary probe answers about the instant it ran.
 * Between that answer and the delete that follows it, another launch can reach the same conclusion
 * and act on it too. Ownership is therefore kept for as long as the record is offered or adopted.
 */
const LOCK_PREFIX = 'canvaslide.recovery.session.'
const sessionId =
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
export const currentSessionId = (): string => sessionId
export const supportsSessionOwnership = (): boolean =>
  typeof navigator !== 'undefined' && navigator.locks !== undefined

/** A claim remains held while its record is offered, adopted or being modified. */
export function createSessionClaims(manager: LockManager) {
  // Why `pending`: two callers asking about the same record must share one answer. Asking twice
  // in parallel makes the second caller see the lock the first is still holding and conclude,
  // wrongly, that a dead session is live.
  const held = new Map<string, () => void>()
  const pending = new Map<string, Promise<boolean>>()
  return {
    claim(id: string): Promise<boolean> {
      if (held.has(id)) {
        return Promise.resolve(true)
      }
      const existing = pending.get(id)
      if (existing) {
        return existing
      }
      const acquired = new Promise<boolean>((resolve, reject) => {
        void manager
          .request(`${LOCK_PREFIX}${id}`, { ifAvailable: true }, (lock) => {
            if (!lock) {
              resolve(false)
              return
            }
            // Why the callback never settles: the lock lives exactly as long as this promise, so
            // holding it open is what keeps the claim until `release` is called.
            return new Promise<void>((release) => {
              held.set(id, release)
              resolve(true)
            })
          })
          .catch(reject)
      }).finally(() => pending.delete(id))
      pending.set(id, acquired)
      return acquired
    },
    owns: (id: string): boolean => held.has(id),
    release(id: string): void {
      held.get(id)?.()
      held.delete(id)
    }
  }
}
let claims: ReturnType<typeof createSessionClaims> | undefined
const browserClaims = () => (claims ??= createSessionClaims(navigator.locks))
const nativeClaims = new Set<string>()

export async function claimRecoverySession(id: string): Promise<boolean> {
  if (isTauriRuntime()) {
    if (nativeClaims.has(id)) {
      return true
    }
    const claimed = await invokeCommand<boolean>('claim_recovery_session', { sessionId: id })
    if (claimed) {
      nativeClaims.add(id)
    }
    return claimed
  }
  return supportsSessionOwnership() ? browserClaims().claim(id) : false
}
export async function claimSession(): Promise<boolean> {
  if (isTauriRuntime() && !nativeClaims.has(sessionId)) {
    await invokeCommand('start_recovery_session')
    nativeClaims.clear()
  }
  return claimRecoverySession(sessionId)
}
export function ownsRecoverySession(id: string): boolean {
  return isTauriRuntime() ? nativeClaims.has(id) : (claims?.owns(id) ?? false)
}
export async function releaseRecoverySession(id: string): Promise<void> {
  if (id === sessionId) {
    return
  }
  if (isTauriRuntime()) {
    await invokeCommand('release_recovery_session', { sessionId: id })
    nativeClaims.delete(id)
  } else {
    claims?.release(id)
  }
}
