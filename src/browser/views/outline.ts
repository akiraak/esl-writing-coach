import { checkOutline } from '../../shared/outline-checks.js'
import { h, replace } from '../dom.js'
import { mountMap } from '../map.js'
import type { StageEditor } from '../stage-editor.js'

/**
 * STEP 3 アウトライン: マインドマップで骨組みを作る（`outline.txt`。正は字下げのテキスト、図はその見え方）。
 * 中心 = 意見（topic sentence の元）、子 = 理由、孫 = 例・詳細、最後に結論（`CLAUDE.md` の「書く流れ」）。
 *
 * 早見の下に型のチェック（意見・理由の数・例・結論。AI なし。`src/shared/outline-checks.ts`）を出し、マップを直すたびに更新する。
 */

export interface OutlineViewOptions {
  editor: StageEditor
  /** 課題のテーマ（仮の中心の名前に使う）。 */
  theme: string
}

/** 描いて、片付けの関数を返す（段階を移る・画面を離れるときに呼ぶ）。 */
export function renderOutlineView(container: HTMLElement, options: OutlineViewOptions): () => void {
  const host = h('div', { class: 'map-host' })
  // 型のチェック（AI なし。マップを直すたびに更新する）
  const checks = h('ul', { class: 'outline-checks', 'aria-label': '型のチェック' })
  const renderChecks = (text: string) =>
    replace(
      checks,
      ...checkOutline(text).map((c) =>
        h(
          'li',
          { class: c.ok ? 'ok' : 'ng', title: c.ok ? '' : c.detail },
          h('b', {}, c.ok ? '✓' : '!'),
          c.label,
          c.ok ? null : h('span', {}, c.detail),
        ),
      ),
    )
  renderChecks(options.editor.text)
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
      checks,
      host,
    ),
  )
  const map = mountMap(host, {
    text: options.editor.text,
    title: options.theme === '' ? '意見' : options.theme,
    centerPlaceholder: '意見（topic sentence の元）',
    onChange: (text) => {
      options.editor.update(text)
      renderChecks(text)
    },
  })
  return () => map.destroy()
}
