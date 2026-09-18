import { emptyFigWarnings, figId } from './fig-types'

test('keeps GUID sessions distinct and creates independent import reports', () => {
  expect(figId({ sessionID: 1, localID: 23 })).not.toBe(figId({ sessionID: 12, localID: 3 }))
  const first = emptyFigWarnings()
  first.unsupported += 1
  expect(emptyFigWarnings().unsupported).toBe(0)
})
