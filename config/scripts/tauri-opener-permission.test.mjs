import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const capability = JSON.parse(
  readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8')
)

test('the main window can open web links but has no file or shell opener permission', () => {
  assert.ok(capability.windows.includes('main'))
  const openerPermissions = capability.permissions.filter((permission) =>
    (typeof permission === 'string' ? permission : permission.identifier).startsWith('opener:')
  )
  assert.deepEqual(openerPermissions, [
    {
      identifier: 'opener:allow-open-url',
      allow: [{ url: 'https://*' }, { url: 'http://*' }]
    }
  ])
})
