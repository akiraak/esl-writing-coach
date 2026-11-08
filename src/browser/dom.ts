/**
 * DOM を組み立てる小さな道具。**本文などのデータは必ず文字列ノードとして入れる**（innerHTML は使わない）。
 */

type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>

/** `h('a', { href: '#/', class: 'x' }, '一覧')`。`on*` の属性はイベントとして付ける。 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (value === true) {
      el.setAttribute(key, '')
    } else {
      el.setAttribute(key, String(value))
    }
  }
  append(el, children)
  return el
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)))
  }
}

/** 中身を入れ替える。 */
export function replace(parent: Element, ...children: Child[]): void {
  parent.replaceChildren()
  append(parent, children)
}
