/**
 * マインドマップの、テキストと木の対応（daily-note の `docs/plans/archive/mindmap.md`。daily-note の `src/editor/` から移植）。DOM を使わないので node でテストする。
 *
 * **正は字下げのテキスト。** 1 行 1 ノードで、字下げの深さが親子。名前の中の改行は、Markdown と同じく
 * **行末の `\`** で次の行へ続ける（続きの行は字下げによらず同じノード。`\\` のように偶数個なら続けない）。図からの操作は全文を木から作り直さず、
 * **該当する行だけ**を書き換える（字下げの幅・記号・空行・行末の空白を揃え直すと差分が全行になるため）。
 * 解釈できない行は無い（空でない行はどれもどこかのノードになる）ので、触らない行は 1 文字も変わらない。
 *
 * 本文は LF に正規化済みのもの（textarea の値）を受け取る。改行コードの復元はサーバの保存の経路が持つ。
 */

export interface OutlineNode {
  /** 行番号（0 始まり。名前が複数行なら最初の行）。仮の中心は -1。 */
  line: number
  /** 名前の最後の行（行末の `\` で続けていなければ `line` と同じ）。 */
  end: number
  /** 続きの行の字下げ（続きの行があればその 1 行目のもの、無ければ ''）。 */
  cont: string
  /** 中心からの段（中心が 0）。 */
  depth: number
  /** 行頭の字下げ（空白とタブそのまま）。仮の中心は ''。 */
  indent: string
  /** 字下げの後ろのリスト記号と空白（`- ` など）。無ければ ''。 */
  marker: string
  /** 図に出す名前（字下げと記号を除いた残り。続きの行は `\n` でつなぐ）。 */
  label: string
  children: OutlineNode[]
}

export interface Outline {
  /**
   * 中心。字下げ 0 の行が 1 つならその行。0 個・2 個以上なら仮の中心（`line: -1`。名前は呼び出し側が渡す件名など）を置き、
   * 字下げ 0 の行をその子として並べる。仮の中心はテキストに無いので名前を変えられない。
   */
  root: OutlineNode
  /** 新しく足す行の字下げ 1 段ぶん（タブがあればタブ、無ければ一番浅い空白の字下げ。字下げが無ければタブ）。 */
  unit: string
}

/** 図の操作の結果。`line` は操作のあとで選んでおくノードの行（新しいノード・移したノード・消したあとの隣など）。 */
export interface OutlineEdit {
  text: string
  line: number
}

/** 字下げの幅を測るときのタブ 1 つの桁数（タブ幅の既定と同じ）。親子の判定にしか使わない。 */
const TAB_COLUMNS = 4

const MARKER = /^[-*+][ \t]+/

/** 行末の `\` で次の行へ続けているか（末尾の `\` が奇数個。`\\` は文字の `\`）。 */
function endsWithBreak(row: string): boolean {
  const run = /\\+$/.exec(row)?.[0].length ?? 0
  return run % 2 === 1
}

function columnsOf(indent: string): number {
  let columns = 0
  for (const ch of indent)
    columns = ch === '\t' ? (Math.floor(columns / TAB_COLUMNS) + 1) * TAB_COLUMNS : columns + 1
  return columns
}

function detectUnit(lines: readonly string[]): string {
  let spaces = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.trim() === '') continue
    const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
    if (indent.includes('\t')) return '\t'
    if (indent.length > 0) spaces = Math.min(spaces, indent.length)
  }
  return Number.isFinite(spaces) ? ' '.repeat(spaces) : '\t'
}

/**
 * テキストを木にする。空行はノードにしない。急に 2 段以上深くなった行は、直前の浅い行の子にする
 * （図では 1 段として見せる。テキストは変えない）。
 *
 * @param title 仮の中心の名前（件名・日付など）
 */
