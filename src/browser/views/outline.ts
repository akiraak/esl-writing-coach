import { h, replace } from '../dom.js'
import { mountMap } from '../map.js'
import type { StageEditor } from '../stage-editor.js'

/**
 * STEP 3 アウトライン: マインドマップで骨組みを作る（`outline.txt`。正は字下げのテキスト、図はその見え方）。
 * 中心 = 意見（topic sentence の元）、子 = 理由、孫 = 例・詳細、最後に結論（`CLAUDE.md` の「書く流れ」）。
 *
 * 構成の役割の色はまだ付けない（深さ → 役割の規則、とくに結論の見分け方は下書きのタスクで決める）。
 */

export interface OutlineViewOptions {
  editor: StageEditor
  /** 課題のテーマ（仮の中心の名前に使う）。 */
  theme: string
}

/** 描いて、片付けの関数を返す（段階を移る・画面を離れるときに呼ぶ）。 */
export function renderOutlineView(container: HTMLElement, options: OutlineViewOptions): () => void {
  const host = h('div', { class: 'map-host' })
  replace(
    container,
    h(
      'div',
      { class: 'outline-view' },
      h(
        'div',
        { class: 'outline-legend' },
        h('span', {}, h('b', {}, '中心'), ' 意見（topic sentence の元）'),
        h('span', {}, h('b', {}, '子'), ' 理由'),
        h('span', {}, h('b', {}, '孫'), ' 例・詳細'),
        h('span', {}, h('b', {}, '最後'), ' 結論'),
      ),
      host,
    ),
  )
  const map = mountMap(host, {
    text: options.editor.text,
    title: options.theme === '' ? '意見' : options.theme,
    centerPlaceholder: '意見（topic sentence の元）',
    onChange: (text) => options.editor.update(text),
  })
  return () => map.destroy()
}
