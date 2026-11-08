import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addChild,
  addSibling,
  copyText,
  findNode,
  indentNode,
  lineMapper,
  moveAmongSiblings,
  moveNode,
  type OutlineNode,
  outdentNode,
  parentOf,
  parseOutline,
  pasteNodes,
  removeNode,
  renameNode,
  subtreeRange,
} from '../src/shared/outline.js'

/**
 * マインドマップのテキストと木（daily-note から移植したテスト）。**データは手で書いた架空のもの**（実データは使わない）。
 */

/** 木を `名前(子, 子)` の形の文字列にする（比べやすいように）。 */
function shape(node: OutlineNode): string {
  return node.children.length === 0
    ? node.label
    : `${node.label}(${node.children.map(shape).join(', ')})`
}

function lines(...rows: string[]): string {
  return rows.join('\n')
}

describe('parseOutline（テキスト → 木）', () => {
  it('タブの字下げ', () => {
    const outline = parseOutline(lines('旅行', '\t行き先', '\t\t海', '\t\t山', '\t持ち物'), '件名')
    assert.equal(shape(outline.root), '旅行(行き先(海, 山), 持ち物)')
    assert.equal(outline.root.line, 0)
    assert.equal(outline.unit, '\t')
  })

  it('空白 2 / 空白 4 の字下げ。1 段の幅をファイルから取る', () => {
    assert.equal(parseOutline(lines('a', '  b', '    c'), '').unit, '  ')
    const four = parseOutline(lines('a', '    b', '        c', '    d'), '')
    assert.equal(shape(four.root), 'a(b(c), d)')
    assert.equal(four.unit, '    ')
  })

  it('字下げが無ければ 1 段はタブ', () => {
    assert.equal(parseOutline('a', '').unit, '\t')
  })

  it('リスト記号は名前から外し、記号として持つ', () => {
    const outline = parseOutline(lines('買い物', '  - 牛乳', '  * パン', '  + 卵', '  -:中止'), '')
    assert.equal(shape(outline.root), '買い物(牛乳, パン, 卵, -:中止)')
    assert.equal(outline.root.children[0]?.marker, '- ')
    assert.equal(outline.root.children[3]?.marker, '')
  })

  it('空行はノードにしない', () => {
    const outline = parseOutline(lines('a', '', '\tb', '   ', '\tc', ''), '')
    assert.equal(shape(outline.root), 'a(b, c)')
    assert.deepEqual(
      outline.root.children.map((n) => n.line),
      [2, 4],
    )
  })

  it('急に 2 段以上深い行は、直前の浅い行の子（1 段）にする', () => {
    const outline = parseOutline(lines('a', '\t\t\tb', '\tc'), '')
    assert.equal(shape(outline.root), 'a(b, c)')
    assert.equal(findNode(outline, 1)?.depth, 1)
  })

  it('タブと空白 4 つは同じ深さ', () => {
    assert.equal(shape(parseOutline(lines('a', '\tb', '    c'), '').root), 'a(b, c)')
  })

  it('字下げ 0 の行が複数なら、件名を仮の中心にする（日誌の TODO と曜日など）', () => {
    const outline = parseOutline(lines('TODO:', '  掃除', 'Mon:', '  会議'), '2026-10-16')
    assert.equal(outline.root.line, -1)
    assert.equal(shape(outline.root), '2026-10-16(TODO:(掃除), Mon:(会議))')
    assert.equal(outline.root.children[0]?.depth, 1)
  })

  it('字下げ 0 の行が無ければ仮の中心だけ', () => {
    assert.equal(shape(parseOutline('', '無題').root), '無題')
    // 1 行目が字下げされていても、一番浅い行が中心の子になる
    assert.equal(shape(parseOutline(lines('  a', '    b'), '').root), 'a(b)')
  })

  it('中心の段は 0', () => {
    const outline = parseOutline(lines('a', '\tb', '\t\tc'), '')
    assert.deepEqual(
      [0, 1, 2].map((line) => findNode(outline, line)?.depth),
      [0, 1, 2],
    )
    assert.equal(parentOf(outline, 2)?.line, 1)
    assert.equal(parentOf(outline, 0), null)
  })
})