export function parseOutline(text: string, title: string): Outline {
  const base = parseBase(text, title)
  const only = base.children.length === 1 ? base.children[0] : undefined
  if (only !== undefined) shiftDepth(only, -1)
  return { root: only ?? base, unit: detectUnit(text.split('\n')) }
}

/** 仮の中心を必ず置いた木（字下げ 0 の行が 1 つでも仮の中心の子にする）。 */
function parseBase(text: string, title: string): OutlineNode {
  const lines = text.split('\n')
  const base: OutlineNode = {
    line: -1,
    end: -1,
    cont: '',
    depth: 0,
    indent: '',
    marker: '',
    label: title,
    children: [],
  }
  const stack: { columns: number; node: OutlineNode }[] = [{ columns: -1, node: base }]
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.trim() === '') continue
    const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
    const rest = line.slice(indent.length)
    const marker = MARKER.exec(rest)?.[0] ?? ''
    // 行末の \ で続く行（空行で止まる）を同じノードの名前に入れる
    const parts = [rest.slice(marker.length)]
    let end = index
    while (endsWithBreak(lines[end] ?? '') && (lines[end + 1] ?? '').trim() !== '') {
      parts[parts.length - 1] = (parts.at(-1) ?? '').slice(0, -1)
      end++
      parts.push((lines[end] ?? '').trimStart())
    }
    const columns = columnsOf(indent)
    while ((stack.at(-1)?.columns ?? -1) >= columns) stack.pop()
    const parent = stack.at(-1)?.node ?? base
    const node: OutlineNode = {
      line: index,
      end,
      cont: end > index ? (/^[ \t]*/.exec(lines[index + 1] ?? '')?.[0] ?? '') : '',
      depth: parent.depth + 1,
      indent,
      marker,
      label: parts.join('\n'),
      children: [],
    }
    parent.children.push(node)
    stack.push({ columns, node })
    index = end
  }
  return base
}

function shiftDepth(node: OutlineNode, delta: number): void {
  node.depth += delta
  for (const child of node.children) shiftDepth(child, delta)
}

/** 行番号のノード（仮の中心は -1）。無ければ null。 */
export function findNode(outline: Outline, line: number): OutlineNode | null {
  return findIn(outline.root, line)
}

function findIn(node: OutlineNode, line: number): OutlineNode | null {
  if (node.line === line) return node
  for (const child of node.children) {
    const found = findIn(child, line)
    if (found !== null) return found
  }
  return null
}

/** 親（中心なら null）。 */
export function parentOf(outline: Outline, line: number): OutlineNode | null {
  const visit = (node: OutlineNode): OutlineNode | null => {
    for (const child of node.children) {
      if (child.line === line) return node
      const found = visit(child)
      if (found !== null) return found
    }
    return null
  }
  return visit(outline.root)
}

/** 部分木の最後の行（子孫の一番下の行。部分木の中の空行は含み、後ろの空行は含まない）。 */
function lastLineOf(node: OutlineNode): number {
  const last = node.children.at(-1)
  return last === undefined ? node.end : lastLineOf(last)
}

function isDescendant(node: OutlineNode, line: number): boolean {
  return node.children.some((child) => child.line === line || isDescendant(child, line))
}

/**
 * 名前を行に分けて整える（改行ごとに前後の空白を落とし、空の行は捨てる）。空なら null（空の行はノードにならない）。
 */
