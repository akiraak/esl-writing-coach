import type { SaveBase, SavedStage } from './types.js'

/**
 * 段階のファイルの自動保存（状態の移り変わりだけ。DOM にも fetch にも触らない）。
 * タイマーと保存の関数を差し込めるので、node のテストで確かめる。
 *
 * - 打ち終わって `delayMs`（既定 3 秒）で保存する。続けて打てば延びる
 * - 保存中に打てば、保存が終わってからもう一度保存する（同時に 2 つは送らない）
 * - 保存できたら新しい `rev` を持ち、次の保存に使う
 * - **競合を 1 度でも見たら自動保存を止める**。手元の内容は消さず、知らせるだけ（黙って再送しない。daily-note と同じ）
 * - 通信・Dropbox の失敗は `error`。次に打ったとき・`retry()`・`flush()` で保存し直す
 * - 画面を離れるときは `flush()` で待たずに保存する
 */

export type SaveState =
  /** 保存済み（`at` は最後に保存できた時刻。開いてからまだ保存していなければ null）。 */
  | { kind: 'saved'; at: string | null }
  /** 打ったが、まだ保存していない。 */
  | { kind: 'dirty' }
  | { kind: 'saving' }
  /** 保存できなかった（通信・Dropbox の失敗）。手元の内容は残っている。 */
  | { kind: 'error'; message: string }
  /** 他（別の端末・別のタブ）が先に保存していた。自動保存は止めた。 */
  | { kind: 'conflict' }

export interface Timer {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export const DEFAULT_SAVE_DELAY_MS = 3000

export interface AutosaveOptions {
  /** 開いたときの本文と、保存に使う `rev`・形式。 */
  text: string
  base: SaveBase
  save(text: string, base: SaveBase): Promise<SavedStage>
  isConflict(error: unknown): boolean
  describeError(error: unknown): string
  onChange?(state: SaveState): void
  delayMs?: number
  timer?: Timer
}

export interface Autosave {
  /** 本文が変わったら呼ぶ。 */
  update(text: string): void
  /** 未保存があれば今すぐ保存する（画面を離れるとき）。保存中ならその終わりも待つ。 */
  flush(): Promise<void>
  /** `error` のあとにもう一度保存する。 */
  retry(): void
  /** タイマーを止める（画面を捨てるとき。先に `flush()` を呼ぶ）。 */
  dispose(): void
  readonly state: SaveState
  /** 保存していない変更があるか（競合で止めた後も、手元の変更があれば true）。 */
  readonly hasUnsavedChanges: boolean
}

const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const timer = options.timer ?? defaultTimer
  const delay = options.delayMs ?? DEFAULT_SAVE_DELAY_MS
  let current = options.text
  let savedText = options.text
  let base: SaveBase = { ...options.base }
  let state: SaveState = { kind: 'saved', at: null }
  let handle: unknown = null
  let inFlight: Promise<void> | null = null
  let disposed = false

  const setState = (next: SaveState) => {
    state = next
    options.onChange?.(next)
  }

  const cancelTimer = () => {
    if (handle !== null) timer.clear(handle)
    handle = null
  }

  const schedule = () => {
    cancelTimer()
    if (disposed) return
    handle = timer.set(() => {
      handle = null
      void run()
    }, delay)
  }

  async function run(): Promise<void> {
    if (state.kind === 'conflict' || inFlight !== null) return
    if (current === savedText) {
      if (state.kind !== 'saved') setState({ kind: 'saved', at: null })
      return
    }
    const text = current
    setState({ kind: 'saving' })
    inFlight = (async () => {
      try {
        const saved = await options.save(text, base)
        savedText = text
        base = { ...base, rev: saved.rev }
        if (current === savedText) {
          setState({ kind: 'saved', at: saved.serverModified })
        } else {
          // 保存中に打った分をもう一度
          setState({ kind: 'dirty' })
          schedule()
        }
      } catch (error) {
        if (options.isConflict(error)) {
          cancelTimer()
          setState({ kind: 'conflict' })
        } else {
          setState({ kind: 'error', message: options.describeError(error) })
        }
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  return {
    update(text: string) {
      current = text
      if (state.kind === 'conflict') return
      if (inFlight !== null) {
        // 終わったときに差分を見てもう一度保存する
        return
      }
      if (current === savedText) {
        cancelTimer()
        if (state.kind !== 'saved') setState({ kind: 'saved', at: null })
        return
      }
      if (state.kind !== 'dirty') setState({ kind: 'dirty' })
      schedule()
    },
    async flush() {
      cancelTimer()
      if (inFlight !== null) await inFlight
      cancelTimer()
      await run()
    },
    retry() {
      if (state.kind === 'error') void run()
    },
    dispose() {
      disposed = true
      cancelTimer()
    },
    get state() {
      return state
    },
    get hasUnsavedChanges() {
      return current !== savedText
    },
  }
}

/** まとめるときの重さ（大きいほど先に知らせる）。 */
const SEVERITY: Readonly<Record<SaveState['kind'], number>> = {
  saved: 0,
  dirty: 1,
  saving: 2,
  error: 3,
  conflict: 4,
}

/**
 * いくつかのファイルの保存の状態を 1 つにまとめる（編集画面のヘッダ）。
 * 競合 > 保存できません > 保存中 > 未保存 > 保存済み。全部が保存済みなら、いちばん新しい保存の時刻を出す。
 */
export function combineSaveStates(states: readonly SaveState[]): SaveState {
  let worst: SaveState = { kind: 'saved', at: null }
  let latest: string | null = null
  for (const state of states) {
    if (SEVERITY[state.kind] > SEVERITY[worst.kind]) worst = state
    // ISO8601（UTC・同じ桁数）なので文字列の大小で比べられる
    if (state.kind === 'saved' && state.at !== null && (latest === null || state.at > latest)) {
      latest = state.at
    }
  }
  return worst.kind === 'saved' ? { kind: 'saved', at: latest } : worst
}
