import { compileSchema, parseSchema } from 'kiwi-schema'
import { decodeFigMessage } from './fig-kiwi'

test('interprets primitive fields, structs, enums, arrays and 64-bit values without evaluating code', () => {
  const schema = parseSchema(`
    enum Kind { ONE = 1; TWO = 2; }
    struct Point { float x; float y; }
    message Message { Kind kind = 1; Point[] points = 2; byte[] bytes = 3; string name = 4; bool visible = 5; int signed = 6; uint unsigned = 7; int64 large = 8; uint64 positive = 9; }
  `)
  const expected = {
    kind: 'TWO',
    points: [{ x: 1.5, y: -2 }],
    bytes: new Uint8Array([1, 255]),
    name: '한글',
    visible: false,
    signed: -12,
    unsigned: 400,
    large: -9007199254740993n,
    positive: 9007199254740993n
  }
  const bytes = compileSchema(schema).encodeMessage(expected)
  const blocked = vi.spyOn(globalThis, 'Function').mockImplementation(() => {
    throw new Error('CSP')
  })
  try {
    expect(decodeFigMessage(schema, bytes)).toEqual(expected)
  } finally {
    blocked.mockRestore()
  }
})

test('rejects unknown tags and oversized arrays before allocating', () => {
  const schema = parseSchema('message Message { uint[] values = 1; }')
  expect(() => decodeFigMessage(schema, new Uint8Array([2, 0]))).toThrow('FIG_SCHEMA')
  expect(() => decodeFigMessage(schema, new Uint8Array([1, 255, 255, 255, 255, 15]))).toThrow(
    'FIG_LIMIT'
  )
})
