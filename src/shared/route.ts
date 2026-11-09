import { isStage, type Stage } from './types.js'

/**
 * 画面の切り替え（URL のハッシュ）。純関数なので node のテストで確かめる。
 *
 * | ハッシュ | 画面 |
 * |---|---|
 * | `#/`（空も） | 一覧 |
 * | `#/p/<id>`・`#/p/<id>/<stage>` | 編集（段階を省けば課題） |
 * | `#/guide` | 学習ガイド |
 * | `#/review` | 間違いの振り返り |
 *
 * id の形はサーバが確かめる（`src/paragraphs/naming.ts`）。ここでは `/` を含まないことだけ見る。
 */

export type Route =
  | { name: 'list' }
  | { name: 'edit'; id: string; stage: Stage }
  | { name: 'guide' }
  | { name: 'review' }
  | { name: 'not-found'; hash: string }

export const DEFAULT_STAGE: Stage = 'assignment'

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '' || path === '/') return { name: 'list' }
  if (path === '/guide') return { name: 'guide' }
  if (path === '/review') return { name: 'review' }
  const m = /^\/p\/([^/]+)(?:\/([^/]+))?\/?$/.exec(path)
  if (m !== null) {
    let id: string
    try {
      id = decodeURIComponent(m[1] ?? '')
    } catch {
      return { name: 'not-found', hash }
    }
    const stage = m[2] ?? DEFAULT_STAGE
    if (id !== '' && !id.includes('/') && isStage(stage)) return { name: 'edit', id, stage }
  }
  return { name: 'not-found', hash }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'list':
      return '#/'
    case 'guide':
      return '#/guide'
    case 'review':
      return '#/review'
    case 'edit':
      return `#/p/${encodeURIComponent(route.id)}/${route.stage}`
    case 'not-found':
      return route.hash
  }
}
