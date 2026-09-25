import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const playerFile = fileURLToPath(
  new URL('../../src/renderer/src/generated/player.iife.js', import.meta.url)
)

// Raised only in its own pull request (AGENTS.md): a limit that moves with a feature gates nothing.
export const MAX_PLAYER_BYTES = 60_000

export function checkPlayerSize(file = playerFile) {
  const source = readFileSync(file)
  if (source.length === 0) {
    throw new Error(`player-size: empty artifact at ${file}; run pnpm build:player`)
  }
  const size = { raw: source.length, gzip: gzipSync(source).length }
  if (size.raw > MAX_PLAYER_BYTES) {
    throw new Error(
      `player-size: ${size.raw} B raw > ${MAX_PLAYER_BYTES} B limit (${size.gzip} B gzip); ` +
        'shrink the player, or raise the budget in a separate pull request (see AGENTS.md)'
    )
  }
  return size
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { raw, gzip } = checkPlayerSize()
    console.log(
      `player-size: ${raw} B raw / ${MAX_PLAYER_BYTES} B limit; ${gzip} B gzip (report only)`
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
