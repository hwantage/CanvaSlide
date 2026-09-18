import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, matchesGlob, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const oxlint = resolve(
  dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))),
  'bin/oxlint'
)

// Share discovery and policy with oxlint; count independently so inline disables cannot bypass it.
export function lintedFiles(root) {
  return execFileSync(process.execPath, [oxlint, '--debug', 'files'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
    .trim()
    .split(/\r?\n/)
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => file.replaceAll('\\', '/'))
}

export function limitFor(file, config) {
  let rule = config.rules?.['max-lines']
  for (const override of config.overrides ?? []) {
    if (override.files.some((pattern) => matchesGlob(file, pattern))) {
      rule = override.rules?.['max-lines'] ?? rule
    }
  }
  if (rule === undefined || rule === 'off') {
    return null
  }
  const [severity, options] = rule
  if (
    severity !== 'error' ||
    !Number.isInteger(options?.max) ||
    options.max < 0 ||
    options.skipBlankLines !== false ||
    options.skipComments !== false
  ) {
    throw new Error('max-lines must use an error limit and count blank lines and comments')
  }
  return options.max
}

// Match oxlint: LF and CRLF count alike; a final newline adds no extra line; empty files count as one.
export function countLines(source) {
  const newlines = source.split('\n').length - 1
  return Math.max(1, newlines + (source.endsWith('\n') ? 0 : 1))
}

export function checkMaxLines(root = repositoryRoot) {
  const config = JSON.parse(readFileSync(resolve(root, '.oxlintrc.json'), 'utf8'))
  const failures = []
  for (const file of lintedFiles(root)) {
    const limit = limitFor(file, config)
    if (limit === null) {
      continue
    }
    const lines = countLines(readFileSync(resolve(root, file), 'utf8'))
    if (lines > limit) {
      failures.push(`${file}: ${lines} lines > ${limit}`)
    }
  }
  return failures
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkMaxLines()
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log('max-lines: ok')
  }
}
