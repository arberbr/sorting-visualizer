import type { TrackedArray } from '../../core/trackedArray'
import type { AlgorithmMeta } from '../../core/types'

export const meta: AlgorithmMeta = {
  id: 'tree',
  name: 'Tree sort',
  family: 'network',
  best: 'O(n log n)',
  average: 'O(n log n)',
  worst: 'O(n^2)',
  space: 'O(n)',
  stable: true,
  inPlace: false,
  description:
    'Inserts every element into an unbalanced binary search tree, then writes the in-order traversal back. Sorted input degenerates the tree into a linked list, which is where the quadratic worst case comes from.',
}

interface Node {
  /** The value's original array position — insertion compares by this, since no
   *  writes happen until the traversal phase, so it still holds its original value. */
  index: number
  /** The value itself, captured once at insertion time so the write-back phase
   *  never has to re-read a main-array slot that an earlier write may have
   *  already overwritten. */
  value: number
  left: Node | null
  right: Node | null
}

export function sort(a: TrackedArray): void {
  if (a.length < 2) return

  let root: Node | null = null

  const insert = (index: number, value: number) => {
    const node: Node = { index, value, left: null, right: null }
    if (!root) {
      root = node
      return
    }
    let cur = root
    for (;;) {
      if (a.compare(index, cur.index) < 0) {
        if (!cur.left) {
          cur.left = node
          return
        }
        cur = cur.left
      } else {
        if (!cur.right) {
          cur.right = node
          return
        }
        cur = cur.right
      }
    }
  }

  for (let i = 0; i < a.length; i++) insert(i, a.get(i))

  let k = 0
  const stack: Node[] = []
  let cur: Node | null = root
  while (cur || stack.length > 0) {
    while (cur) {
      stack.push(cur)
      cur = cur.left
    }
    const node = stack.pop() as Node
    a.set(k, node.value)
    a.markSorted(k)
    k++
    cur = node.right
  }
}
