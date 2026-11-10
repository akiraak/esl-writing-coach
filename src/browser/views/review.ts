import { CRITERIA } from '../../shared/feedback.js'
import { type ReviewSummary, summarizeReview } from '../../shared/review.js'
import { routeHash } from '../../shared/route.js'
import { readReview } from '../api.js'
import { h, replace } from '../dom.js'
import { errorBox, formatDate, header } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/**
 * 間違いの振り返り（`#/review`。`docs/plans/archive/review.md`）。
 * パラグラフごとの最新の採点を集め、観点ごとの平均・伸ばしたいところ・点数の推移・よくする間違いを見せる（集計は `src/shared/review.ts`）。
 */

const draftLink = (id: string, theme: string) =>
  h('a', { href: routeHash({ name: 'edit', id, stage: 'draft' }) }, theme === '' ? id : theme)

function summaryCards(r: ReviewSummary): HTMLElement {
  const weakest = r.criteria.find((c) => c.key === r.weakest)
  return h(
    'div',
    { class: 'rv-cards' },
    h(
      'div',
      { class: 'rv-card' },
      h('small', {}, '採点したパラグラフ'),
      h('b', {}, String(r.count)),
    ),
    h(
      'div',
      { class: 'rv-card' },
      h('small', {}, '合計の平均'),
      h('b', {}, r.averageTotal === null ? '–' : r.averageTotal.toFixed(1)),
      h('span', {}, ' / 100'),
    ),
    h(
      'div',
      { class: 'rv-card weak' },
      h('small', {}, '伸ばしたいところ'),
      h('b', {}, weakest?.label ?? '–'),
      weakest === undefined ? null : h('span', {}, ` 平均 ${weakest.percent}%`),
    ),
  )
}

function criteriaBars(r: ReviewSummary): HTMLElement {
  return h(
    'section',
    { class: 'rv-section' },
    h('h2', {}, '観点ごとの平均'),
    h(
      'div',
      { class: 'rv-bars' },
      ...r.criteria.map((c) => {
        const fill = h('i')
        fill.style.width = `${c.percent}%`
        return h(
          'div',
          { class: `rv-bar${c.key === r.weakest ? ' weak' : ''}` },
          h('span', { class: 'rv-bar-label' }, c.label),
          h('div', { class: 'rv-bar-track' }, fill),
          h(
            'span',
            { class: 'rv-bar-value' },
            `${c.average.toFixed(1)} / ${c.max}（${c.percent}%）`,
          ),
        )
      }),
    ),
  )
}

function timelineTable(r: ReviewSummary): HTMLElement {
  return h(
    'section',
    { class: 'rv-section' },
    h('h2', {}, '点数の推移'),
    h('p', { class: 'muted rv-note' }, '採点した日の古い順。テーマを押すとその下書きを開きます。'),
    h(
      'table',
      { class: 'rv-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', {}, '採点した日'),
          h('th', {}, 'テーマ'),
          h('th', { class: 'num' }, '合計'),
          ...CRITERIA.map((c) => h('th', { class: 'num' }, `${c.label}（${c.max}）`)),
        ),
      ),
      h(
        'tbody',
        {},
        ...r.timeline.map((e) => {
          const fill = h('i')
          fill.style.width = `${e.feedback.total}%`
          return h(
            'tr',
            {},
            h(
              'td',
              { class: 'date' },
              e.feedback.scoredAt === '' ? '–' : formatDate(e.feedback.scoredAt),
            ),
            h('td', { class: 'theme' }, draftLink(e.id, e.theme)),
            h(
              'td',
              { class: 'num total' },
              h('b', {}, String(e.feedback.total)),
              h('span', { class: 'rv-mini' }, fill),
            ),
            ...CRITERIA.map((c) =>
              h('td', { class: 'num' }, String(e.feedback.scores[c.key].score)),
            ),
          )
        }),
      ),
    ),
  )
}

function findingsSections(r: ReviewSummary): HTMLElement {
  return h(
    'section',
    { class: 'rv-section' },
    h('h2', {}, 'よくする間違い'),
    h(
      'p',
      { class: 'muted rv-note' },
      '観点ごとの指摘（指摘の多い観点から。各観点の中は新しい採点から）。',
    ),
    ...r.findings.map((group) =>
      h(
        'div',
        { class: 'rv-group' },
        h('h3', {}, group.label, h('span', { class: 'rv-count' }, `${group.items.length} 件`)),
        group.items.length === 0
          ? h('p', { class: 'muted' }, '指摘はありません。')
          : h(
              'ul',
              { class: 'rv-findings' },
              ...group.items.map((f) =>
                h(
                  'li',
                  {},
                  f.quote === '' ? null : h('q', { lang: 'en' }, f.quote),
                  h('p', {}, f.hint),
                  h(
                    'small',
                    {},
                    draftLink(f.id, f.theme),
                    f.scoredAt === '' ? '' : ` ・ ${formatDate(f.scoredAt)}`,
                  ),
                ),
              ),
            ),
      ),
    ),
  )
}

export function renderReview(app: HTMLElement, previousSaved: Promise<void>): View {
  const body = h('div', {}, h('p', { class: 'muted' }, '読み込み中…'))
  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', h('b', {}, '振り返り'))]),
    h(
      'main',
      { class: 'gpage' },
      h(
        'div',
        { class: 'gin rv' },
        h('h1', {}, '間違いの振り返り'),
        h(
          'p',
          { class: 'muted rv-lead' },
          'パラグラフごとの最新の採点を集めています（採点は最新の 1 回分だけを持つので、採点し直すと前の結果と入れ替わります）。',
        ),
        body,
      ),
    ),
  )
  previousSaved.then(readReview).then(
    (entries) => {
      if (entries.length === 0) {
        replace(
          body,
          h(
            'p',
            { class: 'rv-empty' },
            'まだ採点したパラグラフがありません。下書き（STEP 3）の右ペインの「採点」で採点すると、ここに集まります。',
          ),
        )
        return
      }
      const r = summarizeReview(entries)
      replace(body, summaryCards(r), criteriaBars(r), timelineTable(r), findingsSections(r))
    },
    (error: unknown) => replace(body, errorBox(error)),
  )
  return STATIC_VIEW
}
