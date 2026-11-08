import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeStageText, encodeStageText, StageTextError } from '../src/paragraphs/text.js'

/**
 * 改行コード・末尾改行・BOM の判定と復元。
 * **要点は「開いて何もせず保存したらバイト列が一致する」**（差分が全行になると同期で衝突する）。
 *
 * テストデータは手書きの架空データだけを使う（ノートの実データからは作らない）。
 */

/** 架空の日誌。行頭のタブや空行など、実データにありがちな形だけ真似る。 */
const LINES = ['TODO:', '\t> 洗濯機の見積もりを取る', '\to 灯油を買う', '', 'Mon:', '\t- 歯医者']

function bytes(text: string): Buffer {
  return Buffer.from(text, 'utf8')
}

/** 読み込み → 何も編集せず書き戻し。 */
function roundTrip(source: Buffer): Buffer {
  const { text, format } = decodeStageText(source)
  return encodeStageText(text, format)
}

describe('decodeStageText / encodeStageText', () => {
  it('LF のファイルを往復してもバイト列が変わらない', () => {
    const source = bytes(`${LINES.join('\n')}\n`)
    const { text, format } = decodeStageText(source)
    assert.equal(format.eol, 'lf')
    assert.equal(format.finalNewline, true)
    assert.equal(format.bom, false)
    assert.equal(text, `${LINES.join('\n')}\n`)
    assert.deepEqual(roundTrip(source), source)
  })

  it('CRLF のファイルを往復してもバイト列が変わらない', () => {
    const source = bytes(`${LINES.join('\r\n')}\r\n`)
    const { text, format } = decodeStageText(source)
    assert.equal(format.eol, 'crlf')
    // 表示・編集用は LF に正規化する
    assert.equal(text, `${LINES.join('\n')}\n`)
    assert.deepEqual(roundTrip(source), source)
  })

  it('末尾に改行が無いファイルは、無いまま書き戻す', () => {
    const source = bytes(LINES.join('\n'))
    const { format } = decodeStageText(source)
    assert.equal(format.finalNewline, false)
    assert.deepEqual(roundTrip(source), source)
  })

  it('BOM があれば本文から外し、書き戻しで戻す', () => {
    const source = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes('TODO:\n')])
    const { text, format } = decodeStageText(source)
    assert.equal(format.bom, true)
    // BOM が本文の先頭に混ざったまま表示・編集されない
    assert.equal(text, 'TODO:\n')
    assert.deepEqual(roundTrip(source), source)
  })

  it('BOM + CRLF の組み合わせも往復でバイト列が変わらない', () => {
    // BOM 有りの CRLF ファイル。既存の BOM テストは LF だけなので、2 つの形式が
    // 重なったときに往復で崩れないかを見る（表示は BOM 無し・LF に正規化される）。
    const source = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      bytes(`${LINES.join('\r\n')}\r\n`),
    ])
    const { text, format } = decodeStageText(source)
    assert.equal(format.bom, true)
    assert.equal(format.eol, 'crlf')
    assert.equal(format.finalNewline, true)
    assert.equal(text, `${LINES.join('\n')}\n`)
    assert.deepEqual(roundTrip(source), source)
  })

  it('空のファイルは 0 バイトのまま', () => {
    const source = Buffer.alloc(0)
    const { text, format } = decodeStageText(source)
    assert.equal(text, '')
    assert.equal(format.finalNewline, false)
    assert.deepEqual(roundTrip(source), source)
  })

  it('CRLF と LF の混在は CRLF に揃う（仕様。全行を差分にしないための妥協）', () => {
    const source = bytes('TODO:\r\n\to 灯油を買う\nMon:\r\n')
    const { format } = decodeStageText(source)
    assert.equal(format.eol, 'crlf')
    assert.deepEqual(roundTrip(source), bytes('TODO:\r\n\to 灯油を買う\r\nMon:\r\n'))
  })

  it('単独の CR（旧 Mac 形式）はそのまま残す', () => {
    const source = bytes('TODO:\r\to 灯油を買う\n')
    assert.deepEqual(roundTrip(source), source)
  })

  it('ブラウザが CRLF にして返しても、LF のファイルは LF で保存する', () => {
    const source = bytes('TODO:\n\to 灯油を買う\n')
    const { format } = decodeStageText(source)
    // <textarea> の値は送信時に CRLF へ正規化される
    assert.deepEqual(encodeStageText('TODO:\r\n\to 灯油を買う\r\n', format), source)
  })

  it('CRLF のファイルは、ブラウザから LF で戻っても CRLF で保存する', () => {
    const { format } = decodeStageText(bytes('TODO:\r\n'))
    assert.deepEqual(encodeStageText('TODO:\n\t- 追記\n', format), bytes('TODO:\r\n\t- 追記\r\n'))
  })

  it('元にあった末尾改行が編集で消えていれば足す', () => {
    const { format } = decodeStageText(bytes('TODO:\n'))
    assert.deepEqual(encodeStageText('TODO:', format), bytes('TODO:\n'))
  })

  it('元に末尾改行が無いファイルに、勝手に足さない（書いた改行は残す）', () => {
    const { format } = decodeStageText(bytes('TODO:'))
    assert.deepEqual(encodeStageText('TODO:', format), bytes('TODO:'))
    // 編集で足された改行は本人の意図なので消さない
    assert.deepEqual(encodeStageText('TODO:\n', format), bytes('TODO:\n'))
  })

  it('全部消したら 0 バイトにする（末尾改行だけのファイルを作らない）', () => {
    const { format } = decodeStageText(bytes('TODO:\n'))
    assert.deepEqual(encodeStageText('', format), Buffer.alloc(0))
  })

  it('BOM を二重に付けない（編集した本文の先頭に BOM が混ざっても）', () => {
    const { format } = decodeStageText(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes('TODO:\n')]),
    )
    const encoded = encodeStageText('\ufeffTODO:\n', format)
    assert.deepEqual(encoded, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes('TODO:\n')]))
  })

  it('UTF-8 として読めないファイルは StageTextError（黙って壊さない）', () => {
    // Shift_JIS の「日誌」相当。U+FFFD に化けたまま保存すると元に戻せない
    const source = Buffer.from([0x93, 0xfa, 0x8e, 0x8f, 0x0a])
    assert.throws(() => decodeStageText(source), StageTextError)
  })
})
