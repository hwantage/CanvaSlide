import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** The release's latest.json with its published Release body as the update notice's notes. */
export function withReleaseNotes(feed, { tag, body }) {
  const version = tag.replace(/^v/, '')
  if (feed?.version !== version) {
    throw new Error(`latest.json is for version ${feed?.version}, not ${version}`)
  }
  // Bodies saved on github.com use CRLF, and the notice would render each CR as a space.
  const notes = body.replace(/\r\n?/g, '\n').trim()
  const next = { ...feed, notes }
  if (!notes) {
    delete next.notes
  }
  return next
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { tag: { type: 'string' }, body: { type: 'string' } }
    })
    if (positionals.length !== 1 || !values.tag || !values.body) {
      throw new Error('usage: updater-feed-notes.mjs <latest.json> --tag <tag> --body <body file>')
    }
    const feed = withReleaseNotes(JSON.parse(readFileSync(positionals[0], 'utf8')), {
      tag: values.tag,
      body: readFileSync(values.body, 'utf8')
    })
    process.stdout.write(`${JSON.stringify(feed, null, 2)}\n`)
  } catch (error) {
    console.error(`updater-feed-notes: ${error.message}`)
    process.exitCode = 1
  }
}
