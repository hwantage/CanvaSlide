import type { Size } from './element-types'

/**
 * Writes PDF files whose every page is one full-bleed JPEG. That is all the PDF export needs, and
 * it keeps the format down to a handful of objects: no font programs, no colour profiles and no
 * graphics state, so the app carries no PDF library. A JPEG is also the one encoding a PDF takes
 * verbatim, so the page bytes are the bytes the canvas produced. Vector pages would change all of
 * this — they need embedded font programs, which the app only has on the desktop build.
 */

export type PdfImage = {
  /** Baseline JPEG, stored uncopied as a `/DCTDecode` stream. */
  data: Uint8Array
  /** Pixel dimensions, which a PDF image dictionary must declare even for a self-describing JPEG. */
  width: number
  height: number
}

export type PdfPage = {
  /** Page box in points, 72 to the inch. */
  size: Size
  image: PdfImage
}

export type PdfMetadata = {
  title?: string
  /** Omitted rather than defaulted to "now", so a build is reproducible. */
  createdAt?: Date
}

const encoder = new TextEncoder()

/** The file skeleton is ASCII; only string values can leave that range, and those are escaped. */
function ascii(text: string): Uint8Array {
  return encoder.encode(text)
}

/** Fixed-point with trailing zeros trimmed: PDF reals have no exponent form. */
function num(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return Number(value.toFixed(4)).toString()
}

function isPrintableAscii(text: string): boolean {
  return /^[ -~]*$/.test(text)
}

/** A PDF text string: a literal where ASCII allows it, UTF-16BE hex otherwise. */
export function pdfTextString(text: string): string {
  if (isPrintableAscii(text)) {
    return `(${text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')})`
  }
  let hex = 'FEFF'
  for (let index = 0; index < text.length; index += 1) {
    hex += text.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')
  }
  return `<${hex}>`
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

/** `D:YYYYMMDDHHmmSS+00'00'`, always in UTC so the value does not depend on the exporting machine. */
export function pdfDateString(date: Date): string {
  return (
    `D:${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}` +
    `${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}+00'00'`
  )
}

/**
 * The whole file as bytes. Objects are laid out in a fixed order — catalog, page tree, then page,
 * content stream and image per page — so the cross-reference table can be built in one pass.
 */
export function buildPdf(
  pages: readonly PdfPage[],
  metadata: PdfMetadata = {}
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  let length = 0
  const write = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? ascii(chunk) : chunk
    chunks.push(bytes)
    length += bytes.length
  }

  // Object 1 is the catalog and 2 the page tree; each page then takes three consecutive objects.
  const pageObject = (index: number) => 3 + index * 3
  const infoObject = 3 + pages.length * 3
  const offsets = new Map<number, number>()
  const beginObject = (id: number) => {
    offsets.set(id, length)
    write(`${id} 0 obj\n`)
  }
  const endObject = () => write('endobj\n')
  const stream = (id: number, dictionary: string, data: Uint8Array) => {
    beginObject(id)
    write(`<< ${dictionary} /Length ${data.length} >>\nstream\n`)
    write(data)
    write('\nendstream\n')
    endObject()
  }

  write('%PDF-1.7\n')
  // Why: the four high bytes tell tools that transfer files that this one is binary, not text.
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  beginObject(1)
  write('<< /Type /Catalog /Pages 2 0 R >>\n')
  endObject()

  beginObject(2)
  const kids = pages.map((_page, index) => `${pageObject(index)} 0 R`).join(' ')
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\n`)
  endObject()

  pages.forEach((page, index) => {
    const id = pageObject(index)
    const width = num(page.size.width)
    const height = num(page.size.height)
    beginObject(id)
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>\n`
    )
    endObject()
    // The image is drawn through a matrix that stretches the unit square over the whole page.
    stream(id + 1, '', ascii(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`))
    stream(
      id + 2,
      `/Type /XObject /Subtype /Image /Width ${page.image.width} ` +
        `/Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        '/Filter /DCTDecode',
      page.image.data
    )
  })

  const entries = ['/Producer (CanvaSlide)']
  if (metadata.title !== undefined && metadata.title !== '') {
    entries.unshift(`/Title ${pdfTextString(metadata.title)}`)
  }
  if (metadata.createdAt) {
    entries.push(`/CreationDate (${pdfDateString(metadata.createdAt)})`)
  }
  beginObject(infoObject)
  write(`<< ${entries.join(' ')} >>\n`)
  endObject()

  const startxref = length
  const count = infoObject + 1
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id += 1) {
    write(`${String(offsets.get(id) ?? 0).padStart(10, '0')} 00000 n \n`)
  }
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoObject} 0 R >>\n`)
  write(`startxref\n${startxref}\n%%EOF\n`)

  const file = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    file.set(chunk, at)
    at += chunk.length
  }
  return file
}