describe('addChild / addSibling（足す）', () => {
  const text = lines('旅行', '\t- 行き先', '\t\t- 海', '\t- 持ち物', '')

  it('子は部分木の一番下に、最初の子の字下げと記号で足す', () => {
    assert.deepEqual(addChild(text, 1, '山'), {
      text: lines('旅行', '\t- 行き先', '\t\t- 海', '\t\t- 山', '\t- 持ち物', ''),
      line: 3,
    })
  })

  it('子が無ければ、親の字下げ＋1 段と親の記号', () => {
    assert.deepEqual(addChild(text, 3, '水着'), {
      text: lines('旅行', '\t- 行き先', '\t\t- 海', '\t- 持ち物', '\t\t- 水着', ''),
      line: 4,
    })
    // 空白の字下げのファイルは空白で
    assert.equal(addChild(lines('a', '  b'), 1, 'c')?.text, lines('a', '  b', '    c'))
    // 記号の無い中心に足すと記号なし・タブ
    assert.equal(addChild('a', 0, 'b')?.text, lines('a', '\tb'))
  })

  it('最後の行に改行が無ければ、足したあとも末尾に改行を足さない', () => {
    assert.equal(addChild(lines('a', '\tb'), 0, 'c')?.text, lines('a', '\tb', '\tc'))
  })

  it('兄弟は自分の部分木のすぐ下に、同じ字下げと記号で', () => {
    assert.deepEqual(addSibling(text, 1, '日程'), {
      text: lines('旅行', '\t- 行き先', '\t\t- 海', '\t- 日程', '\t- 持ち物', ''),
      line: 3,
    })
  })

  it('中心で兄弟を足すと子になる', () => {
    assert.equal(
      addSibling(text, 0, '予算')?.text,
      lines('旅行', '\t- 行き先', '\t\t- 海', '\t- 持ち物', '\t- 予算', ''),
    )
  })

  it('本文が空なら、足した名前が中心（1 行目）になる', () => {
    assert.deepEqual(addChild('', -1, '新しいアプリの案'), { text: '新しいアプリの案', line: 0 })
    assert.deepEqual(renameNode('\n', -1, '案'), { text: '案\n', line: 0 })
  })

  it('仮の中心に足すと字下げ 0 の行', () => {
    const daily = lines('TODO:', '  掃除', 'Mon:', '  会議')
    assert.equal(
      addChild(daily, -1, 'Tue:')?.text,
      lines('TODO:', '  掃除', 'Mon:', '  会議', 'Tue:'),
    )
  })

  it('名前の前後の空白と空の行は落とし、空なら足さない', () => {
    assert.equal(addChild('a', 0, ' x \n\n y ')?.text, lines('a', '\tx\\', '\ty'))
    assert.equal(addChild('a', 0, '  \n '), null)
    assert.equal(addChild('a', 9, 'x'), null)
  })
})

describe('名前の中の改行（行末の \\ で続ける）', () => {
  it('行末の \\ の次の行は同じノードの名前（字下げによらない）。空行で止まる', () => {
    const text = lines(
      '旅行',
      '\t- 行き先\\',
      '\t  海辺の町\\',
      '\t  山の宿',
      '\t- 持ち物',
      '\t\t水着\\',
      '',
      '\t予算',
    )
    const outline = parseOutline(text, '')
    assert.equal(shape(outline.root), '旅行(行き先\n海辺の町\n山の宿, 持ち物(水着\\), 予算)')
    const destination = findNode(outline, 1)
    assert.equal(destination?.label, '行き先\n海辺の町\n山の宿')
    assert.equal(destination?.end, 3)
    assert.equal(destination?.cont, '\t  ')
    // 次が空行なら続けない（\\ は名前に残る）
    assert.equal(findNode(outline, 5)?.label, '水着\\')
    assert.equal(findNode(outline, 5)?.end, 5)
  })

  it('\\\\（偶数個）は続けない。Windows のパスのように 1 つで終わる行は続ける', () => {
    assert.equal(shape(parseOutline(lines('a', '\tb\\\\', '\tc'), '').root), 'a(b\\\\, c)')
    assert.equal(shape(parseOutline(lines('a', '\tC:\\dir\\', '\tc'), '').root), 'a(C:\\dir\nc)')
  })

  it('足す・名前を変えると、2 行目からは行末の \\ と続きの字下げ（記号の幅）で書く', () => {
    assert.deepEqual(addChild(lines('a', '\t- b'), 0, '一\n二'), {
      text: lines('a', '\t- b', '\t- 一\\', '\t  二'),
      line: 2,
    })
    // 記号が無ければ同じ字下げで続ける
    assert.equal(addChild('a', 0, '一\n二')?.text, lines('a', '\t一\\', '\t二'))
    // 複数行の名前を 1 行にすると、続きの行ごと置き換わる（下の行は変わらない）
    const multi = lines('a', '\t- 一\\', '\t  二', '\t- 三')
    assert.deepEqual(renameNode(multi, 1, 'いち'), {
      text: lines('a', '\t- いち', '\t- 三'),
      line: 1,
    })
    // 既にある続きの字下げに倣う
    assert.equal(
      renameNode(multi, 1, 'x\ny\nz')?.text,
      lines('a', '\t- x\\', '\t  y\\', '\t  z', '\t- 三'),
    )
    // 本文が空なら中心を複数行で
    assert.deepEqual(addChild('', -1, '新しい\n案'), { text: lines('新しい\\', '案'), line: 0 })
  })

  it('名前の行がもともと \\ で終わっていたら空白を足して切る（次の行を取り込まない）', () => {
    const text = lines('a', '\tb', '\tc')
    const renamed = renameNode(text, 1, 'C:\\dir\\')?.text ?? ''
    assert.equal(renamed, lines('a', '\tC:\\dir\\ ', '\tc'))
    assert.equal(shape(parseOutline(renamed, '').root), 'a(C:\\dir\\ , c)')
  })

  it('消す・付け替え・部分木の範囲は続きの行ごと', () => {
    const text = lines('a', '\t- 一\\', '\t  二', '\t\t- 子', '\t- 三')
    assert.equal(removeNode(text, 1)?.text, lines('a', '\t- 三'))
    assert.equal(
      moveAmongSiblings(text, 1, 1)?.text,
      lines('a', '\t- 三', '\t- 一\\', '\t  二', '\t\t- 子'),
    )
    assert.equal(
      indentNode(lines('a', '\tx', '\t一\\', '\t二'), 2)?.text,
      lines('a', '\tx', '\t\t一\\', '\t\t二'),
    )
    const range = subtreeRange(text, 1)
    assert.equal(text.slice(range?.from, range?.to), '\t- 一\\\n\t  二\n\t\t- 子')
  })
})

