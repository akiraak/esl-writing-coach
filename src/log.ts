/**
 * ログ出力。**秘密を出さない**のがこのモジュールの責務（daily-note の `src/log.ts` から移植）。
 *
 * - Dropbox のトークン類（app secret / refresh token / access token）は `registerSecret()` で登録し、出力時に伏せる
 * - パラグラフの本文はログに渡さない（パス・バイト数・ステータスまでにする）
 */

const secrets = new Set<string>()

/** 出力時に伏せる文字列を登録する（トークンなど）。 */
export function registerSecret(value: string | null | undefined): void {
  const trimmed = value?.trim()
  // 短すぎる値を登録すると無関係な出力まで潰れるので下限を設ける
  if (trimmed !== undefined && trimmed !== '' && trimmed.length >= 8) secrets.add(trimmed)
}

/** テスト用。登録済みの秘密文字列を捨てる。 */
export function clearSecrets(): void {
  secrets.clear()
}

/** 秘密文字列を `***` に置き換える。 */
export function mask(input: string): string {
  let output = input
  for (const secret of secrets) output = output.replaceAll(secret, '***')
  return output
}

function write(prefix: string, parts: string[]): void {
  process.stderr.write(`${prefix}${mask(parts.join(' '))}\n`)
}

export const log = {
  info(...parts: string[]): void {
    write('', parts)
  },
  warn(...parts: string[]): void {
    write('[warn] ', parts)
  },
  error(...parts: string[]): void {
    write('[error] ', parts)
  },
}

/**
 * エラーを 1 行の人間可読な文字列にする。
 * エラーをそのまま出すとトークンを含むリクエスト情報まで出かねないので、必ずこれを通す。
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `（原因: ${error.cause.message}）` : ''
    return mask(`${error.message}${cause}`)
  }
  return mask(String(error))
}
