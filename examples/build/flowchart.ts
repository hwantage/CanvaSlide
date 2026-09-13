import { DocBuilder, muted } from './builder.ts'

const process = { fill: '#eef2ff', stroke: '#6366f1', bold: true }
const decision = { fill: '#fffbeb', stroke: '#f59e0b', bold: true, fontSize: 15 }
const terminal = { fill: '#ecfdf5', stroke: '#10b981', bold: true, radius: 999 }
const exception = { fill: '#fff1f2', stroke: '#f43f5e', bold: true }
const arrow = '#52525b'

/** Vertical order-fulfilment flowchart with a happy path, two decisions and exception loops. */
export function buildFlowchart() {
  const b = new DocBuilder('Order Fulfillment Flow', { frameBorder: 'dashed' })
  const cx = 390

  b.text(80, 20, 'Order Fulfillment Flow', { fontSize: 32, bold: true })
  b.text(80, 68, 'From checkout to doorstep · exceptions branch to the right', {
    fontSize: 16,
    color: muted
  })

  b.frame(330, 120, 900, 380, 'Intake')
  b.frame(330, 520, 900, 260, 'Fulfilment')
  b.frame(330, 800, 900, 300, 'Delivery')

  const start = b.ellipse(cx, 140, 220, 64, { ...terminal, text: 'Order received' })
  const validate = b.rect(cx, 250, 220, 64, { ...process, text: 'Validate payment' })
  const paymentOk = b.diamond(cx - 10, 360, 240, 110, { ...decision, text: 'Payment OK?' })
  const notify = b.rect(720, 383, 220, 64, { ...exception, text: 'Notify customer' })
  const cancelled = b.ellipse(990, 387, 210, 56, {
    ...terminal,
    fill: '#fff1f2',
    stroke: '#f43f5e',
    text: 'Order cancelled'
  })

  const reserve = b.rect(cx, 540, 220, 64, { ...process, text: 'Reserve inventory' })
  const inStock = b.diamond(cx - 10, 640, 240, 110, { ...decision, text: 'In stock?' })
  const backorder = b.rect(720, 663, 220, 64, { ...exception, text: 'Create backorder' })

  const pick = b.rect(cx, 820, 220, 64, { ...process, text: 'Pick & pack' })
  const ship = b.rect(cx, 920, 220, 64, { ...process, text: 'Ship via carrier' })
  const done = b.ellipse(cx, 1020, 220, 64, { ...terminal, text: 'Delivered' })

  b.connect(start, validate, { stroke: arrow })
  b.connect(validate, paymentOk, { stroke: arrow })
  b.connect(paymentOk, reserve, { stroke: arrow, label: 'yes' })
  b.connect(paymentOk, notify, {
    stroke: '#f43f5e',
    label: 'no',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(notify, cancelled, { stroke: '#f43f5e', fromSide: 'right', toSide: 'left' })
  b.connect(notify, validate, {
    stroke: '#f43f5e',
    dashed: true,
    route: 'curved',
    label: 'retry\u00a0≤\u00a03×',
    fromSide: 'top',
    toSide: 'right'
  })
  b.connect(reserve, inStock, { stroke: arrow })
  b.connect(inStock, pick, { stroke: arrow, label: 'yes' })
  b.connect(inStock, backorder, {
    stroke: '#f59e0b',
    label: 'no',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(backorder, reserve, {
    stroke: '#f59e0b',
    dashed: true,
    route: 'curved',
    label: 'restocked',
    fromSide: 'top',
    toSide: 'right'
  })
  b.connect(pick, ship, { stroke: arrow })
  b.connect(ship, done, { stroke: arrow })

  b.text(80, 380, 'Payment retries are\nspaced 8 hours apart.', { fontSize: 13, color: muted })
  b.text(80, 660, 'Backorders notify the\ncustomer with an ETA.', { fontSize: 13, color: muted })
  b.text(80, 930, 'Carrier webhook flips\nthe order to Delivered.', { fontSize: 13, color: muted })

  return b.build()
}
