import { createHash, createPublicKey, verify } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// The keys tauri-action wrote for the same files, so installed apps keep finding their update.
const platformRules = [
  {
    pattern: /_universal\.app\.tar\.gz$/,
    platforms: ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app']
  },
  { pattern: /_x64-setup\.exe$/, platforms: ['windows-x86_64-nsis'] },
  { pattern: /_x64_[A-Za-z-]+\.msi$/, platforms: ['windows-x86_64', 'windows-x86_64-msi'] }
]

// A release that drops a platform would leave its installs on the old version without an error.
export const requiredPlatforms = [
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64-nsis',
  'windows-x86_64-msi'
]

export function platformsFor(fileName) {
  const rule = platformRules.find(({ pattern }) => pattern.test(fileName))
  if (!rule) {
    throw new Error(`no updater platform for ${fileName}`)
  }
  return rule.platforms
}

// Tauri keys and signatures are base64-wrapped minisign files: a comment line, then data lines.
function minisignLines(base64, what) {
  const lines = Buffer.from(base64.trim(), 'base64').toString('utf8').split('\n')
  if (lines.length < 2 || !lines[0].startsWith('untrusted comment:')) {
    throw new Error(`${what} is not a minisign file`)
  }
  return lines
}

function publicKeyParts(publicKeyBase64) {
  const bytes = Buffer.from(minisignLines(publicKeyBase64, 'public key')[1], 'base64')
  if (bytes.length !== 42 || bytes.subarray(0, 2).toString('latin1') !== 'Ed') {
    throw new Error('public key is not an Ed25519 minisign key')
  }
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: bytes.subarray(10).toString('base64url') },
    format: 'jwk'
  })
  return { keyId: bytes.subarray(2, 10), key }
}

/** Throws unless the signature is one the in-app updater accepts for these bytes. */
export function verifyUpdaterSignature(data, signatureBase64, publicKeyBase64) {
  const lines = minisignLines(signatureBase64, 'signature')
  const signature = Buffer.from(lines[1], 'base64')
  const trustedPrefix = 'trusted comment: '
  if (signature.length !== 74 || !lines[2]?.startsWith(trustedPrefix)) {
    throw new Error('signature is not a minisign signature')
  }
  const { keyId, key } = publicKeyParts(publicKeyBase64)
  if (!signature.subarray(2, 10).equals(keyId)) {
    throw new Error('signed with a key other than the one installed apps trust')
  }
  const algorithm = signature.subarray(0, 2).toString('latin1')
  if (algorithm !== 'ED' && algorithm !== 'Ed') {
    throw new Error(`unknown signature algorithm ${algorithm}`)
  }
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data
  const signed = signature.subarray(10)
  const trustedComment = Buffer.from(lines[2].slice(trustedPrefix.length), 'utf8')
  const globalSignature = Buffer.from(lines[3] ?? '', 'base64')
  if (
    !verify(null, message, key, signed) ||
    !verify(null, Buffer.concat([signed, trustedComment]), key, globalSignature)
  ) {
    throw new Error('signature does not match the file')
  }
}

/** The in-app updater's latest.json for the signed files in `directory`. */
export function buildUpdaterFeed({ directory, tag, repository, notes, publicKey, now }) {
  const platforms = {}
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.sig')) {
      continue
    }
    const fileName = name.slice(0, -'.sig'.length)
    const signature = readFileSync(join(directory, name), 'utf8')
    try {
      verifyUpdaterSignature(readFileSync(join(directory, fileName)), signature, publicKey)
    } catch (error) {
      throw new Error(`${fileName}: ${error.message}`, { cause: error })
    }
    const url = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(fileName)}`
    for (const platform of platformsFor(fileName)) {
      if (platforms[platform]) {
        throw new Error(`${platform} is provided by more than one file`)
      }
      platforms[platform] = { signature, url }
    }
  }
  const missing = requiredPlatforms.filter((platform) => !platforms[platform])
  if (missing.length > 0) {
    throw new Error(`no signed update for ${missing.join(', ')}`)
  }
  return { version: tag.replace(/^v/, ''), notes, pub_date: now.toISOString(), platforms }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        tag: { type: 'string' },
        repository: { type: 'string' },
        notes: { type: 'string' },
        'trusted-config': { type: 'string' }
      }
    })
    const required = ['tag', 'repository', 'notes', 'trusted-config']
    if (positionals.length !== 1 || required.some((name) => !values[name])) {
      throw new Error(
        'usage: updater-feed.mjs <directory> --tag --repository --notes --trusted-config'
      )
    }
    // The key of the release installed apps run, which a key rotation's bridge release replaces.
    const config = JSON.parse(readFileSync(values['trusted-config'], 'utf8'))
    const feed = buildUpdaterFeed({
      directory: positionals[0],
      tag: values.tag,
      repository: values.repository,
      notes: values.notes,
      publicKey: config.plugins.updater.pubkey,
      now: new Date()
    })
    process.stdout.write(`${JSON.stringify(feed, null, 2)}\n`)
  } catch (error) {
    console.error(`updater-feed: ${error.message}`)
    process.exitCode = 1
  }
}
