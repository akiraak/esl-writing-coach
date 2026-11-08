import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkRequest, type GuardInput } from '../src/server/guard.js'

const PORT = 3016

function input(overrides: Partial<GuardInput>): GuardInput {
  return {
    method: 'GET',
    host: `esl-writing.localhost:${PORT}`,
    origin: undefined,
    contentType: undefined,
    requestHeader: undefined,
    ...overrides,
  }
}

describe('checkRequest', () => {
  it('3 つの名前（esl-writing.localhost・127.0.0.1・localhost）とこのポートの Host を通す', () => {
    for (const host of [
      'esl-writing.localhost',
      '127.0.0.1',
      'localhost',
      'ESL-Writing.localhost',
    ]) {
      assert.equal(checkRequest(input({ host: `${host}:${PORT}` }), PORT), null, host)
    }
  })

  it('ほかの名前・別のポート・Host なしは断る（DNS rebinding 対策）', () => {
    for (const host of [
      `evil.example:${PORT}`,
      `esl-writing.localhost:3013`,
      'esl-writing.localhost',
      `project-manager.localhost:${PORT}`,
      undefined,
    ]) {
      assert.equal(checkRequest(input({ host }), PORT)?.status, 403, String(host))
    }
  })

  it('Origin が付いていれば同じ名前・ポートだけ', () => {
    assert.equal(
      checkRequest(input({ origin: `http://esl-writing.localhost:${PORT}` }), PORT),
      null,
    )
    for (const origin of ['http://evil.example', `https://esl-writing.localhost:${PORT}`, 'null']) {
      assert.equal(checkRequest(input({ origin }), PORT)?.status, 403, origin)
    }
  })

  it('書き込みは X-ESL-Request: 1 と JSON が要る', () => {
    const ok = { contentType: 'application/json; charset=utf-8', requestHeader: '1' }
    for (const method of ['POST', 'PUT', 'DELETE']) {
      assert.equal(checkRequest(input({ method, ...ok }), PORT), null)
      assert.equal(
        checkRequest(input({ method, ...ok, requestHeader: undefined }), PORT)?.status,
        403,
      )
      assert.equal(
        checkRequest(input({ method, ...ok, contentType: 'text/plain' }), PORT)?.status,
        403,
      )
    }
  })
})
