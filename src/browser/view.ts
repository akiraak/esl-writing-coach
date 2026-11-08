import type { Route } from '../shared/route.js'

/** 1 つの画面。画面を切り替えるときに `dispose()` を呼ぶ（未保存があれば保存する）。 */
export interface View {
  /**
   * この画面のまま移れるなら移って true（編集画面の中で段階を移るときなど）。
   * false なら画面を作り直す。
   */
  navigate?(route: Route): boolean
  dispose(): Promise<void> | void
  /** 保存していない変更があるか（タブを閉じるときの確認に使う）。 */
  hasUnsavedChanges(): boolean
  /** 未保存があれば今すぐ保存する。 */
  flush(): Promise<void>
}

export const STATIC_VIEW: View = {
  dispose() {},
  hasUnsavedChanges: () => false,
  flush: () => Promise.resolve(),
}
