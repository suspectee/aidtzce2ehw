import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import type { LanguageId } from '../types'

interface CodeEditorProps {
  value: string
  language: LanguageId
  onChange: (value: string) => void
  onCursorChange: (line: number, column: number) => void
}

const languageExtension = (language: LanguageId) => {
  switch (language) {
    case 'python':
      return python()
    case 'typescript':
      return javascript({ typescript: true })
    case 'html':
      return html()
    case 'css':
      return css()
    case 'json':
      return json()
    default:
      return javascript()
  }
}

const pairwiseTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: '#0d1823',
      color: '#dce5ed',
      fontSize: '14px',
    },
    '.cm-content': {
      padding: '18px 0 80px',
      caretColor: '#f0a57c',
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      lineHeight: '1.72',
    },
    '.cm-line': { padding: '0 24px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f0a57c' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#31547188',
    },
    '.cm-gutters': {
      backgroundColor: '#0d1823',
      color: '#536372',
      border: 'none',
      paddingLeft: '8px',
    },
    '.cm-activeLine': { backgroundColor: '#142431' },
    '.cm-activeLineGutter': { backgroundColor: '#142431', color: '#9cb0bf' },
    '.cm-foldPlaceholder': { backgroundColor: '#243746', border: 'none', color: '#adc0cf' },
    '.cm-tooltip': { backgroundColor: '#182936', border: '1px solid #2b4050' },
  },
  { dark: true },
)

const pairwiseHighlighting = EditorView.theme({
  '.tok-keyword': { color: '#d995ca' },
  '.tok-string': { color: '#a8d38a' },
  '.tok-number': { color: '#e8ba7c' },
  '.tok-comment': { color: '#617484', fontStyle: 'italic' },
  '.tok-variableName': { color: '#c9d6df' },
  '.tok-function': { color: '#7fc5dc' },
  '.tok-propertyName': { color: '#8dc9dc' },
})

export function CodeEditor({ value, language, onChange, onCursorChange }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursorChange)
  const externalUpdateRef = useRef(false)

  onChangeRef.current = onChange
  onCursorRef.current = onCursorChange

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        languageCompartment.current.of(languageExtension(language)),
        pairwiseTheme,
        pairwiseHighlighting,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !externalUpdateRef.current) {
            onChangeRef.current(update.state.doc.toString())
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const line = update.state.doc.lineAt(head)
            onCursorRef.current(line.number, head - line.from + 1)
          }
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor is intentionally mounted once; values are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    externalUpdateRef.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    externalUpdateRef.current = false
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(languageExtension(language)),
    })
  }, [language])

  return <div className="code-editor" ref={hostRef} aria-label="Collaborative code editor" />
}
