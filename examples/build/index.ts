import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildArchitecture } from './architecture.ts'
import { buildCapstone } from './capstone.ts'
import { buildErd } from './erd.ts'
import { buildFlowchart } from './flowchart.ts'
import { buildMindmap } from './mindmap.ts'
import { buildSlides } from './slides.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const samples = [
  ['flowchart', 'order-fulfillment', buildFlowchart],
  ['erd', 'shop-schema', buildErd],
  ['slides', 'northwind-launch-deck', buildSlides],
  ['architecture', 'shop-platform', buildArchitecture],
  ['mindmap', 'product-strategy-2027', buildMindmap],
  ['capstone', 'hansung-precapstone-2026-2', buildCapstone]
] as const

for (const [dir, file, build] of samples) {
  const document = build()
  const target = join(root, dir, `${file}.canvas.json`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`)
  const count = Object.keys(document.elements).length
  console.log(`${dir}/${file}.canvas.json  ${count} elements`)
}
