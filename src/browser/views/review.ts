import { CRITERIA, type CriterionKey } from '../../shared/feedback.js'
import { type ReviewSummary, summarizeReview } from '../../shared/review.js'
import { routeHash } from '../../shared/route.js'
import { readReview } from '../api.js'
import { h, replace } from '../dom.js'
import { t } from '../i18n.js'
import { errorBox, fixLine, formatDate, header } from '../ui.js'
import { STATIC_VIEW, type View } from '../view.js'

/**
 * 間違いの振り返り（`#/review`。`docs/plans/archive/review.md`）。
 * パラグラフごとの最新の採点を集め、観点ごとの平均・伸ばしたいところ・点数の推移・よくする間違いを見せる（集計は `src/shared/review.ts`）。
 */

/** 観点の名前（画面の言語。`ReviewSummary` の `label` は AI のプロンプトと同じ日本語の名前なので使わない）。 */
const criterionName = (key: CriterionKey) => t().feedback.criteria[key]

const draftLink = (id: string, theme: string) =>
  h('a', { href: routeHash({ name: 'edit', id, stage: 'draft' }) }, theme === '' ? id : theme)

function summaryCards(r: ReviewSummary): HTMLElement {
  const m = t().review
  const weakest = r.criteria.find((c) => c.key === r.weakest)
  return h(
    'div',
    { class: 'rv-cards' },
    h('div', { class: 'rv-card' }, h('small', {}, m.count), h('b', {}, String(r.count))),
    h(
      'div',
      { class: 'rv-card' },
      h('small', {}, m.average),
      h('b', {}, r.averageTotal === null ? '–' : r.averageTotal.toFixed(1)),
      h('span', {}, ' / 100'),
    ),
    h(
      'div',
      { class: 'rv-card weak' },
      h('small', {}, m.weakest),
      h('b', {}, weakest === undefined ? '–' : criterionName(weakest.key)),
      weakest === undefined ? null : h('span', {}, m.weakestAverage(weakest.percent)),
    ),
  )
}

function criteriaBars(r: ReviewSummary): HTMLElement {
  return h(
    'section',
    { class: 'rv-section' },
    h('h2', {}, t().review.criteria),
    h(
      'div',
      { class: 'rv-bars' },
      ...r.criteria.map((c) => {
        const fill = h('i')
        fill.style.width = `${c.percent}%`
        return h(
          'div',
          { class: `rv-bar${c.key === r.weakest ? ' weak' : ''}` },
          h('span', { class: 'rv-bar-label' }, criterionName(c.key)),
          h('div', { class: 'rv-bar-track' }, fill),
          h(
            'span',
            { class: 'rv-bar-value' },
            t().review.barValue(c.average.toFixed(1), c.max, c.percent),
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
    h('h2', {}, t().review.timeline),
    h('p', { class: 'muted rv-note' }, t().review.timelineNote),
    h(
      'table',
      { class: 'rv-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', {}, t().review.date),
          h('th', {}, t().review.theme),
          h('th', { class: 'num' }, t().review.total),
          ...CRITERIA.map((c) =>
            h('th', { class: 'num' }, t().review.column(criterionName(c.key), c.max)),
          ),
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
    h('h2', {}, t().review.mistakes),
    h('p', { class: 'muted rv-note' }, t().review.mistakesNote),
    ...r.findings.map((group) =>
      h(
        'div',
        { class: 'rv-group' },
        h(
          'h3',
          {},
          criterionName(group.key),
          h('span', { class: 'rv-count' }, t().review.items(group.items.length)),
        ),
        group.items.length === 0
          ? h('p', { class: 'muted' }, t().review.noFindings)
          : h(
              'ul',
              { class: 'rv-findings' },
              ...group.items.map((f) =>
                h(
                  'li',
                  {},
                  f.quote === '' ? null : h('q', { lang: 'en' }, f.quote),
                  h('p', { lang: 'ja' }, f.hint),
                  fixLine(f.fix),
                  h(
                    'small',
                    {},
                    draftLink(f.id, f.theme),
                    f.scoredAt === '' ? '' : t().review.scoredOn(formatDate(f.scoredAt)),
                  ),
                ),
              ),
            ),
      ),
    ),
  )
}

export function renderReview(app: HTMLElement, previousSaved: Promise<void>): View {
  const body = h('div', {}, h('p', { class: 'muted' }, t().loading))
  replace(
    app,
    header([h('span', { class: 'crumb' }, '／ ', h('b', {}, t().header.review))]),
    h(
      'main',
      { class: 'gpage' },
      h(
        'div',
        { class: 'gin rv' },
        h('h1', {}, t().review.title),
        h('p', { class: 'muted rv-lead' }, t().review.lead),
        body,
      ),
    ),
  )
  previousSaved.then(readReview).then(
    (entries) => {
      if (entries.length === 0) {
        replace(body, h('p', { class: 'rv-empty' }, t().review.empty))
        return
      }
      const r = summarizeReview(entries)
      replace(body, summaryCards(r), criteriaBars(r), timelineTable(r), findingsSections(r))
    },
    (error: unknown) => replace(body, errorBox(error)),
  )
  return STATIC_VIEW
}
