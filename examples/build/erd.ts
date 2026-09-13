import { DocBuilder, muted } from './builder.ts'

type Column = [key: 'PK' | 'FK' | '', name: string, type: string]

const ENTITY_WIDTH = 260
const HEADER = 38
const ROW = 18.2

const accents = {
  customer: { fill: '#4f46e5', stroke: '#3730a3' },
  order: { fill: '#059669', stroke: '#047857' },
  catalog: { fill: '#d97706', stroke: '#b45309' },
  payment: { fill: '#e11d48', stroke: '#be123c' }
} as const

/** Header band + squared-off filler + body so the table reads like a classic ERD box. */
function entity(
  b: DocBuilder,
  x: number,
  y: number,
  name: string,
  columns: Column[],
  accent: { fill: string; stroke: string }
): string {
  const height = Math.ceil(HEADER + 12 + columns.length * ROW + 14)
  const body = b.rect(x, y, ENTITY_WIDTH, height, {
    fill: '#ffffff',
    stroke: accent.stroke,
    radius: 8
  })
  b.rect(x, y, ENTITY_WIDTH, HEADER, { fill: accent.fill, stroke: accent.stroke, radius: 8 })
  b.rect(x, y + HEADER / 2, ENTITY_WIDTH, HEADER / 2, {
    fill: accent.fill,
    stroke: accent.stroke,
    radius: 0
  })
  b.text(x, y + 8, name, {
    fontSize: 15,
    bold: true,
    color: '#ffffff',
    align: 'center',
    width: ENTITY_WIDTH
  })
  const keys = columns.map(([key]) => key.padEnd(2, ' ')).join('\n')
  const names = columns.map(([, column]) => column).join('\n')
  const types = columns.map(([, , type]) => type).join('\n')
  b.text(x + 12, y + HEADER + 12, keys, { fontSize: 13, bold: true, color: accent.fill, width: 28 })
  b.text(x + 42, y + HEADER + 12, names, { fontSize: 13, width: 130 })
  b.text(x + 172, y + HEADER + 12, types, { fontSize: 13, color: muted, width: 80 })
  return body
}

/** E-commerce schema: seven tables, cardinality on every relationship. */
export function buildErd() {
  const b = new DocBuilder('Shop Schema (ERD)', { background: 'grid' })

  b.text(80, 20, 'Shop Schema', { fontSize: 32, bold: true })
  b.text(80, 68, 'Entity-relationship diagram · PK = primary key, FK = foreign key', {
    fontSize: 16,
    color: muted
  })

  b.frame(40, 120, 1180, 920, 'Whole schema')
  b.frame(60, 160, 360, 560, 'Customer')
  b.frame(440, 160, 760, 560, 'Order pipeline')
  b.frame(840, 460, 360, 560, 'Catalog')

  const customers = entity(
    b,
    100,
    180,
    'customers',
    [
      ['PK', 'id', 'uuid'],
      ['', 'email', 'text'],
      ['', 'full_name', 'text'],
      ['', 'created_at', 'timestamp']
    ],
    accents.customer
  )
  const addresses = entity(
    b,
    100,
    480,
    'addresses',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'customer_id', 'uuid'],
      ['', 'line1', 'text'],
      ['', 'city', 'text'],
      ['', 'country', 'char(2)'],
      ['', 'is_default', 'boolean']
    ],
    accents.customer
  )
  const orders = entity(
    b,
    480,
    180,
    'orders',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'customer_id', 'uuid'],
      ['FK', 'ship_to_id', 'uuid'],
      ['', 'status', 'enum'],
      ['', 'total_cents', 'integer'],
      ['', 'placed_at', 'timestamp']
    ],
    accents.order
  )
  const orderItems = entity(
    b,
    480,
    500,
    'order_items',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'order_id', 'uuid'],
      ['FK', 'product_id', 'uuid'],
      ['', 'quantity', 'integer'],
      ['', 'unit_cents', 'integer']
    ],
    accents.order
  )
  const payments = entity(
    b,
    880,
    180,
    'payments',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'order_id', 'uuid'],
      ['', 'provider', 'text'],
      ['', 'amount_cents', 'integer'],
      ['', 'captured_at', 'timestamp']
    ],
    accents.payment
  )
  const categories = entity(
    b,
    880,
    780,
    'categories',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'parent_id', 'uuid?'],
      ['', 'slug', 'text'],
      ['', 'name', 'text']
    ],
    accents.catalog
  )
  const products = entity(
    b,
    880,
    480,
    'products',
    [
      ['PK', 'id', 'uuid'],
      ['FK', 'category_id', 'uuid'],
      ['', 'sku', 'text'],
      ['', 'name', 'text'],
      ['', 'price_cents', 'integer'],
      ['', 'active', 'boolean']
    ],
    accents.catalog
  )

  const rel = { stroke: '#52525b', fontSize: 13, color: '#18181b' }
  b.connect(customers, addresses, {
    ...rel,
    label: '1\u00a0:\u00a0N',
    fromSide: 'bottom',
    toSide: 'top'
  })
  b.connect(customers, orders, {
    ...rel,
    label: '1\u00a0:\u00a0N',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(addresses, orders, {
    ...rel,
    label: 'ship_to',
    dashed: true,
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(orders, orderItems, {
    ...rel,
    label: '1\u00a0:\u00a0N',
    fromSide: 'bottom',
    toSide: 'top'
  })
  b.connect(orders, payments, {
    ...rel,
    label: '1\u00a0:\u00a01',
    fromSide: 'right',
    toSide: 'left'
  })
  b.connect(products, orderItems, {
    ...rel,
    label: '1\u00a0:\u00a0N',
    fromSide: 'left',
    toSide: 'right'
  })
  b.connect(categories, products, {
    ...rel,
    label: '1\u00a0:\u00a0N',
    fromSide: 'top',
    toSide: 'bottom'
  })
  b.text(880, 990, 'parent_id → categories.id (self-reference)', { fontSize: 12, color: muted })

  return b.build()
}