describe('renameNode（名前を変える）', () => {
  it('字下げと記号は残し、他の行は 1 文字も変えない', () => {
    const text = lines('中心 ', '  - [ ] 古い  ', '\t\t次の行  ', '', '  * 最後')
    assert.deepEqual(renameNode(text, 1, '新しい'), {
      text: lines('中心 ', '  - 新しい', '\t\t次の行  ', '', '  * 最後'),
      line: 1,
    })
  })

  it('仮の中心は、本文があるときは変えられない', () => {
    assert.equal(renameNode(lines('a', 'b'), -1, 'x'), null)
  })
})

describe('removeNode（消す）', () => {
  const text = lines('a', '\tb', '\t\tc', '', '\t\td', '\te', '', '\tf')

  it('部分木を中の空行ごと消し、前後の空行は残す', () => {
    assert.deepEqual(removeNode(text, 1), { text: lines('a', '\te', '', '\tf'), line: 1 })
  })

  it('選ぶのは前の兄弟、無ければ次、無ければ親', () => {
    assert.equal(removeNode(text, 7)?.line, 5)
    assert.equal(removeNode(text, 4)?.line, 2)
    assert.equal(removeNode(text, 2)?.line, 3)
    assert.equal(removeNode(lines('a', '\tb', '\t\tc'), 2)?.line, 1)
  })

  it('中心は消せない', () => {
    assert.equal(removeNode(text, 0), null)
    assert.equal(removeNode(text, -1), null)
  })
})

