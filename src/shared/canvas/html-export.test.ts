import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from './element-types'
import { buildStandaloneHtml, embedJsonSafely, formatBytes } from './html-export'

describe('html-export', () => {
  it('neutralizes script-closing sequences inside embedded JSON', () => {
    const json = embedJsonSafely({ text: '</script><!-- x' })
    expect(json).not.toContain('</script>')
    expect(json).not.toContain('<!--')
    expect(JSON.parse(json)).toEqual({ text: '</script><!-- x' })
  })

  it('assembles a single page with the document and player inlined', () => {
    const doc = createEmptyDocument('My <Deck>')
    const html = buildStandaloneHtml({ document: doc, playerScript: 'console.log(1)' })
    expect(html).toContain('<title>My &lt;Deck&gt;</title>')
    expect(html).toContain('<script id="canvas-document" type="application/json">')
    expect(html).toContain('<script>console.log(1)</script>')
    expect(html).not.toMatch(/src="http/)
  })

  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(20 * 1024)).toBe('20 KB')
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB')
  })
})
