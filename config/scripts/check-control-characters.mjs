import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

// Every other tracked file is text; a new binary format fails the check until it is listed here.
const binaryExtensions = new Set(['.fig', '.icns', '.ico', '.mp4', '.png', '.webm', '.webp'])

// Only tracked files: editor swap files and other local clutter are not the repository's content.
export function textFiles(root) {
  const output = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const files = new Set()
  for (let start = 0, end; (end = output.indexOf(0, start)) !== -1; start = end + 1) {
    const name = output.subarray(start, end)
    const file = name.toString('utf8')
    // A lossy decode would point at no file and let its content go unchecked.
    if (!Buffer.from(file).equals(name)) {
      throw new Error(`tracked file name is not UTF-8: ${file}`)
    }
    // A set, because an unmerged path is listed once per stage.
    if (!binaryExtensions.has(extname(file).toLowerCase())) {
      files.add(file)
    }
  }
  return [...files]
}

function workingTreeEntry(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    // Deleted, sparse-checkout and skip-worktree paths have no working-tree file to check.
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return null
    }
    throw error
  }
}

// C0 controls other than tab, LF and CR, and DEL, are invisible in editors and review diffs.
function isControlByte(byte) {
  return (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte === 0x7f
}

/** The first control character with its line, and how many the bytes hold; null when clean. */
export function findControlCharacters(bytes) {
  let first = null
  let count = 0
  let line = 1
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]
    if (byte === 0x0a) {
      line += 1
    } else if (isControlByte(byte)) {
      count += 1
      first ??= { line, codePoint: `U+${byte.toString(16).toUpperCase().padStart(4, '0')}` }
    }
  }
  return first && { ...first, count }
}

export function checkControlCharacters(root = repositoryRoot) {
  const failures = []
  for (const file of textFiles(root)) {
    const path = resolve(root, file)
    // Symlinks and submodules have no file bytes of their own to check.
    if (!workingTreeEntry(path)?.isFile()) {
      continue
    }
    const found = findControlCharacters(readFileSync(path))
    if (found) {
      const more = found.count > 1 ? ` and ${found.count - 1} more` : ''
      failures.push(`${file}:${found.line}: ${found.codePoint}${more}`)
    }
  }
  return failures
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const failures = checkControlCharacters()
    if (failures.length > 0) {
      console.error(
        `${failures.join('\n')}\n` +
          'control-characters: write these as escapes (e.g. \\x00), or list a binary file type in ' +
          'config/scripts/check-control-characters.mjs'
      )
      process.exitCode = 1
    } else {
      console.log('control-characters: ok')
    }
  } catch (error) {
    console.error(`control-characters: ${error.message}`)
    process.exitCode = 1
  }
}
