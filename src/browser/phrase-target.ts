/**
 * 表現集から入れる先（下書きの本文の欄）。下書きの画面が開いている間だけ登録する（`docs/plans/archive/insert-phrase.md`）。
 * 右ペインの表現集はこれを見て、押された表現を入れる。
 */

type Insert = (phrase: string) => void

let target: Insert | null = null

/** 入れる先を登録し、外す関数を返す（段階を移るとき・画面を離れるときに呼ぶ）。 */
export function setPhraseTarget(insert: Insert): () => void {
  target = insert
  return () => {
    if (target === insert) target = null
  }
}

/** 入れる先があれば入れて true。無ければ false。 */
export function insertPhrase(phrase: string): boolean {
  if (target === null) return false
  target(phrase)
  return true
}
