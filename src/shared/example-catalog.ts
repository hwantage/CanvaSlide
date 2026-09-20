export const MAX_EXAMPLE_BYTES = 25 * 1024 * 1024

export const exampleCatalog = [
  { id: 'one-order', source: 'showcase/one-order.canvaslide' },
  { id: 'freefall', source: 'showcase/freefall.canvaslide' },
  { id: 'inside', source: 'anatomy/inside.canvaslide' },
  { id: 'swing', source: 'swing/the-swing.canvaslide' },
  { id: 'anatomy', source: 'anatomy/the-body.canvaslide' },
  { id: 'flowchart', source: 'flowchart/order-fulfillment.canvaslide' },
  { id: 'erd', source: 'erd/shop-schema.canvaslide' },
  { id: 'slides', source: 'slides/northwind-launch-deck.canvaslide' },
  { id: 'architecture', source: 'architecture/shop-platform.canvaslide' },
  { id: 'mindmap', source: 'mindmap/product-strategy-2027.canvaslide' }
] as const

export type ExampleId = (typeof exampleCatalog)[number]['id']

export function findExample(id: string) {
  return exampleCatalog.find((example) => example.id === id)
}

export function exampleAssetPath(id: ExampleId): string {
  return `examples/${id}.canvaslide`
}
