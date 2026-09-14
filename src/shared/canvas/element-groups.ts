import { patchElements } from './document-mutations'
import type { CanvasDocument, CanvasElement, ElementId } from './element-types'

/**
 * Groups are flat: every member carries the same `groupId`, nothing else is stored. Selecting,
 * moving, resizing and deleting already act on the whole selection, so a group only has to make
 * sure the selection always contains all of its members.
 */
export type GroupId = string

export function groupMembers(document: CanvasDocument, groupId: GroupId): ElementId[] {
  return document.order.filter((id) => document.elements[id]?.groupId === groupId)
}

/** Ids plus every other member of any group they belong to, in z-order. */
export function expandToGroups(document: CanvasDocument, ids: readonly ElementId[]): ElementId[] {
  const groups = new Set<GroupId>()
  const wanted = new Set(ids)
  for (const id of ids) {
    const groupId = document.elements[id]?.groupId
    if (groupId) {
      groups.add(groupId)
    }
  }
  if (groups.size === 0) {
    return [...ids]
  }
  const result: ElementId[] = []
  for (const id of document.order) {
    const element = document.elements[id]
    if (element && (wanted.has(id) || (element.groupId && groups.has(element.groupId)))) {
      result.push(id)
    }
  }
  return result
}

/** Elements that may join a group: everything but frames (frames already carry their contents). */
export function groupableIds(document: CanvasDocument, ids: readonly ElementId[]): ElementId[] {
  return ids.filter((id) => {
    const element = document.elements[id]
    return element !== undefined && element.type !== 'frame'
  })
}

export function canGroup(document: CanvasDocument, ids: readonly ElementId[]): boolean {
  const members = groupableIds(document, ids)
  if (members.length < 2) {
    return false
  }
  // Why: a selection that already is exactly one group has nothing to gain from regrouping.
  return selectionGroupId(document, ids) === null
}

export function canUngroup(document: CanvasDocument, ids: readonly ElementId[]): boolean {
  return ids.some((id) => document.elements[id]?.groupId !== undefined)
}

/** The group id when `ids` is exactly the full membership of one group, else null. */
export function selectionGroupId(
  document: CanvasDocument,
  ids: readonly ElementId[]
): GroupId | null {
  const first = ids[0] === undefined ? undefined : document.elements[ids[0]]
  const groupId = first?.groupId
  if (!groupId || ids.length === 0) {
    return null
  }
  const members = groupMembers(document, groupId)
  const selected = new Set(ids)
  return members.length === ids.length && members.every((id) => selected.has(id)) ? groupId : null
}

/**
 * Makes one group out of `ids` (existing groups among them are merged in) and packs the members
 * together in z-order at the topmost member's position, as Figma does when grouping.
 */
export function groupElements(
  document: CanvasDocument,
  ids: readonly ElementId[],
  makeId: () => GroupId
): { document: CanvasDocument; groupId: GroupId } | null {
  const members = groupableIds(document, expandToGroups(document, ids))
  if (members.length < 2) {
    return null
  }
  const groupId = makeId()
  const memberSet = new Set(members)
  const topIndex = Math.max(...members.map((id) => document.order.indexOf(id)))
  const rest = document.order.filter((id) => !memberSet.has(id))
  // Why: insert the packed run where the topmost member was, counted among non-members.
  const above = document.order.slice(topIndex + 1).filter((id) => !memberSet.has(id)).length
  const at = rest.length - above
  const order = [...rest.slice(0, at), ...members, ...rest.slice(at)]
  const grouped = patchElements({ ...document, order }, members, { groupId })
  return { document: grouped, groupId }
}

/** Dissolves every group that `ids` touch; members stay where they are. */
export function ungroupElements(
  document: CanvasDocument,
  ids: readonly ElementId[]
): CanvasDocument {
  const members = expandToGroups(document, ids).filter(
    (id) => document.elements[id]?.groupId !== undefined
  )
  if (members.length === 0) {
    return document
  }
  // Why: patches merge over the element, so the key must be overwritten, not omitted.
  return patchElements(document, members, { groupId: undefined })
}

/** Fresh group ids for copies so a duplicated group stays a group but a separate one. */
export function remapGroupIds<T extends CanvasElement>(
  copies: readonly T[],
  makeId: () => GroupId
): T[] {
  const map = new Map<GroupId, GroupId>()
  return copies.map((copy) => {
    if (!copy.groupId) {
      return copy
    }
    let next = map.get(copy.groupId)
    if (!next) {
      next = makeId()
      map.set(copy.groupId, next)
    }
    return { ...copy, groupId: next }
  })
}
