import { DocBuilder } from './builder.ts'

type Branch = { name: string; color: string; soft: string; leaves: string[] }

const branches: Branch[] = [
  {
    name: 'Growth',
    color: '#0ea5e9',
    soft: '#e0f2fe',
    leaves: ['Self-serve onboarding', 'Referral loop', 'SEO content engine']
  },
  {
    name: 'Platform',
    color: '#8b5cf6',
    soft: '#ede9fe',
    leaves: ['Public API v2', 'Plugin marketplace', 'SSO & audit logs']
  },
  {
    name: 'Customers',
    color: '#10b981',
    soft: '#d1fae5',
    leaves: ['Quarterly councils', 'NPS above 50', 'Same-day support']
  },
  {
    name: 'Team',
    color: '#f59e0b',
    soft: '#fef3c7',
    leaves: ['Hire 4 engineers', 'Design system owner', 'Async-first rituals']
  },
  {
    name: 'Revenue',
    color: '#f43f5e',
    soft: '#ffe4e6',
    leaves: ['Usage-based tier', 'Annual plans', 'Partner resale']
  }
]

/** Central topic with five colour-coded branches; curved connectors radiate outward. */
export function buildMindmap() {
  const b = new DocBuilder('Product Strategy 2027 (mind map)', { background: 'plain' })

  const cx = 700
  const cy = 440
  const center = b.ellipse(cx, cy, 300, 120, {
    fill: '#18181b',
    stroke: '#18181b',
    text: 'Product Strategy\n2027',
    color: '#ffffff',
    bold: true,
    fontSize: 22
  })

  // [branch x, branch y, leaf x, first leaf y, leaf step, side of centre]
  const slots: [number, number, number, number, number, 'left' | 'right' | 'bottom'][] = [
    [1180, 220, 1460, 130, 90, 'right'],
    [1180, 640, 1460, 560, 90, 'right'],
    [280, 220, -60, 130, 90, 'left'],
    [280, 640, -60, 560, 90, 'left'],
    [710, 880, 300, 1060, 0, 'bottom']
  ]

  b.frame(-100, 40, 1900, 1140, 'Everything')

  branches.forEach((branch, i) => {
    const [bx, by, lx, ly, step, side] = slots[i] as (typeof slots)[number]
    const branchId = b.rect(bx, by, 240, 64, {
      fill: branch.color,
      stroke: branch.color,
      radius: 32,
      text: branch.name,
      color: '#ffffff',
      bold: true,
      fontSize: 20
    })
    b.connect(center, branchId, {
      route: 'curved',
      stroke: branch.color,
      width: 4,
      endHead: 'none',
      fromSide: side === 'bottom' ? 'bottom' : side === 'left' ? 'left' : 'right',
      toSide: side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left'
    })
    const frameX = side === 'left' ? lx - 40 : side === 'right' ? bx - 40 : lx - 40
    const frameW = side === 'bottom' ? 1000 : 640
    const frameY = side === 'bottom' ? by - 20 : ly - 40
    b.frame(frameX, frameY, frameW, side === 'bottom' ? 260 : 300, branch.name)
    branch.leaves.forEach((leaf, j) => {
      const x = side === 'bottom' ? lx + j * 340 : lx
      const y = side === 'bottom' ? ly : ly + j * step
      const leafId = b.rect(x, y, 300, 52, {
        fill: branch.soft,
        stroke: branch.color,
        strokeWidth: 1.5,
        radius: 26,
        text: leaf,
        fontSize: 16,
        color: '#18181b'
      })
      b.connect(branchId, leafId, {
        route: side === 'bottom' ? 'straight' : 'curved',
        stroke: branch.color,
        width: 2,
        endHead: 'none',
        fromSide: side === 'bottom' ? 'bottom' : side === 'left' ? 'left' : 'right',
        toSide: side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left'
      })
    })
  })

  return b.build()
}