function cleanLabel(label: string): string[] | null {
  const parts = label
    .split(/\r\n?|\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  return parts.length === 0 ? null : parts
}

/** 行の頭（字下げと記号）と、続きの行の字下げ。 */
interface Prefix {
  indent: string
  marker: string
  cont: string
}

/** 続きの行の字下げの既定: 記号があれば記号の幅だけ下げる（Markdown のリストの続きと同じ）。 */
function contOf(indent: string, marker: string): string {
  return indent + ' '.repeat(marker.length)
}

/**
 * ノードの行を作る。2 行目からは行末の `\` で続ける。名前の行がもともと `\` で終わっていると
 * 続き（や次の行の取り込み）と読まれるので、空白を 1 つ足して切る。
 */
function nodeLines(prefix: Prefix, parts: readonly string[]): string[] {
  return parts.map((part, index) => {
    const safe = endsWithBreak(part) ? `${part} ` : part
    const head = index === 0 ? prefix.indent + prefix.marker : prefix.cont
    return head + safe + (index < parts.length - 1 ? '\\' : '')
  })
}

function insertLines(text: string, at: number, rows: readonly string[]): string {
  const lines = text.split('\n')
  lines.splice(at, 0, ...rows)
  return lines.join('\n')
}

/** 本文にノードが 1 つも無いとき（作ったばかり）、中心の名前を書く。 */
function writeCenter(text: string, parts: readonly string[]): OutlineEdit {
  if (text.trim() !== '') return { text, line: 0 }
  const rows = nodeLines({ indent: '', marker: '', cont: '' }, parts).join('\n')
  return { text: `${rows}${text.endsWith('\n') ? '\n' : ''}`, line: 0 }
}

/** 子として足す行の頭。兄弟になる子があれば最初の子に、無ければ親の字下げ＋1 段と親の記号に倣う。 */
function childPrefix(outline: Outline, parent: OutlineNode): Prefix {
  const first = parent.children[0]
  if (first !== undefined) return prefixOf(first)
  if (parent.line === -1) return { indent: '', marker: '', cont: '' }
  const indent = parent.indent + outline.unit
  return { indent, marker: parent.marker, cont: contOf(indent, parent.marker) }
}

function prefixOf(node: OutlineNode): Prefix {
  return {
    indent: node.indent,
    marker: node.marker,
    cont: node.cont !== '' ? node.cont : contOf(node.indent, node.marker),
  }
}

/** 子を足す（部分木の一番下に）。仮の中心に足すと字下げ 0 の行になる。 */
export function addChild(text: string, line: number, label: string): OutlineEdit | null {
  const name = cleanLabel(label)
  if (name === null) return null
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  if (node === null) return null
  if (node.line === -1 && node.children.length === 0) return writeCenter(text, name)
  const at = lastLineOf(node) + 1
  return { text: insertLines(text, at, nodeLines(childPrefix(outline, node), name)), line: at }
}

/** 兄弟を足す（自分の部分木のすぐ下に、同じ字下げと記号で）。中心では子を足す。 */
export function addSibling(text: string, line: number, label: string): OutlineEdit | null {
  const outline = parseOutline(text, '')
  if (line === outline.root.line) return addChild(text, line, label)
  const name = cleanLabel(label)
  const node = findNode(outline, line)
  if (name === null || node === null) return null
  const at = lastLineOf(node) + 1
  const prefix = prefixOf(node)
  return { text: insertLines(text, at, nodeLines(prefix, name)), line: at }
}

/**
 * 名前を変える（字下げと記号は残す）。名前の行（続きの行を含む）だけを書き換える。
 * 仮の中心は、本文が空のときだけ中心の名前を書く。
 */
export function renameNode(text: string, line: number, label: string): OutlineEdit | null {
  const name = cleanLabel(label)
  if (name === null) return null
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  if (node === null) return null
  if (node.line === -1) return node.children.length === 0 ? writeCenter(text, name) : null
  const lines = text.split('\n')
  lines.splice(line, node.end - line + 1, ...nodeLines(prefixOf(node), name))
  return { text: lines.join('\n'), line }
}

/**
 * 部分木を消す（中の空行ごと。前後の空行は残す）。中心は消せない。
 * 選んでおくのは前の兄弟、無ければ次の兄弟、無ければ親。
 */
export function removeNode(text: string, line: number): OutlineEdit | null {
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  const parent = parentOf(outline, line)
  if (node === null || parent === null) return null
  const last = lastLineOf(node)
  const lines = text.split('\n')
  lines.splice(line, last - line + 1)
  const index = parent.children.indexOf(node)
  const before = parent.children[index - 1]
  const after = parent.children[index + 1]
  const select =
    before?.line ?? (after === undefined ? parent.line : after.line - (last - line + 1))
  return { text: lines.join('\n'), line: select }
}

/**
 * 部分木を `parentLine` の子の `index` 番目（移すノードを除いて数える）へ移す。字下げは移した先の兄弟
 * （無ければ親＋1 段）に揃え、子孫は元の字下げとの差をそのまま保つ。記号は元のまま。
 * 中心・自分の子孫の下・自分の下へは移せない。
 */
export function moveNode(
  text: string,
  line: number,
  parentLine: number,
  index: number,
): OutlineEdit | null {
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  const target = findNode(outline, parentLine)
  if (node === null || target === null || node === outline.root) return null
  if (target === node || isDescendant(node, parentLine)) return null

  const last = lastLineOf(node)
  const count = last - line + 1
  const lines = text.split('\n')
  const block = lines.splice(line, count)
  const rest = lines.join('\n')
  const shifted = (n: number) => (n > last ? n - count : n)

  // 抜いたあとは字下げ 0 の行が 1 つになることがある（中心が仮から実の行に変わる）ので、仮の中心を必ず置いて引く
  const parent = findIn(parseBase(rest, ''), shifted(parentLine))
  if (parent === null) return null
  const siblings = parent.children
  const at = Math.max(0, Math.min(index, siblings.length))
  const indent = siblings[0]?.indent ?? (parent.line === -1 ? '' : parent.indent + outline.unit)
  const position = at < siblings.length ? (siblings[at]?.line ?? 0) : lastLineOf(parent) + 1

  const depths = new Map<number, number>()
  const collect = (n: OutlineNode) => {
    for (let row = n.line; row <= n.end; row++) depths.set(row - line, n.depth - node.depth)
    for (const child of n.children) collect(child)
  }
  collect(node)
  const moved = block.map((row, offset) => {
    if (row.trim() === '') return row
    if (row.startsWith(node.indent)) return indent + row.slice(node.indent.length)
    // 子孫の字下げが元の字下げで始まらない（タブと空白が混ざっている）ときは段数から組み直す
    return indent + outline.unit.repeat(depths.get(offset) ?? 0) + row.trimStart()
  })
  const out = rest.split('\n')
  out.splice(position, 0, ...moved)
  return { text: out.join('\n'), line: position }
}

/** 兄弟の中で 1 つ上（`-1`）/ 下（`+1`）へ。端なら null。 */
export function moveAmongSiblings(text: string, line: number, step: -1 | 1): OutlineEdit | null {
  const outline = parseOutline(text, '')
  const parent = parentOf(outline, line)
  if (parent === null) return null
  const index = parent.children.findIndex((child) => child.line === line)
  const next = index + step
  if (next < 0 || next >= parent.children.length) return null
  return moveNode(text, line, parent.line, next)
}

/** 1 段深く: 前の兄弟の最後の子にする。前の兄弟が無ければ null。 */
export function indentNode(text: string, line: number): OutlineEdit | null {
  const outline = parseOutline(text, '')
  const parent = parentOf(outline, line)
  if (parent === null) return null
  const index = parent.children.findIndex((child) => child.line === line)
  const before = parent.children[index - 1]
  if (before === undefined) return null
  return moveNode(text, line, before.line, before.children.length)
}

/** 1 段浅く: 親のすぐ後ろの兄弟にする。親が中心なら null（中心が 2 つになるため）。 */
export function outdentNode(text: string, line: number): OutlineEdit | null {
  const outline = parseOutline(text, '')
  const parent = parentOf(outline, line)
  if (parent === null || parent === outline.root) return null
  const grand = parentOf(outline, parent.line)
  if (grand === null) return null
  return moveNode(text, line, grand.line, grand.children.indexOf(parent) + 1)
}

/**
 * 書き換えの前後で、前の行番号を後の行番号へ写す関数を作る（畳んでいるノードなど、行で覚えている状態を追従させる）。
 * 前後で一致する先頭と末尾の行はそのまま（末尾は行数の差だけずらす）、間で変わった行は null。
 */
export function lineMapper(before: string, after: string): (line: number) => number | null {
  const a = before.split('\n')
  const b = after.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++
  return (line) => {
    if (line < head) return line
    if (line >= a.length - tail && line < a.length) return line + (b.length - a.length)
    return null
  }
}

/**
 * ノードの部分木が本文のどこからどこまでか（文字の位置。最後の行の改行は含まない）。
 * マップで「AI に送る」の添付の範囲に使う。仮の中心は本文全体。無ければ null。
 */
export function subtreeRange(text: string, line: number): { from: number; to: number } | null {
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  if (node === null) return null
  if (node.line === -1) return { from: 0, to: text.length }
  const lines = text.split('\n')
  const offsetOf = (index: number) =>
    lines.slice(0, index).reduce((sum, row) => sum + row.length + 1, 0)
  const last = lastLineOf(node)
  return { from: offsetOf(node.line), to: offsetOf(last) + (lines[last]?.length ?? 0) }
}

/**
 * コピーするテキスト: ノードの部分木の行（続きの行・中の空行を含む）から、自分の字下げを外したもの。
 * 貼った先や他のアプリで 0 段から始まるように。仮の中心は本文全体。無ければ null。
 */
export function copyText(text: string, line: number): string | null {
  const outline = parseOutline(text, '')
  const node = findNode(outline, line)
  if (node === null) return null
  if (node.line === -1) return text.replace(/\n+$/, '')
  const depths = new Map<number, number>()
  const collect = (n: OutlineNode) => {
    for (let row = n.line; row <= n.end; row++) depths.set(row, n.depth - node.depth)
    for (const child of n.children) collect(child)
  }
  collect(node)
  const lines = text.split('\n').slice(node.line, lastLineOf(node) + 1)
  return lines
    .map((row, offset) => {
      if (row.trim() === '') return ''
      if (row.startsWith(node.indent)) return row.slice(node.indent.length)
      // タブと空白が混ざっていて自分の字下げで始まらない行は、段数から組み直す
      return outline.unit.repeat(depths.get(node.line + offset) ?? 0) + row.trimStart()
    })
    .join('\n')
}

/**
 * 貼り付け: `fragment`（字下げのテキスト）を `line` のノードの最後の子として足す。
 * 貼るテキストの字下げは**段の関係だけ**を使い、貼る先の字下げ（兄弟に倣う。無ければ親＋1 段、1 段は本文の幅）に揃える。
 * 記号と名前の改行（行末の `\`）はそのまま、空行は捨てる。本文の他の行は触らない。足せるものが無ければ null。
 */
export function pasteNodes(text: string, line: number, fragment: string): OutlineEdit | null {
  const pasted = parseBase(fragment.replace(/\r\n?/g, '\n'), '')
  if (pasted.children.length === 0) return null
  const outline = parseOutline(text, '')
  const target = findNode(outline, line)
  if (target === null) return null
  const base = childPrefix(outline, target).indent
  const rows: string[] = []
  const emit = (node: OutlineNode, depth: number) => {
    const indent = base + outline.unit.repeat(depth)
    const prefix = { indent, marker: node.marker, cont: contOf(indent, node.marker) }
    rows.push(...nodeLines(prefix, node.label.split('\n')))
    for (const child of node.children) emit(child, depth + 1)
  }
  for (const node of pasted.children) emit(node, 0)
  const at = lastLineOf(target) + 1
  return { text: insertLines(text, at, rows), line: at }
}
