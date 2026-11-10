import type { Assignment } from '../../shared/assignment.js'
import { checkOutline } from '../../shared/outline-checks.js'
import { outlinePrompt } from '../../shared/outline-prompts.js'
import type { Role } from '../../shared/outline-roles.js'
import { h, replace } from '../dom.js'
import { mountMap } from '../map.js'
import type { StageEditor } from '../stage-editor.js'
import { assignmentBrief } from './brief.js'

/**
 * STEP 2 アウトライン: マインドマップの上でアイデアを出しながら骨組みを作る（`outline.txt`。正は字下げのテキスト、図はその見え方）。
 * 中心 = 意見（topic sentence の元）、子 = 理由、孫 = 例・詳細、最後に結論（`CLAUDE.md` の「書く流れ」）。
 *
 * 上に課題のテーマと条件の帯（アイデアの段階をなくしたので、ここで条件を見ながら考える）。
 * マップの上に、選んでいる項目に合わせた問い（この項目に書くこと・次にすること。AI なし。`src/shared/outline-prompts.ts`）。
 * 早見の下に型のチェック（意見・理由の数・例・結論。AI なし。`src/shared/outline-checks.ts`）を出し、マップを直すたびに更新する。
 */

export interface OutlineViewOptions {
  id: string
  editor: StageEditor
  /** 手元の最新の課題（上の帯と、仮の中心の名前にテーマを使う）。 */
  assignment: Assignment
}

/** 問いの行の頭に出す、選んでいる項目の役割（早見と同じ言葉）。 */
const ROLE_LABELS: Readonly<Record<Role, string>> = {
  topic: '意見',
  reason: '理由',
  example: '例・詳細',
  conclusion: '結論',
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
  // 選んでいる項目に合わせた問い（マップが選択・描き直しのたびに知らせる）
  const prompt = h('div', { class: 'outline-prompt', 'aria-live': 'polite' })
  const renderPrompt = (text: string, line: number) => {
    const p = outlinePrompt(text, line)
    prompt.className = `outline-prompt ${p.role ?? 'none'}`
    replace(
      prompt,
      p.role === null ? null : h('b', { class: 'outline-prompt-role' }, ROLE_LABELS[p.role]),
      h('span', { class: 'outline-prompt-write' }, p.write),
      p.next === null ? null : h('span', { class: 'outline-prompt-next' }, p.next),
    )
  }
  replace(
    container,
    h(
      'div',
      { class: 'outline-view' },
      assignmentBrief(options.id, options.assignment),
      h(
        'div',
        { class: 'outline-legend' },
        h('span', {}, h('b', {}, '中心'), ' 意見（topic sentence の元）'),
        h('span', {}, h('b', {}, '子'), ' 理由'),
        h('span', {}, h('b', {}, '孫'), ' 例・詳細'),
        h('span', {}, h('b', {}, '最後'), ' 結論'),
      ),
      checks,
      prompt,
      host,
    ),
  )
  const map = mountMap(host, {
    text: options.editor.text,
    title: options.assignment.theme === '' ? '意見' : options.assignment.theme,
    centerPlaceholder: '意見（topic sentence の元）',
    onChange: (text) => {
      options.editor.update(text)
      renderChecks(text)
    },
    onSelect: ({ text, line }) => renderPrompt(text, line),
  })
  return () => map.destroy()
}
