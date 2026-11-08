import type { Assignment } from '../../shared/assignment.js'
import { h, replace } from '../dom.js'
import type { StageEditor } from '../stage-editor.js'
import { assignmentBrief } from './brief.js'

/**
 * STEP 2 アイデア: 意見・理由・例を思いつくまま書き出す自由テキスト（`ideas.txt`。日本語でよい）。
 * 本文は加工しない。打つたびに自動保存に渡す。
 */

export interface IdeasViewOptions {
  id: string
  editor: StageEditor
  /** 手元の最新の課題（上にテーマと条件を出す）。 */
  assignment: Assignment
}

const PLACEHOLDER = [
  '思いつくまま書き出す（日本語でよい）。例:',
  '',
  '意見: 制服は義務にすべきではない',
  '理由: 個性を出せない',
  '  例: 自分で服を選ぶと自分らしくいられる',
  '理由: お金がかかる',
  '  例: 一式 5 万円以上、成長すると買い替え',
  '反対の意見: まとまりが出る、毎朝服を選ばなくてよい',
].join('\n')

export function renderIdeasView(container: HTMLElement, options: IdeasViewOptions): void {
  const memo = h('textarea', {
    class: 'memo-input',
    rows: 18,
    spellcheck: 'false',
    placeholder: PLACEHOLDER,
    'aria-label': 'アイデアのメモ',
    oninput: () => options.editor.update(memo.value),
  })
  memo.value = options.editor.text

  replace(
    container,
    h(
      'div',
      { class: 'ideas' },
      assignmentBrief(options.id, options.assignment),
      memo,
      h(
        'p',
        { class: 'hint' },
        '順番や形は気にしない。意見・理由・例のほか、反対の意見や使えそうな英語の表現も書いておくとよい。ここで出したものを次のアウトラインで並べる。',
      ),
    ),
  )
}
