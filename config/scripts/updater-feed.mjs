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

function platformsFor(fileName) {
  const rule = platformRules.find(({ pattern }) => pattern.test(fileName))
  if (!rule) {
    throw new Error(`no updater platform for ${fileName}`)
  }
  return rule.platforms
}

// The app decodes strictly; Node's lenient decoder would pass signatures the app rejects.
function strictBase64(text, what) {
  const bytes = Buffer.from(text, 'base64')
  if (bytes.toString('base64') !== text) {
    throw new Error(`${what} is not canonical base64`)
  }
  return bytes
}

// Tauri keys and signatures are base64-wrapped minisign files, split the way Rust's `lines()` does.
function minisignLines(base64, what) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(strictBase64(base64, what))
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''))
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

function publicKeyParts(publicKeyBase64) {
  const line = minisignLines(publicKeyBase64, 'public key')[1]
  const bytes = line === undefined ? Buffer.alloc(0) : strictBase64(line, 'public key')
  if (bytes.length !== 42 || !['Ed', 'ED'].includes(bytes.subarray(0, 2).toString('latin1'))) {
    throw new Error('public key is not an Ed25519 minisign key')
  }
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: bytes.subarray(10).toString('base64url') },
    format: 'jwk'
  })
  return { keyId: bytes.subarray(2, 10), key }
}

/** Throws unless the signature is one the in-app updater accepts with one of the public keys. */
export function verifyUpdaterSignature(data, signatureBase64, publicKeysBase64) {
  const lines = minisignLines(signatureBase64, 'signature')
  const trustedPrefix = 'trusted comment: '
  if (lines.length < 4 || !lines[2].startsWith(trustedPrefix)) {
    throw new Error('signature is not a minisign signature')
  }
  const signature = strictBase64(lines[1], 'signature')
  const globalSignature = strictBase64(lines[3], 'signature')
  if (signature.length !== 74 || globalSignature.length !== 64) {
    throw new Error('signature is not a minisign signature')
  }
  const algorithm = signature.subarray(0, 2).toString('latin1')
  if (algorithm !== 'ED' && algorithm !== 'Ed') {
    throw new Error(`unknown signature algorithm ${algorithm}`)
  }
  const trusted = publicKeysBase64.map(publicKeyParts)
  const key = trusted.find(({ keyId }) => signature.subarray(2, 10).equals(keyId))?.key
  if (!key) {
    throw new Error('signed with a key other than the one installed apps trust')
  }
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data
  const signed = signature.subarray(10)
  const trustedComment = Buffer.from(lines[2].slice(trustedPrefix.length), 'utf8')
  if (
    !verify(null, message, key, signed) ||
    !verify(null, Buffer.concat([signed, trustedComment]), key, globalSignature)
  ) {
    throw new Error('signature does not match the file')
  }
}

/** The in-app updater's latest.json for the signed files in `directory`; notes come on publishing. */
export function buildUpdaterFeed({ directory, tag, repository, publicKeys, now }) {
  const platforms = {}
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.sig')) {
      continue
    }
    const fileName = name.slice(0, -'.sig'.length)
    const signature = readFileSync(join(directory, name), 'utf8')
    try {
      verifyUpdaterSignature(readFileSync(join(directory, fileName)), signature, publicKeys)
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
  return { version: tag.replace(/^v/, ''), pub_date: now.toISOString(), platforms }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        tag: { type: 'string' },
        repository: { type: 'string' },
        'trusted-config': { type: 'string', multiple: true }
      }
    })
    const required = ['tag', 'repository', 'trusted-config']
    if (positionals.length !== 1 || required.some((name) => !values[name])) {
      throw new Error('usage: updater-feed.mjs <directory> --tag --repository --trusted-config')
    }
    const configs = values['trusted-config'].map((path) => JSON.parse(readFileSync(path, 'utf8')))
    const feed = buildUpdaterFeed({
      directory: positionals[0],
      tag: values.tag,
      repository: values.repository,
      publicKeys: configs.map((config) => config.plugins.updater.pubkey),
      now: new Date()
    })
    process.stdout.write(`${JSON.stringify(feed, null, 2)}\n`)
  } catch (error) {
    console.error(`updater-feed: ${error.message}`)
    process.exitCode = 1
  }
}
