import { DocBuilder, muted } from './builder.ts'

const node = { fill: '#ffffff', strokeWidth: 2, bold: true, fontSize: 15, radius: 12 }
const zones = {
  clients: { fill: '#f8fafc', stroke: '#cbd5e1', label: '#475569' },
  edge: { fill: '#f0f9ff', stroke: '#7dd3fc', label: '#0369a1' },
  services: { fill: '#f5f3ff', stroke: '#c4b5fd', label: '#6d28d9' },
  data: { fill: '#fefce8', stroke: '#fde047', label: '#a16207' }
} as const

function zone(
  b: DocBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  kind: keyof typeof zones
) {
  const z = zones[kind]
  b.rect(x, y, w, h, { fill: z.fill, stroke: z.stroke, strokeWidth: 1.5, radius: 18 })
  b.text(x + 20, y + 14, name.toUpperCase(), { fontSize: 12, bold: true, color: z.label })
}

/** Request path left to right: clients → edge → services → data, with an async event lane. */
export function buildArchitecture() {
  const b = new DocBuilder('Cloud Architecture')

  b.text(80, 20, 'Shop Platform · System Architecture', { fontSize: 32, bold: true })
  b.text(80, 68, 'Synchronous request path in solid lines, asynchronous events dashed', {
    fontSize: 16,
    color: muted
  })

  b.frame(40, 120, 1500, 770, 'Overview')
  b.frame(60, 160, 620, 710, 'Edge')
  b.frame(700, 160, 380, 710, 'Services')
  b.frame(1100, 160, 420, 710, 'Data')

  zone(b, 80, 160, 220, 420, 'Clients', 'clients')
  zone(b, 340, 160, 320, 420, 'Edge', 'edge')
  zone(b, 720, 160, 340, 680, 'Services', 'services')
  zone(b, 1120, 160, 380, 680, 'Data', 'data')

  const web = b.rect(110, 220, 160, 64, { ...node, stroke: '#94a3b8', text: '🌐 Web app' })
  const mobile = b.rect(110, 330, 160, 64, { ...node, stroke: '#94a3b8', text: '📱 Mobile app' })
  const partner = b.rect(110, 440, 160, 64, { ...node, stroke: '#94a3b8', text: '🤝 Partner API' })

  const cdn = b.rect(380, 220, 240, 64, { ...node, stroke: '#0ea5e9', text: '🛰️ CDN + WAF' })
  const gateway = b.rect(380, 330, 240, 64, { ...node, stroke: '#0ea5e9', text: '🚪 API Gateway' })
  const auth = b.rect(380, 440, 240, 64, { ...node, stroke: '#0ea5e9', text: '🔐 Auth (OIDC)' })

  const catalog = b.rect(760, 220, 260, 64, {
    ...node,
    stroke: '#8b5cf6',
    text: '📚 Catalog service'
  })
  const inventory = b.rect(760, 330, 260, 64, {
    ...node,
    stroke: '#8b5cf6',
    text: '📦 Inventory service'
  })
  const orders = b.rect(760, 440, 260, 64, {
    ...node,
    stroke: '#8b5cf6',
    text: '🧾 Orders service'
  })
  const queue = b.rect(760, 620, 260, 64, {
    ...node,
    stroke: '#8b5cf6',
    fill: '#ede9fe',
    radius: 32,
    text: '📨 Event bus (Kafka)'
  })
  const notifier = b.rect(760, 740, 260, 64, {
    ...node,
    stroke: '#8b5cf6',
    text: '✉️ Notification worker'
  })

  const redis = b.rect(1160, 220, 300, 64, { ...node, stroke: '#ca8a04', text: '⚡ Redis cache' })
  const replica = b.rect(1160, 330, 300, 64, {
    ...node,
    stroke: '#ca8a04',
    text: '🗄️ Postgres (read replica)'
  })
  const postgres = b.rect(1160, 440, 300, 64, {
    ...node,
    stroke: '#ca8a04',
    text: '🗄️ Postgres (primary)'
  })
  const warehouse = b.rect(1160, 620, 300, 64, {
    ...node,
    stroke: '#ca8a04',
    text: '📊 Analytics warehouse'
  })
  const storage = b.rect(1160, 740, 300, 64, {
    ...node,
    stroke: '#ca8a04',
    text: '🪣 Object storage'
  })

  const sync = { stroke: '#475569', width: 2 }
  const async = { stroke: '#7c3aed', width: 2, dashed: true }

  b.connect(web, cdn, { ...sync, label: 'HTTPS', fromSide: 'right', toSide: 'left' })
  b.connect(mobile, gateway, { ...sync, label: 'HTTPS', fromSide: 'right', toSide: 'left' })
  b.connect(partner, gateway, { ...sync, label: 'mTLS', fromSide: 'right', toSide: 'left' })
  b.connect(cdn, gateway, { ...sync, fromSide: 'bottom', toSide: 'top' })
  b.connect(gateway, auth, {
    ...sync,
    label: 'verify\u00a0JWT',
    fromSide: 'bottom',
    toSide: 'top',
    startHead: 'arrow'
  })
  b.connect(gateway, catalog, { ...sync, fromSide: 'right', toSide: 'left' })
  b.connect(gateway, inventory, { ...sync, label: 'gRPC', fromSide: 'right', toSide: 'left' })
  b.connect(gateway, orders, { ...sync, fromSide: 'right', toSide: 'left' })
  b.connect(orders, inventory, {
    ...sync,
    label: 'reserve\u00a0stock',
    fromSide: 'top',
    toSide: 'bottom'
  })

  b.connect(catalog, redis, { ...sync, label: 'cache', fromSide: 'right', toSide: 'left' })
  b.connect(catalog, replica, {
    ...sync,
    label: 'reads',
    route: 'curved',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(inventory, postgres, { ...sync, route: 'curved', fromSide: 'right', toSide: 'left' })
  b.connect(orders, postgres, { ...sync, label: 'writes', fromSide: 'right', toSide: 'left' })
  b.connect(postgres, replica, {
    ...sync,
    label: 'replication',
    dashed: true,
    fromSide: 'top',
    toSide: 'bottom'
  })

  b.connect(orders, queue, { ...async, label: 'order.placed', fromSide: 'bottom', toSide: 'top' })
  b.connect(queue, notifier, { ...async, fromSide: 'bottom', toSide: 'top' })
  b.connect(queue, warehouse, {
    ...async,
    label: 'CDC\u00a0stream',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(notifier, storage, {
    ...async,
    label: 'receipts\u00a0(PDF)',
    fromSide: 'right',
    toSide: 'left'
  })

  return b.build()
}
