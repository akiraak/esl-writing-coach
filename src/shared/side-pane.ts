import type { Stage } from './types.js'

/**
 * 編集画面の右側（AI のペインと学習ガイドの引き出し）の決めごと（`docs/plans/archive/right-pane-layout.md` の Phase 4）。
 * DOM を使わない純関数だけを置く。
 */

/** 学習ガイドのタブ（構成の解説 / モデル文 / 表現集。描き方は `src/browser/guide-content.ts`）。 */
export const GUIDE_TAB_KEYS = ['structure', 'model', 'phrases'] as const
export type GuideTabKey = (typeof GUIDE_TAB_KEYS)[number]

/**
 * 段階ごとのおすすめのタブ。課題 = 構成（型を知る）、アウトライン = モデル文（アウトラインの見本がある）、
 * 下書き = 表現集（押して本文に入れられる）。
 */
export const RECOMMENDED_GUIDE_TAB: Readonly<Record<Stage, GuideTabKey>> = {
  assignment: 'structure',
  outline: 'model',
  draft: 'phrases',
}

/** 引き出しで開くタブ。その段階で自分で選んだタブがあればそれ、無ければおすすめ。 */
export function guideTabFor(
  stage: Stage,
  chosen: Readonly<Partial<Record<Stage, GuideTabKey>>>,
): GuideTabKey {
  return chosen[stage] ?? RECOMMENDED_GUIDE_TAB[stage]
}

/** 右ペインの幅（px）。左の段階のタイルは 200px 固定、中央は `centerMin` より狭くしない。 */
export const PANE_WIDTH = {
  min: 300,
  max: 560,
  default: 340,
  /** ← → で動かす幅。 */
  step: 20,
  left: 200,
  centerMin: 560,
} as const

/** 右ペインの幅の上限（3 つのペインを合わせた幅から。狭い画面では下げるが、下限よりは下げない）。 */
export function maxPaneWidth(panesWidth: number): number {
  return Math.max(
    PANE_WIDTH.min,
    Math.min(PANE_WIDTH.max, panesWidth - PANE_WIDTH.left - PANE_WIDTH.centerMin),
  )
}

/** 幅を下限〜上限に収めて整数にする。数でなければ既定。 */
export function clampPaneWidth(width: number, panesWidth: number): number {
  if (!Number.isFinite(width)) return PANE_WIDTH.default
  return Math.round(Math.min(maxPaneWidth(panesWidth), Math.max(PANE_WIDTH.min, width)))
}

/** ブラウザに覚えた幅を読む（無い・壊れている・範囲の外なら null）。 */
export function parseStoredPaneWidth(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null
  const width = Number(raw)
  return width >= PANE_WIDTH.min && width <= PANE_WIDTH.max ? width : null
}