describe('moveNode（付け替える）', () => {
  const text = lines('a', '\tb', '\t\tc', '\t\t\tc1', '\td', '\t\te', '')

  it('別の親の子へ。字下げは移した先の兄弟に揃え、子孫は差を保つ', () => {
    assert.deepEqual(moveNode(text, 2, 4, 0), {
      text: lines('a', '\tb', '\td', '\t\tc', '\t\t\tc1', '\t\te', ''),
      line: 3,
    })
    assert.deepEqual(moveNode(text, 2, 4, 9), {
      text: lines('a', '\tb', '\td', '\t\te', '\t\tc', '\t\t\tc1', ''),
      line: 4,
    })
  })

  it('兄弟が無い親へは、親の字下げ＋1 段', () => {
    assert.equal(
      moveNode(text, 5, 1, 0)?.text,
      lines('a', '\tb', '\t\te', '\t\tc', '\t\t\tc1', '\td', ''),
    )
    assert.equal(
      moveNode(text, 3, 4, 0)?.text,
      lines('a', '\tb', '\t\tc', '\td', '\t\tc1', '\t\te', ''),
    )
  })

  it('浅いところへ移すと子孫も同じだけ浅くなる', () => {
    assert.equal(
      moveNode(text, 2, 0, 0)?.text,
      lines('a', '\tc', '\t\tc1', '\tb', '\td', '\t\te', ''),
    )
  })

  it('字下げがタブと空白で混ざっていれば段数から組み直す', () => {
    const mixed = lines('a', '    b', '\t\tc', 'x')
    // 仮の中心の下（a と x）。b を x の子へ
    assert.equal(moveNode(mixed, 1, 3, 0)?.text, lines('a', 'x', '\tb', '\t\tc'))
  })

  it('記号は元のまま', () => {
    assert.equal(moveNode(lines('a', '  - b', '  c'), 1, 2, 0)?.text, lines('a', '  c', '    - b'))
  })

  it('中心・自分・自分の子孫の下へは移せない', () => {
    assert.equal(moveNode(text, 0, 1, 0), null)
    assert.equal(moveNode(text, 1, 1, 0), null)
    assert.equal(moveNode(text, 1, 3, 0), null)
    // 中心が実の行のときに字下げ 0 へは移せない（中心が 2 つになる）
    assert.equal(moveNode(text, 1, -1, 0), null)
  })

  it('仮の中心の下で並べ替えて、字下げ 0 の行が一時的に 1 つになっても移せる', () => {
    assert.deepEqual(moveNode(lines('A', '\ta', 'B'), 0, -1, 1), {
      text: lines('B', 'A', '\ta'),
      line: 1,
    })
  })
})

describe('moveAmongSiblings / indentNode / outdentNode（Alt+矢印）', () => {
  const text = lines('a', '\tb', '\t\tb1', '\tc', '\td')

  it('兄弟の中で上下に', () => {
    assert.deepEqual(moveAmongSiblings(text, 3, -1), {
      text: lines('a', '\tc', '\tb', '\t\tb1', '\td'),
      line: 1,
    })
    assert.deepEqual(moveAmongSiblings(text, 1, 1), {
      text: lines('a', '\tc', '\tb', '\t\tb1', '\td'),
      line: 2,
    })
    assert.equal(moveAmongSiblings(text, 1, -1), null)
    assert.equal(moveAmongSiblings(text, 4, 1), null)
    assert.equal(moveAmongSiblings(text, 0, 1), null)
  })

  it('1 段深く: 前の兄弟の最後の子に', () => {
    assert.deepEqual(indentNode(text, 3), {
      text: lines('a', '\tb', '\t\tb1', '\t\tc', '\td'),
      line: 3,
    })
    assert.equal(indentNode(text, 1), null)
  })

  it('1 段浅く: 親のすぐ後ろに。親が中心なら動かない', () => {
    assert.deepEqual(outdentNode(text, 2), {
      text: lines('a', '\tb', '\tb1', '\tc', '\td'),
      line: 2,
    })
    assert.equal(outdentNode(text, 1), null)
  })
})

describe('触っていない行は変わらない', () => {
  // タブと空白の字下げ・記号・行末の空白・空行を混ぜたもの（タブ 1 つと空白 4 つは同じ深さ）
  const text = lines(
    '中心  ',
    '',
    '\t- 一 ',
    '\t\t* 一の一',
    '    二',
    '',
    '  + 三\t',
    '      三の一',
    '',
  )

  it('解析しただけでは本文は変わらない（書き戻す関数は該当の行だけを触る）', () => {
    const edit = renameNode(text, 4, '二')
    assert.equal(edit?.text, text)
  })

  it('足す・消すで、それ以外の行がそのまま残る', () => {
    const added = addChild(text, 2, '一の二')?.text ?? ''
    const original = text.split('\n')
    const after = added.split('\n')
    assert.deepEqual(after.slice(0, 4), original.slice(0, 4))
    assert.deepEqual(after.slice(5), original.slice(4))
    const removed = removeNode(text, 6)?.text ?? ''
    assert.equal(removed, lines('中心  ', '', '\t- 一 ', '\t\t* 一の一', '    二', '', ''))
  })
})

describe('lineMapper（書き換えの前後で行番号を写す）', () => {
  it('変わった所より前はそのまま、後ろは行数の差だけずれる、変わった行は null', () => {
    const before = lines('a', '\tb', '\tc', '\td')
    const map = lineMapper(before, addChild(before, 1, 'x')?.text ?? '')
    assert.deepEqual([0, 1, 2, 3].map(map), [0, 1, 3, 4])
    const removed = lineMapper(before, removeNode(before, 2)?.text ?? '')
    assert.deepEqual([0, 1, 2, 3].map(removed), [0, 1, null, 2])
    const renamed = lineMapper(before, renameNode(before, 2, 'z')?.text ?? '')
    assert.deepEqual([0, 1, 2, 3].map(renamed), [0, 1, null, 3])
  })
})

