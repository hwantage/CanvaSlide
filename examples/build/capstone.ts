import { DocBuilder } from './builder.ts'
import { aiEraRow } from './capstone-ai.ts'
import { accelerationRow } from './capstone-acceleration.ts'
import { introRow } from './capstone-intro.ts'
import { prepRow } from './capstone-prep.ts'
import { topicsRow } from './capstone-topics.ts'

/**
 * Hansung University pre-capstone 2026-2 deck (SOMANSA), condensed from 59 PowerPoint slides to
 * the 24 that carry text; picture-only and video slides are omitted. Rows group the four parts.
 */
export function buildCapstone() {
  const b = new DocBuilder('한성대 프리캡스톤 2026-2', { background: 'plain', transitionMs: 1000 })
  introRow(b)
  accelerationRow(b)
  aiEraRow(b)
  prepRow(b)
  topicsRow(b)
  return b.build()
}
