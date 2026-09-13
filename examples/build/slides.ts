import { DocBuilder } from './builder.ts'

const SLIDE_W = 1280
const SLIDE_H = 720
const navy = '#0f172a'
const paper = '#ffffff'
const snow = '#f8fafc'
const slate = '#64748b'
const cyan = '#06b6d4'
const violet = '#8b5cf6'
const amber = '#f59e0b'

const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="44" fill="url(#g)"/>
  <path d="M28 58 L44 36 L56 50 L70 30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

function slide(b: DocBuilder, index: number, name: string, dark = false) {
  const x = 80 + (index % 3) * (SLIDE_W + 160)
  const y = 120 + Math.floor(index / 3) * (SLIDE_H + 200)
  b.frame(x, y, SLIDE_W, SLIDE_H, name)
  b.rect(x, y, SLIDE_W, SLIDE_H, {
    fill: dark ? navy : paper,
    stroke: dark ? navy : '#e2e8f0',
    strokeWidth: dark ? 0 : 1,
    radius: 24
  })
  return { x, y }
}

function title(b: DocBuilder, x: number, y: number, text: string, dark = false) {
  b.text(x + 96, y + 72, text, {
    fontSize: 44,
    bold: true,
    color: dark ? paper : navy,
    width: 1088
  })
  b.rect(x + 96, y + 140, 72, 6, { fill: cyan, stroke: cyan, strokeWidth: 0, radius: 3 })
}

