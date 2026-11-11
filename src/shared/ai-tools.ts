import { STAGES, type Stage } from './types.js'

/**
 * 右ペインの AI の機能と、段階ごとの並び（`docs/plans/archive/right-pane-layout.md` の Phase 3）。
 *
 * 今の段階で使う機能を上に出し、ほかの段階の機能は下に畳んで残す（前に出した結果を見返せるように）。
 * STEP 3 は「AI に質問」を上、採点を下（2026-11-11 決定。`docs/plans/archive/draft-chat.md`）。
 */

export const AI_TOOLS = ['themes', 'ideas', 'outline', 'chat', 'score'] as const
export type AiTool = (typeof AI_TOOLS)[number]

/** 機能の名前と、使う段階の短い印（「ほかの段階の AI」の行に出す）。 */
export const AI_TOOL_INFO: Readonly<Record<AiTool, { title: string; steps: string }>> = {
  themes: { title: 'テーマの候補', steps: 'STEP 1' },
  ideas: { title: '理由・例の候補', steps: 'STEP 1・2' },
  outline: { title: 'アウトラインの指摘', steps: 'STEP 2' },
  chat: { title: 'AI に質問', steps: 'STEP 3' },
  score: { title: '採点', steps: 'STEP 3' },
}

/** 段階ごとに上に出す機能（使う順）。 */
const CURRENT: Readonly<Record<Stage, readonly AiTool[]>> = {
  assignment: ['themes', 'ideas'],
  outline: ['outline', 'ideas'],
  draft: ['chat', 'score'],
}

/** その段階で上に出す機能と、下に畳む機能（`AI_TOOLS` の順）。どの機能もどちらか一方に 1 回だけ入る。 */
export function aiToolsFor(stage: Stage): { current: readonly AiTool[]; others: AiTool[] } {
  const current = CURRENT[stage]
  return { current, others: AI_TOOLS.filter((tool) => !current.includes(tool)) }
}

/** 見出しの「STEP 2」の番号（段階の並びの何番目か。1 から）。 */
export function stepNumber(stage: Stage): number {
  return STAGES.indexOf(stage) + 1
}
