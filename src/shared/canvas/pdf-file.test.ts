import { describe, expect, it } from 'vitest'
import { buildPdf, pdfDateString, pdfTextString, type PdfPage } from './pdf-file'

const decoder = new TextDecoder('latin1')

function page(width: number, height: number, data = new Uint8Array([1, 2, 3])): PdfPage {
  return { size: { width, height }, image: { data, width: 2, height: 1 } }
}

/** Reads the cross-reference table back the way a PDF reader does. */
function xrefOffsets(file: Uint8Array): number[] {
  const text = decoder.decode(file)
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
  const table = text.slice(startxref)
  expect(table.startsWith('xref\n')).toBe(true)
  return [...table.matchAll(/^(\d{10}) \d{5} n $/gm)].map((match) => Number(match[1]))
}

describe('buildPdf', () => {
  it('writes one page object per page, each with its own media box', () => {
    const text = decoder.decode(buildPdf([page(960, 540), page(540, 960)]))
    expect(text.startsWith('%PDF-1.7\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect([...text.matchAll(/\/Type \/Page\b(?!s)/g)]).toHaveLength(2)
    expect(text).toContain('/MediaBox [0 0 960 540]')
    expect(text).toContain('/MediaBox [0 0 540 960]')
    expect(text).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2')
  })

  it('points every cross-reference entry at the object it numbers', () => {
    const file = buildPdf([page(960, 540), page(540, 960), page(700, 700)])
    const text = decoder.decode(file)
    const offsets = xrefOffsets(file)
    expect(offsets).toHaveLength(Number(/\/Size (\d+)/.exec(text)![1]) - 1)
    offsets.forEach((offset, index) => {
      expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj\n`))
    })
  })

  it('draws the image over the whole page through the content stream', () => {
    const text = decoder.decode(buildPdf([page(960, 540)]))
    expect(text).toContain('q 960 0 0 540 0 0 cm /Im0 Do Q')
    expect(text).toContain('/Resources << /XObject << /Im0 5 0 R >> >>')
  })

  it('carries the encoded JPEG bytes through untouched', () => {
    const data = new Uint8Array([0xff, 0xd8, 0x00, 0x0a, 0x25, 0xff, 0xd9])
    const file = buildPdf([page(960, 540, data)])
    const text = decoder.decode(file)
    const start = text.indexOf('/Filter /DCTDecode')
    const stream = text.indexOf('stream\n', start) + 'stream\n'.length
    expect(file.slice(stream, stream + data.length)).toEqual(data)
    expect(text).toContain(`/Length ${data.length}`)
  })

  it('declares the image dictionary a PDF reader needs even for a self-describing JPEG', () => {
    const text = decoder.decode(
      buildPdf([
        {
          size: { width: 100, height: 50 },
          image: { data: new Uint8Array(6), width: 4, height: 3 }
        }
      ])
    )
    expect(text).toContain('/Width 4 /Height 3 /ColorSpace /DeviceRGB /BitsPerComponent 8')
    expect(text).toContain('/Filter /DCTDecode')
  })

  it('rounds page boxes to what a PDF real can express', () => {
    expect(decoder.decode(buildPdf([page(960.000_04, 539.123_456)]))).toContain(
      '/MediaBox [0 0 960 539.1235]'
    )
  })

  it('writes metadata only when it was given', () => {
    const bare = decoder.decode(buildPdf([page(960, 540)]))
    expect(bare).toContain('/Producer (CanvaSlide)')
    expect(bare).not.toContain('/Title')
    expect(bare).not.toContain('/CreationDate')
    const titled = decoder.decode(
      buildPdf([page(960, 540)], {
        title: 'Q3 (draft)',
        createdAt: new Date('2026-09-22T01:02:03Z')
      })
    )
    expect(titled).toContain('/Title (Q3 \\(draft\\))')
    expect(titled).toContain("/CreationDate (D:20260922010203+00'00')")
  })

  it('writes a well-formed empty page tree rather than failing on no pages', () => {
    const text = decoder.decode(buildPdf([]))
    expect(text).toContain('/Type /Pages /Kids [] /Count 0')
    expect(xrefOffsets(buildPdf([]))).toHaveLength(3)
  })
})

describe('pdfTextString', () => {
  it('escapes the characters that would close a literal string early', () => {
    expect(pdfTextString('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)')
  })

  it('switches to UTF-16BE once the text leaves ASCII', () => {
    expect(pdfTextString('한글')).toBe('<FEFFD55CAE00>')
    expect(pdfTextString('café')).toBe('<FEFF00630061006600E9>')
  })
})

describe('pdfDateString', () => {
  it('writes the timestamp in UTC so the file does not depend on the exporting machine', () => {
    expect(pdfDateString(new Date('2026-01-05T09:08:07Z'))).toBe("D:20260105090807+00'00'")
  })
})
