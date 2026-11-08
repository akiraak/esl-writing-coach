/**
 * 段階のファイルのバイト列と表示用テキストの相互変換（純関数。ネットワークを触らない）。
 * daily-note の `src/notes/text.ts` から移植（名前だけ Note → Stage に変えた）。
 *
 * **保存で失わないものを読み込み時に控える**のがこのモジュールの責務。
 * このアプリが作るファイルは LF・BOM なしだが、`outline.txt` は daily-note のマップや
 * PC のエディタでも開けるので、そちらで保存された形式を崩さない。
 *
 * - 改行コード
 * - 末尾の改行の有無
 * - BOM の有無
 *
 * 改行コードを変えると差分が全行になり、他端末との同期でも無駄な衝突を生む。
 * 表示・編集は LF に正規化した本文で行い、**元の形式は別に持って保存時に復元する**。
 *
 * **混在ファイル（CRLF と LF が両方ある）は「CRLF を含むなら CRLF」に統一される。**
 * 全行を差分にしないための妥協で、無変更なら書き戻さないので実害は出にくい。
 * 単独の CR（旧 Mac 形式。実データには無い）はそのまま残す。
 */

export type Eol = 'lf' | 'crlf'

export interface StageTextFormat {
  /** 元の改行コード。CRLF を 1 つでも含めば 'crlf'。 */
  eol: Eol
  /** 先頭に BOM があったか。 */
  bom: boolean
  /** 末尾に改行があったか。 */
  finalNewline: boolean
}

export interface DecodedStageText {
  /** LF に正規化した本文（BOM は含まない）。 */
  text: string
  format: StageTextFormat
}

/** UTF-8 として読めないファイル。表示すると保存で壊すので、読まずに諦める。 */
export class StageTextError extends Error {
  override name = 'StageTextError'
}

const BOM = '\ufeff'

/**
 * `fatal` は壊れたバイト列を U+FFFD で握りつぶさないため（黙って壊すより読めない方がまし）。
 * `ignoreBOM` は BOM を**捨てさせない**ため（既定では剥がされるので、有無を判定できない）。
 */
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export function decodeStageText(bytes: Uint8Array): DecodedStageText {
  let raw: string
  try {
    raw = decoder.decode(bytes)
  } catch {
    throw new StageTextError('UTF-8 として読めないファイルです')
  }
  const bom = raw.startsWith(BOM)
  const body = bom ? raw.slice(BOM.length) : raw
  const eol: Eol = body.includes('\r\n') ? 'crlf' : 'lf'
  const text = body.replaceAll('\r\n', '\n')
  return { text, format: { eol, bom, finalNewline: text.endsWith('\n') } }
}

/**
 * 表示用テキストを元の形式に戻す。`decodeStageText` の結果をそのまま渡せば
 * **バイト列が完全に一致する**（混在ファイルを除く。上のコメント参照）。
 *
 * 末尾の改行は「元にあったのに消えていれば足す」だけにする。ブラウザは
 * `<textarea>` の値に改行を足さないので、末尾に改行があればそれは編集した本人の意図。
 */
export function encodeStageText(text: string, format: StageTextFormat): Buffer {
  // ブラウザから戻る本文は CRLF に正規化されている。一度 LF に揃えてから元の形式に直す
  let body = (text.startsWith(BOM) ? text.slice(BOM.length) : text).replaceAll('\r\n', '\n')
  if (format.finalNewline && body !== '' && !body.endsWith('\n')) body += '\n'
  if (format.eol === 'crlf') body = body.replaceAll('\n', '\r\n')
  return Buffer.from(format.bom ? BOM + body : body, 'utf8')
}
