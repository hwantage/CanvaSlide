import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { csp } = JSON.parse(
  readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')
).app.security
const sources = (directive) => csp[directive].trim().split(/\s+/)

// Pin the directive list too: a new directive such as script-src-elem would override these checks.
test('the desktop policy declares only the reviewed directives', () => {
  assert.deepEqual(Object.keys(csp).sort(), [
    'connect-src',
    'default-src',
    'font-src',
    'frame-src',
    'img-src',
    'media-src',
    'script-src',
    'style-src'
  ])
})

test('the desktop main window runs only its own scripts', () => {
  assert.deepEqual(sources('default-src'), ["'self'"])
  assert.deepEqual(sources('script-src'), ["'self'", "'wasm-unsafe-eval'"])
})

test('the desktop main window frames only the loopback video embed host', () => {
  assert.deepEqual(sources('frame-src'), ['http://127.0.0.1:*'])
})

test('the desktop main window plays linked media only from itself or over HTTPS', () => {
  assert.deepEqual(sources('media-src'), ["'self'", 'https:'])
})
