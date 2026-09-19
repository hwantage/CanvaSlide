import { expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64 } from './binary-data'

it('round-trips binary data across encoding chunk boundaries', () => {
  const bytes = Uint8Array.from({ length: 100_001 }, (_, index) => index % 256)
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  expect(bytesToBase64(new Uint8Array())).toBe('')
  expect(() => base64ToBytes('!invalid!')).toThrow()
})

it.each([0, 1, 2, 3, 4, 255, 256, 257, 4097])(
  'matches the standard Base64 encoding at length %i',
  (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 17 + 13) % 256)
    expect(bytesToBase64(bytes)).toBe(btoa(String.fromCharCode(...bytes)))
  }
)
