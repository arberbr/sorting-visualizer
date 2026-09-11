export const DRAFT_KEY = 'sortviz.draft'

export const DEFAULT_SOURCE = `// Write a function called sort(arr).
// arr is not a plain array — every operation you call is recorded and animated.
//
//   arr.length          number of elements
//   arr.get(i)          read a value
//   arr.set(i, v)       write a value
//   arr.compare(i, j)   -1, 0 or 1
//   arr.swap(i, j)      exchange two elements

function sort(arr) {
  for (let i = 1; i < arr.length; i++) {
    let j = i
    while (j > 0 && arr.compare(j - 1, j) > 0) {
      arr.swap(j - 1, j)
      j--
    }
  }
}
`

export function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? DEFAULT_SOURCE
  } catch {
    // Private browsing, blocked storage — the editor still works, it just forgets.
    return DEFAULT_SOURCE
  }
}

export function saveDraft(source: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, source)
  } catch {
    // Nothing to do; losing the draft is better than breaking the editor.
  }
}
