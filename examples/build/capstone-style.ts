import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocBuilder, TextOptions } from './builder.ts'

export const W = 1280
export const H = 720
export const brand = '#1a4b9c'
export const brandMid = '#6b9bd8'
export const brandSoft = '#dbe7f7'
export const ink = '#0f172a'
export const slate = '#475569'
export const mutedC = '#64748b'
export const line = '#e2e8f0'
export const paper = '#ffffff'
export const snow = '#f8fafc'
export const teal = '#0e7490'
export const amber = '#fde68a'
export const amberInk = '#78350f'

export type Slide = { x: number; y: number }

const logo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'assets/hansung-logo.png'))

const COL_GAP = 120
const ROW_GAP = 340

export function slideAt(col: number, row: number): Slide {
  return { x: 80 + col * (W + COL_GAP), y: 220 + row * (H + ROW_GAP) }
}

export function rowLabel(b: DocBuilder, row: number, text: string): void {
  b.text(80, slideAt(0, row).y - 190, text, { fontSize: 40, bold: true, color: brand })
}

/** Frame + white card; the SOMANSA template chrome (wordmark, HSU logo, footer rule) unless plain. */
export function slide(
  b: DocBuilder,
  col: number,
  row: number,
  name: string,
  options: { plain?: boolean } = {}
): Slide {
  const s = slideAt(col, row)
  b.frame(s.x, s.y, W, H, name)
  b.rect(s.x, s.y, W, H, { fill: paper, stroke: line, strokeWidth: 1, radius: 16 })
  if (!options.plain) {
    b.text(s.x + 64, s.y + 40, 'SOMANSA', { fontSize: 22, bold: true, color: brand })
    b.imageBytes(s.x + W - 64 - 200, s.y + 36, 200, 35, 'image/png', logo)
    b.rect(s.x + 64, s.y + 668, W - 128, 3, {
      fill: brand,
      stroke: brand,
      strokeWidth: 0,
      radius: 0
    })
    b.text(s.x + 64, s.y + 682, '© 2026 SOMANSA · 한성대학교 융합보안학과 프리캡스톤 2026-2', {
      fontSize: 12,
      color: mutedC
    })
  }
  return s
}

export function title(b: DocBuilder, s: Slide, text: string): void {
  b.text(s.x + 64, s.y + 104, text, { fontSize: 34, bold: true, color: ink, width: W - 128 })
  b.rect(s.x + 64, s.y + 160, W - 128, 2, { fill: line, stroke: line, strokeWidth: 0, radius: 0 })
}

export function para(
  b: DocBuilder,
  x: number,
  y: number,
  lines: string[],
  options: TextOptions = {}
): number {
  const size = options.fontSize ?? 20
  b.text(x, y, lines.join('\n'), { color: slate, ...options, fontSize: size })
  return y + Math.ceil(lines.length * size * 1.4)
}

export function bullets(
  b: DocBuilder,
  x: number,
  y: number,
  items: string[],
  options: TextOptions = {}
): number {
  return para(
    b,
    x,
    y,
    items.map((item) => `•  ${item}`),
    options
  )
}

export function card(
  b: DocBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill?: string; stroke?: string; radius?: number; strokeWidth?: number } = {}
): string {
  return b.rect(x, y, w, h, {
    fill: options.fill ?? snow,
    stroke: options.stroke ?? line,
    strokeWidth: options.strokeWidth ?? 1,
    radius: options.radius ?? 16
  })
}

/** Yellow label the original deck uses for "프로젝트 목표" etc. */
export function tag(b: DocBuilder, x: number, y: number, text: string): void {
  b.rect(x, y, Math.max(120, text.length * 17 + 32), 32, {
    fill: amber,
    stroke: amber,
    strokeWidth: 0,
    radius: 6,
    text,
    fontSize: 15,
    bold: true,
    color: amberInk
  })
}

export function stat(
  b: DocBuilder,
  x: number,
  y: number,
  w: number,
  big: string,
  small: string,
  accent = brand
): void {
  card(b, x, y, w, 180)
  b.rect(x, y, w, 6, { fill: accent, stroke: accent, strokeWidth: 0, radius: 3 })
  b.text(x + 28, y + 36, big, { fontSize: 52, bold: true, color: ink, width: w - 56 })
  b.text(x + 28, y + 118, small, { fontSize: 17, color: slate, width: w - 56 })
}

/** Header row in brand blue, zebra body rows; returns the bottom edge. */
export function table(
  b: DocBuilder,
  x: number,
  y: number,
  widths: number[],
  rows: string[][],
  options: { rowHeight?: number; fontSize?: number } = {}
): number {
  const rowH = options.rowHeight ?? 40
  const fontSize = options.fontSize ?? 16
  const total = widths.reduce((a, c) => a + c, 0)
  rows.forEach((row, r) => {
    const top = y + r * rowH
    const header = r === 0
    b.rect(x, top, total, rowH, {
      fill: header ? brand : r % 2 === 1 ? paper : snow,
      stroke: header ? brand : line,
      strokeWidth: header ? 0 : 1,
      radius: 0
    })
    let cx = x
    row.forEach((cell, c) => {
      const width = widths[c] ?? 120
      b.text(cx + 14, top + (rowH - Math.ceil(fontSize * 1.4)) / 2, cell, {
        fontSize,
        bold: header,
        color: header ? paper : ink,
        width: width - 20
      })
      cx += width
    })
  })
  return y + rows.length * rowH
}

export function code(b: DocBuilder, x: number, y: number, w: number, h: number, source: string) {
  b.rect(x, y, w, h, { fill: '#0f172a', stroke: '#0f172a', strokeWidth: 0, radius: 12 })
  b.text(x + 24, y + 20, source, { fontSize: 15, color: '#e2e8f0', width: w - 48 })
}

/** Diagram node in the deck's box style. */
export function box(
  b: DocBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  options: { fill?: string; stroke?: string } = {}
): string {
  return b.rect(x, y, w, h, {
    fill: options.fill ?? paper,
    stroke: options.stroke ?? brand,
    strokeWidth: 2,
    radius: 10,
    text: label,
    fontSize: 15,
    bold: true,
    color: ink
  })
}
