import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '..')

/** Mirrors the `canvaslide:checkout-identity` plugin in `config/vite.config.ts`. */
const CHECKOUT_ENDPOINT = '/__checkout'
/** Clear of 1420 (the dev server, and Tauri's `devUrl`) and 1421 (its HMR socket). */
const FIRST_PORT = 1430
const PORT_RANGE = 60

/**
 * A port belonging to this checkout rather than to "the E2E suite".
 *
 * Why: several worktrees of this repo are open at once. One shared port means the suite either
 * collides with a sibling or, worse, quietly attaches to the sibling's dev server.
 */
export function portForCheckout(path: string = repoRoot): number {
  const digest = createHash('sha256').update(path).digest()
  return FIRST_PORT + (digest.readUInt32BE(0) % PORT_RANGE)
}

/**
 * Refuses to run against a server that is serving a different checkout.
 *
 * The derived port makes a collision unlikely, not impossible, and `reuseExistingServer` hands the
 * suite whatever answers on it. Testing a stranger's tree looks exactly like a normal run, so the
 * only safe answer is to stop with both paths on screen.
 */
export async function assertServerServesThisCheckout(baseURL: string): Promise<void> {
  const served = await checkoutServedBy(baseURL)
  if (served === null) {
    throw new Error(
      `${baseURL} is not a CanvaSlide dev server, or is one too old to say which checkout it ` +
        `serves. Stop whatever holds that port and run again.`
    )
  }
  if (served !== repoRoot) {
    throw new Error(
      `${baseURL} is serving a different checkout, so this run would report results for code that ` +
        `is not here.\n  serving:  ${served}\n  expected: ${repoRoot}\n` +
        `Stop that dev server and run again.`
    )
  }
}

/** The checkout `baseURL` serves, or `null` if whatever answers is not one of our dev servers. */
async function checkoutServedBy(baseURL: string): Promise<string | null> {
  const response = await fetch(new URL(CHECKOUT_ENDPOINT, baseURL))
  if (!response.ok) {
    return null
  }
  // Why: an older server answers unknown paths with index.html and a 200, so anything that is not
  // the exact shape this endpoint returns counts as "cannot identify itself".
  const body: unknown = await response.json().catch(() => null)
  const checkout =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'canvaslideCheckout') : undefined
  return typeof checkout === 'string' ? checkout : null
}
