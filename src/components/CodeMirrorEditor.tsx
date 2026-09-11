import { indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
}

/**
 * CodeMirror owns its own document. React only seeds it, so typing never
 * round-trips through a re-render.
 */
export default function CodeMirrorEditor({ value, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Mounts once on purpose. `value` only seeds the initial document; re-running
  // would destroy and rebuild the editor, losing the cursor, selection and undo
  // history on every keystroke. Later external changes are applied by the
  // effect below, which diffs against the live document.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design, see above
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          javascript(),
          oneDark,
          keymap.of([indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.theme({ '&': { height: '100%', fontSize: '13px' } }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Deliberately mounts once: `value` seeds the document, later edits flow out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace the document only when it is changed from outside (loading a built-in).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div className="editor" ref={hostRef} />
}
