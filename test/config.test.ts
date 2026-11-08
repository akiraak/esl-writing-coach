import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ConfigError,
  DEFAULT_DROPBOX_ROOT,
  DEFAULT_PORT,
  loadDropboxConfig,
  parsePort,
} from '../src/config.js'

const DROPBOX_ENV = {
  DROPBOX_APP_KEY: 'key',
  DROPBOX_APP_SECRET: 'secret',
  DROPBOX_REFRESH_TOKEN: 'refresh',
}

describe('parsePort', () => {
  it('未設定なら既定（3016）', () => {
    assert.equal(parsePort(undefined), DEFAULT_PORT)
    assert.equal(DEFAULT_PORT, 3016)
  })

  it('1〜65535 の整数だけ', () => {
    assert.equal(parsePort('8080'), 8080)
    for (const bad of ['0', '65536', '3.5', 'abc']) assert.throws(() => parsePort(bad), ConfigError)
  })
})

describe('loadDropboxConfig', () => {
  it('3 つの値がそろえば読める。保存先の既定は /akira/Documents/esl-writing', () => {
    const config = loadDropboxConfig(DROPBOX_ENV)
    assert.deepEqual(config, {
      appKey: 'key',
      appSecret: 'secret',
      refreshToken: 'refresh',
      root: DEFAULT_DROPBOX_ROOT,
    })
    assert.equal(DEFAULT_DROPBOX_ROOT, '/akira/Documents/esl-writing')
  })

  it('足りない値を名前で知らせる（空白だけも未設定）', () => {
    assert.throws(
      () => loadDropboxConfig({ ...DROPBOX_ENV, DROPBOX_REFRESH_TOKEN: '  ' }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('DROPBOX_REFRESH_TOKEN'),
    )
  })

  it('保存先の末尾の / を落とす。/ で始まらない・ルートそのものは断る', () => {
    assert.equal(loadDropboxConfig({ ...DROPBOX_ENV, DROPBOX_ROOT: '/x/y/' }).root, '/x/y')
    assert.throws(() => loadDropboxConfig({ ...DROPBOX_ENV, DROPBOX_ROOT: 'x/y' }), ConfigError)
    assert.throws(() => loadDropboxConfig({ ...DROPBOX_ENV, DROPBOX_ROOT: '/' }), ConfigError)
  })
})
