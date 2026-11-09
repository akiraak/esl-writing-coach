import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inflateRawSync } from 'node:zlib'
import { documentOf, formatSubmissionDate, paragraphsOf } from '../src/shared/document.js'
import { buildDocx, crc32, documentXml, zipStored } from '../src/shared/docx.js'

/** テスト用の小さな ZIP の読み手（中央ディレクトリから辿り、CRC も確かめる）。 */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    assert.equal(view.getUint32(local, true), 0x04034b50)
    const localNameLength = view.getUint16(local + 26, true)
    const start = local + 30 + localNameLength
    let data = bytes.subarray(start, start + size)
    if (method === 8) data = inflateRawSync(data)
    assert.equal(crc32(data), crc, `${name} の CRC`)
    files.set(name, new TextDecoder().decode(data))
    at += 46 + nameLength
  }
  return files
}

describe('文書の形', () => {
  it('空行で段落を分け、段落の中の改行は空白に直す', () => {
    assert.deepEqual(paragraphsOf('First line\nsame paragraph.\n\n\nSecond.\r\n \nThird.  '), [
      'First line same paragraph.',
      'Second.',
      'Third.',
    ])
    assert.deepEqual(paragraphsOf('  \n\n '), [])
  })

  it('頭の行は入れたものだけ', () => {
    const doc = documentOf({
      theme: ' T ',
      draft: 'A.',
      name: 'Akira',
      klass: ' ',
      date: 'November 8, 2026',
    })
    assert.deepEqual(doc, { header: ['Akira', 'November 8, 2026'], title: 'T', paragraphs: ['A.'] })
  })

  it('日付は November 8, 2026 の形', () => {
    assert.equal(formatSubmissionDate(new Date(2026, 10, 8)), 'November 8, 2026')
    assert.equal(formatSubmissionDate(new Date(2027, 0, 31)), 'January 31, 2027')
  })
})

describe('.docx', () => {
  it('CRC32 は既知の値', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
    assert.equal(crc32(new Uint8Array()), 0)
  })

  it('無圧縮の ZIP を読み戻せる', () => {
    const files = unzip(
      zipStored([
        { name: 'a.txt', data: new TextEncoder().encode('hello') },
        { name: '日本語/b.txt', data: new TextEncoder().encode('こんにちは') },
      ]),
    )
    assert.deepEqual(
      [...files.entries()],
      [
        ['a.txt', 'hello'],
        ['日本語/b.txt', 'こんにちは'],
      ],
    )
  })

  it('必要な部品がそろい、本文の XML にタイトル（中央）・頭の行・段落（頭を下げる）が入る', () => {
    const doc = { header: ['Akira'], title: 'Should we?', paragraphs: ['I agree.', 'Second.'] }
    const files = unzip(buildDocx(doc))
    assert.deepEqual(
      [...files.keys()],
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/_rels/document.xml.rels',
        'word/styles.xml',
      ],
    )
    const xml = files.get('word/document.xml') ?? ''
    assert.ok(xml.includes('<w:t xml:space="preserve">Akira</w:t>'))
    assert.ok(
      xml.includes('<w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Should we?</w:t>'),
    )
    assert.equal(xml.match(/<w:ind w:firstLine="720"\/>/g)?.length, 2)
    assert.ok((files.get('word/styles.xml') ?? '').includes('w:line="480"'))
    assert.ok((files.get('word/styles.xml') ?? '').includes('Times New Roman'))
  })

  it('XML の特別な文字はエスケープし、使えない制御文字は落とす', () => {
    const xml = documentXml({ header: [], title: '', paragraphs: ['A & B <c> "d"\u0001'] })
    assert.ok(xml.includes('A &amp; B &lt;c&gt; &quot;d&quot;</w:t>'))
    // タイトルが空ならタイトルの段落は作らない
    assert.equal(xml.match(/<w:p>/g)?.length, 1)
  })
})