/** Six-slide launch deck; every slide is a frame so ⏎ presents them in order. */
export function buildSlides() {
  const b = new DocBuilder('Northwind Launch Deck', { background: 'plain', transitionMs: 1100 })

  // 1 · Title
  const s1 = slide(b, 0, 'Title', true)
  b.ellipse(s1.x + 900, s1.y - 80, 520, 520, { fill: '#1e293b', stroke: '#1e293b', strokeWidth: 0 })
  b.ellipse(s1.x + 1080, s1.y + 420, 360, 360, {
    fill: '#172554',
    stroke: '#172554',
    strokeWidth: 0
  })
  b.image(s1.x + 96, s1.y + 88, 96, 96, logoSvg)
  b.text(s1.x + 96, s1.y + 250, 'Northwind Analytics', {
    fontSize: 72,
    bold: true,
    color: paper,
    width: 900
  })
  b.text(s1.x + 96, s1.y + 360, 'Turn every dashboard into a conversation.', {
    fontSize: 30,
    color: '#94a3b8',
    width: 900
  })
  b.rect(s1.x + 96, s1.y + 560, 200, 44, {
    fill: cyan,
    stroke: cyan,
    strokeWidth: 0,
    radius: 22,
    text: 'LAUNCH · Q4 2026',
    fontSize: 14,
    bold: true,
    color: navy
  })

  // 2 · Agenda
  const s2 = slide(b, 1, 'Agenda')
  title(b, s2.x, s2.y, 'Agenda')
  const items = [
    'The problem with dashboards',
    'How Northwind works',
    'Pilot results',
    'Roadmap & pricing'
  ]
  items.forEach((item, i) => {
    const y = s2.y + 220 + i * 100
    b.ellipse(s2.x + 96, y, 56, 56, {
      fill: navy,
      stroke: navy,
      text: String(i + 1),
      color: paper,
      bold: true,
      fontSize: 22
    })
    b.text(s2.x + 176, y + 10, item, { fontSize: 30, color: navy, width: 900 })
  })

  // 3 · Problem
  const s3 = slide(b, 2, 'Problem')
  title(b, s3.x, s3.y, 'Teams drown in dashboards')
  const stats: [string, string, string][] = [
    ['47%', 'of dashboards are never\nopened after week one', cyan],
    ['6.5 h', 'per analyst, per week,\nspent answering ad-hoc asks', violet],
    ['3 tools', 'on average between a\nquestion and its answer', amber]
  ]
  stats.forEach(([big, small, accent], i) => {
    const x = s3.x + 96 + i * 372
    b.rect(x, s3.y + 220, 344, 380, { fill: snow, stroke: '#e2e8f0', radius: 20 })
    b.rect(x, s3.y + 220, 344, 8, { fill: accent, stroke: accent, strokeWidth: 0, radius: 4 })
    b.text(x + 32, s3.y + 270, big, { fontSize: 64, bold: true, color: navy, width: 280 })
    b.text(x + 32, s3.y + 380, small, { fontSize: 22, color: slate, width: 290 })
  })

  // 4 · Solution
  const s4 = slide(b, 3, 'How it works')
  title(b, s4.x, s4.y, 'One canvas, three steps')
  const steps: [string, string, string][] = [
    ['Connect', 'Warehouse, sheets, APIs', cyan],
    ['Ask', 'Plain-English questions', violet],
    ['Share', 'Live frames, not PDFs', amber]
  ]
  const stepIds = steps.map(([head, sub, accent], i) => {
    const x = s4.x + 120 + i * 400
    const id = b.rect(x, s4.y + 300, 280, 180, {
      fill: paper,
      stroke: accent,
      strokeWidth: 3,
      radius: 24
    })
    b.ellipse(x + 110, s4.y + 270, 60, 60, {
      fill: accent,
      stroke: accent,
      text: String(i + 1),
      color: paper,
      bold: true,
      fontSize: 24
    })
    b.text(x, s4.y + 350, head, {
      fontSize: 32,
      bold: true,
      color: navy,
      align: 'center',
      width: 280
    })
    b.text(x, s4.y + 400, sub, { fontSize: 20, color: slate, align: 'center', width: 280 })
    return id
  })
  b.connect(stepIds[0] as string, stepIds[1] as string, {
    route: 'straight',
    stroke: '#94a3b8',
    width: 3,
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(stepIds[1] as string, stepIds[2] as string, {
    route: 'straight',
    stroke: '#94a3b8',
    width: 3,
    fromSide: 'right',
    toSide: 'left'
  })

  // 5 · Metrics (bar chart from rectangles)
  const s5 = slide(b, 4, 'Pilot results')
  title(b, s5.x, s5.y, 'Pilot results · 12 teams, 8 weeks')
  const bars: [string, number][] = [
    ['Wk 1', 18],
    ['Wk 2', 31],
    ['Wk 4', 52],
    ['Wk 6', 74],
    ['Wk 8', 91]
  ]
  const baseY = s5.y + 600
  const chartX = s5.x + 160
  b.rect(chartX - 40, baseY, 900, 2, {
    fill: '#cbd5e1',
    stroke: '#cbd5e1',
    strokeWidth: 0,
    radius: 0
  })
  bars.forEach(([label, value], i) => {
    const x = chartX + i * 180
    const h = value * 3.6
    b.rect(x, baseY - h, 110, h, {
      fill: i === bars.length - 1 ? cyan : '#bae6fd',
      stroke: '#0ea5e9',
      strokeWidth: 0,
      radius: 8
    })
    b.text(x, baseY - h - 40, `${value}%`, {
      fontSize: 22,
      bold: true,
      color: navy,
      align: 'center',
      width: 110
    })
    b.text(x, baseY + 16, label, { fontSize: 18, color: slate, align: 'center', width: 110 })
  })
  b.text(
    s5.x + 96,
    s5.y + 200,
    'Weekly active analysts answering questions in Northwind instead of a BI tool',
    {
      fontSize: 20,
      color: slate,
      width: 1088
    }
  )

  // 6 · Roadmap
  const s6 = slide(b, 5, 'Roadmap', true)
  title(b, s6.x, s6.y, 'Roadmap', true)
  b.rect(s6.x + 140, s6.y + 380, 1000, 4, {
    fill: '#334155',
    stroke: '#334155',
    strokeWidth: 0,
    radius: 2
  })
  const milestones: [string, string, string][] = [
    ['Q4 2026', 'Public launch', cyan],
    ['Q1 2027', 'Slack & Teams', violet],
    ['Q2 2027', 'Row-level security', amber],
    ['Q3 2027', 'On-prem edition', '#34d399']
  ]
  milestones.forEach(([when, what, accent], i) => {
    const x = s6.x + 140 + i * 320
    b.ellipse(x - 14, s6.y + 368, 28, 28, { fill: accent, stroke: navy, strokeWidth: 4 })
    b.text(x - 100, s6.y + 300, when, {
      fontSize: 20,
      bold: true,
      color: accent,
      align: 'center',
      width: 200
    })
    b.text(x - 100, s6.y + 420, what, { fontSize: 22, color: paper, align: 'center', width: 200 })
  })
  b.text(s6.x + 96, s6.y + 600, 'northwind.app/launch  ·  hello@northwind.app', {
    fontSize: 20,
    color: '#94a3b8',
    width: 800
  })

  return b.build()
}
