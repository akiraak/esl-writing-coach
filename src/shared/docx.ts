import { hasTitleGap, type SubmissionDocument } from './document.js'

/**
 * 提出用の文書を .docx（Word）のバイト列にする（`docs/plans/archive/docx-pdf-export.md`）。純関数。ライブラリは使わない。
 *
 * - 最小の OOXML: `[Content_Types].xml`・`_rels/.rels`・`word/document.xml`・`word/styles.xml`
 * - 体裁: A4・余白 1 インチ・Times New Roman 12pt・行間 2 行。頭の行は左寄せ、タイトルは中央、本文は段落の頭を 0.5 インチ下げる
 * - フォントと行間は、文書の既定（`styles.xml`）に加えて**段落・文字ごとにも書く**（2026-11-12。既定だけだと、
 *   開くアプリによっては読まれず、そのアプリの既定のフォント・行間になることがあるため）
 * - ZIP は無圧縮（stored）で詰める（CRC32 は自前）
 */

/** XML 1.0 で使える文字か（タブ・改行・復帰以外の C0 制御文字は使えない）。 */
const allowedInXml = (ch: string) => {
  const code = ch.charCodeAt(0)
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

const escapeXml = (text: string) =>
  Array.from(text)
    .filter(allowedInXml)
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** 文字の書式: Times New Roman 12pt（sz は半ポイント）。 */
const FONT =
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="MS Mincho"/><w:sz w:val="24"/><w:szCs w:val="24"/>'
const RUN_PROPS = `<w:rPr>${FONT}</w:rPr>`
/** 段落の書式: 行間 2 行（line 480 = 240 × 2）・段落の前後の空きなし。 */
const SPACING = '<w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/>'

/** 1 段落。`jc` は揃え、`indent` は段落の頭の下げ（twip。1 インチ = 1440）。 */
function paragraph(
  text: string,
  options: { jc?: 'left' | 'center'; indent?: number } = {},
): string {
  // 並びは OOXML の決まり（spacing → ind → jc → rPr）。rPr は段落の印（空の行の高さ）にも効かせる
  const props = [
    SPACING,
    options.indent ? `<w:ind w:firstLine="${options.indent}"/>` : '',
    options.jc === 'center' ? '<w:jc w:val="center"/>' : '',
    RUN_PROPS,
  ].join('')
  return `<w:p><w:pPr>${props}</w:pPr><w:r>${RUN_PROPS}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

export function documentXml(doc: SubmissionDocument): string {
  const body = [
    ...doc.header.map((line) => paragraph(line)),
    // 頭の行とタイトルの間を 1 行空ける
    hasTitleGap(doc) ? paragraph('') : '',
    doc.title === '' ? '' : paragraph(doc.title, { jc: 'center' }),
    ...doc.paragraphs.map((p) => paragraph(p, { indent: 720 })),
  ].join('')
  // A4（11906 x 16838 twip）・余白 1 インチ
  const section =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W_NS}"><w:body>${body}${section}</w:body></w:document>`
}

/** 既定の書式: Times New Roman 12pt（sz は半ポイント）・行間 2 行（line 480）・段落の後ろの空きなし。 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:lang w:val="en-US" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${SPACING}</w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr>${SPACING}</w:pPr>${RUN_PROPS}</w:style></w:styles>`

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

// --- 無圧縮の ZIP ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** ファイル名と中身の並びを、無圧縮の ZIP にする。日時は 1980-01-01 に固定（中身が同じなら同じバイト列）。 */
export function zipStored(
  files: readonly { name: string; data: Uint8Array }[],
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // 展開に要るバージョン
    lv.setUint16(6, 0x0800, true) // 名前は UTF-8
    lv.setUint16(8, 0, true) // 無圧縮
    lv.setUint16(10, 0, true) // 時刻
    lv.setUint16(12, 0x21, true) // 日付 1980-01-01
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    locals.push(local, file.data)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length + size
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

export function buildDocx(doc: SubmissionDocument): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  return zipStored([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'word/document.xml', data: encoder.encode(documentXml(doc)) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOCUMENT_RELS_XML) },
    { name: 'word/styles.xml', data: encoder.encode(STYLES_XML) },
  ])
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function docxFileName(id: string): string {
  return `${id}.docx`
}
