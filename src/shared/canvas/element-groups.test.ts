import { describe, expect, it } from 'vitest'
import { insertElement } from './document-mutations'
import {
  canGroup,
  canUngroup,
  expandToGroups,
  groupElements,
  remapGroupIds,
  selectionGroupId,
  ungroupElements
} from './element-groups'
import { createEmptyDocument, type CanvasElement } from './element-types'

const text = (id: string, groupId?: string): CanvasElement => ({
  id,
  type: 'text',
  text: id,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  textStyle: { color: '#000', fontSize: 16, align: 'left', bold: false },
  ...(groupId ? { groupId } : {})
})
const frame = (id: string): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 100
})

function docWith(...elements: CanvasElement[]) {
  return elements.reduce((doc, element) => insertElement(doc, element), createEmptyDocument())
}

describe('element-groups', () => {
  it('groups a selection, packs members together in z-order and reports the group', () => {
    const doc = docWith(text('a'), text('b'), text('c'), text('d'))
    const result = groupElements(doc, ['a', 'c'], () => 'g1')
    expect(result).not.toBeNull()
    const grouped = result!.document
    expect(grouped.order).toEqual(['b', 'a', 'c', 'd'])
    expect(grouped.elements.a?.groupId).toBe('g1')
    expect(grouped.elements.b?.groupId).toBeUndefined()
    expect(selectionGroupId(grouped, ['a', 'c'])).toBe('g1')
    expect(selectionGroupId(grouped, ['a'])).toBeNull()
    expect(canGroup(grouped, ['a', 'c'])).toBe(false)
    expect(canGroup(grouped, ['a', 'b'])).toBe(true)
  })

  it('expands any touched group and merges groups when regrouping', () => {
    const doc = docWith(text('a', 'g1'), text('b', 'g1'), text('c'), text('d', 'g2'))
    expect(expandToGroups(doc, ['b', 'c'])).toEqual(['a', 'b', 'c'])
    const merged = groupElements(doc, ['a', 'd'], () => 'g3')!.document
    expect(['a', 'b', 'd'].map((id) => merged.elements[id]?.groupId)).toEqual(['g3', 'g3', 'g3'])
    expect(merged.elements.c?.groupId).toBeUndefined()
  })

  it('refuses frames and lone elements', () => {
    const doc = docWith(frame('f'), text('a'))
    expect(canGroup(doc, ['f', 'a'])).toBe(false)
    expect(groupElements(doc, ['f', 'a'], () => 'g')).toBeNull()
    expect(groupElements(doc, ['a'], () => 'g')).toBeNull()
  })

  it('ungroups every group the selection touches and leaves others alone', () => {
    const doc = docWith(text('a', 'g1'), text('b', 'g1'), text('c', 'g2'), text('d', 'g2'))
    expect(canUngroup(doc, ['c'])).toBe(true)
    const ungrouped = ungroupElements(doc, ['a'])
    expect(ungrouped.elements.a?.groupId).toBeUndefined()
    expect(ungrouped.elements.b?.groupId).toBeUndefined()
    expect(ungrouped.elements.c?.groupId).toBe('g2')
    expect(ungroupElements(ungrouped, ['a'])).toBe(ungrouped)
  })

  it('gives copies their own group ids, one per source group', () => {
    let n = 0
    const copies = remapGroupIds(
      [text('a', 'g1'), text('b', 'g1'), text('c')],
      () => `n${(n += 1)}`
    )
    expect(copies.map((c) => c.groupId)).toEqual(['n1', 'n1', undefined])
  })
})