describe('subtreeRange（部分木の文字の範囲）', () => {
  const text = lines('a', '\tb', '\t\tc', '', '\td', '')

  it('自分の行から子孫の最後の行の終わりまで（最後の改行は含まない）', () => {
    const range = subtreeRange(text, 1)
    assert.deepEqual(range, { from: 2, to: 8 })
    assert.equal(text.slice(range?.from, range?.to), '\tb\n\t\tc')
    assert.equal(text.slice(subtreeRange(text, 4)?.from, subtreeRange(text, 4)?.to), '\td')
  })

  it('中心は全体（実の行なら最後の子孫まで）、仮の中心は本文全体、無い行は null', () => {
    assert.equal(
      text.slice(subtreeRange(text, 0)?.from, subtreeRange(text, 0)?.to),
      'a\n\tb\n\t\tc\n\n\td',
    )
    assert.deepEqual(subtreeRange(lines('x', 'y'), -1), { from: 0, to: 3 })
    assert.equal(subtreeRange(text, 3), null)
  })
})

describe('copyText / pasteNodes（コピーと貼り付け）', () => {
  const text = lines(
    '旅行',
    '\t- 行き先\\',
    '\t  海辺の町',
    '\t\t- 海',
    '',
    '\t\t- 山',
    '\t- 持ち物',
    '',
  )

  it('コピーは部分木の行から自分の字下げを外す（続きの行・中の空行を含む）', () => {
    assert.equal(copyText(text, 1), lines('- 行き先\\', '  海辺の町', '\t- 海', '', '\t- 山'))
    assert.equal(copyText(text, 6), '- 持ち物')
    // 中心は全体、仮の中心は本文全体（末尾の改行は落とす）、無い行は null
    assert.equal(copyText(text, 0), text.replace(/\n$/, ''))
    assert.equal(copyText(lines('a', 'b', ''), -1), lines('a', 'b'))
    assert.equal(copyText(text, 4), null)
  })

  it('字下げが混ざって自分の字下げで始まらない行は段数から組み直す', () => {
    assert.equal(copyText(lines('a', '    b', '\t\tc'), 1), lines('b', '\tc'))
  })

  it('貼り付けは最後の子として足し、段の関係だけを使って貼る先の字下げに揃える', () => {
    // 空白 4 で書かれたものをタブのノートへ
    const fragment = lines('x', '    y', '        z', '    w')
    assert.deepEqual(pasteNodes(lines('a', '\tb', '\tc'), 1, fragment), {
      text: lines('a', '\tb', '\t\tx', '\t\t\ty', '\t\t\t\tz', '\t\t\tw', '\tc'),
      line: 2,
    })
    // 兄弟がいればその字下げと並び（記号は貼ったものの通り）
    assert.equal(
      pasteNodes(lines('a', '  - b', '  - c'), 0, '- d')?.text,
      lines('a', '  - b', '  - c', '  - d'),
    )
  })

  it('急に深い行・空行・CRLF・名前の改行を扱う', () => {
    const fragment = 'p\\\r\nq\r\n\r\n\t\t\tr\r\n'
    assert.equal(pasteNodes('a', 0, fragment)?.text, lines('a', '\tp\\', '\tq', '\t\tr'))
  })

  it('コピーしたものを貼ると同じ形になる（他の行は変わらない）', () => {
    const copied = copyText(text, 1) ?? ''
    const pasted = pasteNodes(text, 6, copied)?.text ?? ''
    assert.equal(
      pasted,
      lines(
        '旅行',
        '\t- 行き先\\',
        '\t  海辺の町',
        '\t\t- 海',
        '',
        '\t\t- 山',
        '\t- 持ち物',
        '\t\t- 行き先\\',
        '\t\t  海辺の町',
        '\t\t\t- 海',
        '\t\t\t- 山',
        '',
      ),
    )
  })

  it('本文が空なら貼ったものが本文に、仮の中心へは字下げ 0 で。貼るものが無ければ null', () => {
    assert.equal(pasteNodes('', -1, lines('中心', '\t枝'))?.text, lines('中心', '\t枝', ''))
    assert.equal(pasteNodes(lines('A', 'B'), -1, 'C')?.text, lines('A', 'B', 'C'))
    assert.equal(pasteNodes('a', 0, ' \n\n'), null)
    assert.equal(pasteNodes('a', 7, 'x'), null)
  })
})
