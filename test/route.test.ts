import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRoute, type Route, routeHash } from '../src/shared/route.js'

describe('parseRoute', () => {
  it('空・#/ は一覧、#/guide は学習ガイド、#/review は振り返り', () => {
    assert.deepEqual(parseRoute(''), { name: 'list' })
    assert.deepEqual(parseRoute('#/'), { name: 'list' })
    assert.deepEqual(parseRoute('#/guide'), { name: 'guide' })
    assert.deepEqual(parseRoute('#/review'), { name: 'review' })
  })

  it('#/p/<id>/<stage> は編集。段階を省けば課題', () => {
    assert.deepEqual(parseRoute('#/p/2026-11-08-a/draft'), {
      name: 'edit',
      id: '2026-11-08-a',
      stage: 'draft',
    })
    assert.deepEqual(parseRoute('#/p/2026-11-08-a'), {
      name: 'edit',
      id: '2026-11-08-a',
      stage: 'assignment',
    })
  })

  it('知らない段階・知らないパス・壊れたエスケープは not-found', () => {
    for (const hash of [
      '#/p/2026-11-08-a/notes',
      '#/settings',
      '#/p//draft',
      '#/p/%E0%A4%A/draft',
    ]) {
      assert.equal(parseRoute(hash).name, 'not-found', hash)
    }
  })

  it('routeHash と往復する', () => {
    const routes: Route[] = [
      { name: 'list' },
      { name: 'guide' },
      { name: 'review' },
      { name: 'edit', id: '2026-11-08-a', stage: 'outline' },
    ]
    for (const route of routes) assert.deepEqual(parseRoute(routeHash(route)), route)
  })
})
