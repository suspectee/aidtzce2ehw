import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { tags } from '@lezer/highlight'
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
      backgroundColor: '#ffffff',
      color: '#26343e',
      fontSize: '14px',
    },
    '.cm-content': {
      padding: '18px 0 80px',
      caretColor: '#d85e32',
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      lineHeight: '1.72',
    },
    '.cm-line': { padding: '0 24px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#d85e32' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#c9e2ff',
      color: '#102a43',
    },
    '.cm-gutters': {
      backgroundColor: '#f7f9fa',
      color: '#8b98a2',
      borderRight: '1px solid #e3e8eb',
      paddingLeft: '8px',
    },
    '.cm-activeLine': { backgroundColor: '#f3f7fa' },
    '.cm-activeLineGutter': { backgroundColor: '#edf3f6', color: '#4b5d69' },
    '.cm-foldPlaceholder': { backgroundColor: '#e7edf1', border: 'none', color: '#536672' },
    '.cm-tooltip': { backgroundColor: '#ffffff', border: '1px solid #d5dde2', color: '#26343e' },
  },
  { dark: false },
)

const pairwiseHighlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: '#6f32a8', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#167338' },
  { tag: [tags.number, tags.integer, tags.float], color: '#a34708' },
  { tag: [tags.comment, tags.meta], color: '#687781', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#26343e' },
  { tag: tags.function(tags.variableName), color: '#005ea8' },
  { tag: [tags.propertyName, tags.attributeName], color: '#00677f' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#7440a8' },
  { tag: [tags.bool, tags.atom, tags.null], color: '#9b2f68' },
  { tag: [tags.operator, tags.punctuation], color: '#4c5963' },
  { tag: tags.invalid, color: '#b42318', textDecoration: 'underline' },
])

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
        syntaxHighlighting(pairwiseHighlighting),
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
