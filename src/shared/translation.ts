/**
 * 下書きの日本語訳（DB の `translations` に JSON で持つ。`docs/plans/archive/draft-translation.md`）。サーバとブラウザで共有する。
 *
 * - 文ごとの「英文（本文そのまま）と訳」。文に分けるのはアプリ（`counting.ts` の `splitSentences`）
 * - 訳は直訳に近いもの（英語に書いてあるとおり。言いたいことが伝わっているかを確かめるため）
 * - 最新の 1 回分だけを持つ。訳した下書きの本文も入れ、後で本文が変わったか比べる
 */

export interface TranslatedSentence {
  /** 本文の 1 文（そのまま）。 */
  en: string
  /** その文の訳（日本語）。AI が返さなかったら空。 */
  ja: string
}

export interface Translation {
  version: 1
  /** 訳した時刻（ISO8601）。 */
  translatedAt: string
  /** 訳した下書きの本文。 */
  draft: string
  /** 訳したときのタイトルとその訳（STEP 3 のタイトルの欄。無ければ null。古い結果にも無い）。 */
  title: TranslatedSentence | null
  sentences: TranslatedSentence[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 保存した訳の JSON を読む。形が合わなければ null（手で壊しても画面は落とさない）。 */
export function parseTranslation(text: string): Translation | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['sentences'])) return null
  return {
    version: 1,
    translatedAt: typeof value['translatedAt'] === 'string' ? value['translatedAt'] : '',
    draft: typeof value['draft'] === 'string' ? value['draft'] : '',
    title:
      isRecord(value['title']) && typeof value['title']['en'] === 'string'
        ? {
            en: value['title']['en'],
            ja: typeof value['title']['ja'] === 'string' ? value['title']['ja'] : '',
          }
        : null,
    sentences: value['sentences'].flatMap((s): TranslatedSentence[] =>
      isRecord(s) && typeof s['en'] === 'string'
        ? [{ en: s['en'], ja: typeof s['ja'] === 'string' ? s['ja'] : '' }]
        : [],
    ),
  }
}
