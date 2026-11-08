import { parseRoute, type Route, routeHash } from '../shared/route.js'
import { STAGE_FILES, STAGES, type Stage } from '../shared/types.js'
import { listParagraphs, readStage } from './api.js'
import { h, replace } from './dom.js'

/**
 * 画面の入口。URL のハッシュで一覧・編集・学習ガイドを切り替える（`src/shared/route.ts`）。
 *
 * いまは土台だけ（`docs/plans/app-foundation.md`）。各画面の中身は TODO の各タスクで作る:
 * 一覧のカード・新規作成・削除は「一覧画面」、段階の編集欄と自動保存は「編集画面の骨組み」以降、
 * 学習ガイドの中身は「学習ガイド」。
 */

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  assignment: '課題',
  ideas: 'アイデア',
  outline: 'アウトライン',
  draft: '下書き・推敲',
}

/** 段階ごとの言語の印（`CLAUDE.md` の「書く流れ」）。 */
const STAGE_LANG: Readonly<Record<Stage, 'ja' | 'en'>> = {
  assignment: 'ja',
  ideas: 'ja',
  outline: 'ja',
  draft: 'en',
}

const app = document.getElementById('app') as HTMLElement

function logo(): HTMLElement {
  return h(
    'a',
    { class: 'logo', href: '#/' },
    h('i', {}, h('b'), h('b'), h('b'), h('b')),
    'ESL Writing',
  )
}

function header(...middle: (Node | string)[]): HTMLElement {
  return h(
    'header',
    { class: 'top' },
    logo(),
    ...middle,
    h('span', { class: 'sp' }),
    h('a', { class: 'btn', href: '#/guide' }, '学習ガイド'),
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function errorBox(error: unknown): HTMLElement {
  return h(
    'p',
    { class: 'error' },
    `読み込めません: ${error instanceof Error ? error.message : String(error)}`,
  )
}

async function renderList(): Promise<void> {
  const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, '読み込み中…'))
  replace(
    app,
    header(),
    h('main', { class: 'lwrap' }, h('div', { class: 'lhead' }, h('h1', {}, 'パラグラフ')), grid),
  )
  try {
    const list = await listParagraphs()
    if (list.length === 0) {
      replace(grid, h('p', { class: 'muted' }, 'まだパラグラフはありません。'))
      return
    }
    replace(
      grid,
      ...list.map((p) =>
        h(
          'a',
          { class: 'pc', href: routeHash({ name: 'edit', id: p.id, stage: 'assignment' }) },
          // テーマは assignment.md にある。読むのは「一覧画面」のタスクで作る（いまは id）
          h('h2', {}, p.id),
          h(
            'div',
            { class: 'prog' },
            ...STAGES.map((s) => h('span', { class: p.started[s] ? 'f' : '' })),
          ),
          h('div', { class: 'plabels' }, ...STAGES.map((s) => h('span', {}, STAGE_LABELS[s]))),
          h('div', { class: 'meta' }, h('span', {}, `更新 ${formatDate(p.updatedAt)}`)),
        ),
      ),
    )
  } catch (error) {
    replace(grid, errorBox(error))
  }
}

async function renderEdit(id: string, stage: Stage): Promise<void> {
  const body = h('div', { class: 'stage-body' }, h('p', { class: 'muted' }, '読み込み中…'))
  replace(
    app,
    header(h('span', { class: 'crumb' }, '／ ', h('b', {}, id))),
    h(
      'div',
      { class: 'panes' },
      h(
        'nav',
        { class: 'stages' },
        ...STAGES.map((s, i) =>
          h(
            'a',
            {
              class: `tile ${STAGE_LANG[s]}${s === stage ? ' on' : ''}`,
              href: routeHash({ name: 'edit', id, stage: s }),
            },
            h('div', { class: 'k' }, `STEP ${i + 1}`),
            h('div', { class: 't' }, STAGE_LABELS[s]),
            h('div', { class: 's' }, STAGE_FILES[s]),
          ),
        ),
      ),
      h('main', { class: 'center' }, h('h2', {}, STAGE_LABELS[stage]), body),
      h(
        'aside',
        { class: 'guide' },
        h(
          'div',
          { class: 'seg' },
          h('span', { class: 'on' }, '構成'),
          h('span', {}, 'モデル文'),
          h('span', {}, '表現集'),
        ),
        h('div', { class: 'gbody muted' }, '学習ガイドは「学習ガイド」のタスクで作ります。'),
      ),
    ),
  )
  try {
    const content = await readStage(id, stage)
    // 編集欄は「編集画面の骨組み」以降のタスクで作る。いまは読めることだけ見せる
    replace(
      body,
      content.rev === null
        ? h('p', { class: 'muted' }, `${STAGE_FILES[stage]} はまだありません。`)
        : h('pre', { class: 'preview' }, content.text),
    )
  } catch (error) {
    replace(body, errorBox(error))
  }
}

function renderGuide(): void {
  replace(
    app,
    header(h('span', { class: 'crumb' }, '／ ', h('b', {}, '学習ガイド'))),
    h(
      'main',
      { class: 'gpage' },
      h('h1', {}, 'Opinion paragraph の書き方'),
      h(
        'p',
        { class: 'muted' },
        '構成の解説・モデル文・表現集は「学習ガイド」のタスクで作ります。',
      ),
    ),
  )
}

function renderNotFound(route: Extract<Route, { name: 'not-found' }>): void {
  replace(
    app,
    header(),
    h(
      'main',
      { class: 'lwrap' },
      h('p', {}, `ページがありません（${route.hash}）。`),
      h('a', { href: '#/' }, '一覧へ'),
    ),
  )
}

function render(): void {
  const route = parseRoute(location.hash)
  switch (route.name) {
    case 'list':
      void renderList()
      break
    case 'edit':
      void renderEdit(route.id, route.stage)
      break
    case 'guide':
      renderGuide()
      break
    case 'not-found':
      renderNotFound(route)
      break
  }
}

window.addEventListener('hashchange', render)
render()
