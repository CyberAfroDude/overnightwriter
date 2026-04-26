import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ElementType } from '../../types'

interface Props {
  editor: Editor | null
}

interface MenuPosition {
  top: number
  left: number
  /** 'bubble' centers above the selection; 'cursor' anchors to the click point. */
  source: 'bubble' | 'cursor'
}

const ELEMENT_TYPES: ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition'
]

const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading': 'Scene Heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition'
}

export default function EditorFormattingMenu({ editor }: Props) {
  const [pos, setPos] = useState<MenuPosition | null>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const cursorAnchoredRef = useRef(false)

  const placeAboveSelection = useCallback((): MenuPosition | null => {
    if (!editor) return null
    const { state, view } = editor
    const { from, to, empty } = state.selection
    if (empty) return null
    try {
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      const top = Math.min(start.top, end.top) - 8
      const left = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2
      return { top, left, source: 'bubble' }
    } catch {
      return null
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const onSelection = () => {
      if (cursorAnchoredRef.current) return
      const next = placeAboveSelection()
      setPos(next)
      if (!next) setSubmenuOpen(false)
    }
    editor.on('selectionUpdate', onSelection)
    editor.on('transaction', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
      editor.off('transaction', onSelection)
    }
  }, [editor, placeAboveSelection])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onContextMenu = (e: MouseEvent) => {
      if (editor.state.selection.empty) {
        cursorAnchoredRef.current = false
        return
      }
      e.preventDefault()
      cursorAnchoredRef.current = true
      setPos({ top: e.clientY, left: e.clientX, source: 'cursor' })
    }
    dom.addEventListener('contextmenu', onContextMenu)
    return () => dom.removeEventListener('contextmenu', onContextMenu)
  }, [editor])

  useEffect(() => {
    if (!pos) {
      cursorAnchoredRef.current = false
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPos(null)
        setSubmenuOpen(false)
        cursorAnchoredRef.current = false
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current && menuRef.current.contains(target)) return
      if (editor && editor.view.dom.contains(target)) {
        if (cursorAnchoredRef.current) {
          cursorAnchoredRef.current = false
        }
        return
      }
      setPos(null)
      setSubmenuOpen(false)
      cursorAnchoredRef.current = false
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [pos, editor])

  if (!editor || !pos) return null

  const toggleMark = (mark: 'bold' | 'italic' | 'underline' | 'strike') => () => {
    editor.chain().focus().toggleMark(mark).run()
  }

  const isMarkActive = (mark: string) => editor.isActive(mark)

  const setElementType = (t: ElementType) => () => {
    editor.chain().focus().updateAttributes('screenplayBlock', { screenplayType: t }).run()
    setSubmenuOpen(false)
  }

  const currentElementType =
    (editor.getAttributes('screenplayBlock').screenplayType as ElementType | undefined) || null

  const transform = pos.source === 'bubble' ? 'translate(-50%, -100%)' : 'none'

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    transform,
    zIndex: 400,
    background: '#1c1c1c',
    color: '#fff',
    borderRadius: '4px',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  }

  const buttonStyle = (active: boolean, extra: CSSProperties = {}): CSSProperties => ({
    background: active ? '#2563eb' : 'transparent',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    minWidth: '24px',
    textAlign: 'center',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    fontWeight: 'bold',
    lineHeight: 1,
    ...extra
  })

  const dividerStyle: CSSProperties = {
    width: '1px',
    height: '16px',
    background: '#444',
    margin: '0 4px'
  }

  return (
    <div
      ref={menuRef}
      style={containerStyle}
      onMouseDown={e => e.preventDefault()}
      data-testid="editor-formatting-menu"
    >
      <button
        type="button"
        title="Bold (Cmd/Ctrl+B)"
        style={buttonStyle(isMarkActive('bold'))}
        onClick={toggleMark('bold')}
      >
        B
      </button>
      <button
        type="button"
        title="Italic (Cmd/Ctrl+I)"
        style={buttonStyle(isMarkActive('italic'), { fontStyle: 'italic' })}
        onClick={toggleMark('italic')}
      >
        I
      </button>
      <button
        type="button"
        title="Underline (Cmd/Ctrl+U)"
        style={buttonStyle(isMarkActive('underline'), { textDecoration: 'underline' })}
        onClick={toggleMark('underline')}
      >
        U
      </button>
      <button
        type="button"
        title="Strikethrough"
        style={buttonStyle(isMarkActive('strike'), { textDecoration: 'line-through' })}
        onClick={toggleMark('strike')}
      >
        S
      </button>
      <div style={dividerStyle} />
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Element type"
          style={buttonStyle(submenuOpen, { fontWeight: 400 })}
          onClick={() => setSubmenuOpen(open => !open)}
        >
          ¶ ▾
        </button>
        {submenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: '#1c1c1c',
              color: '#fff',
              borderRadius: '4px',
              minWidth: '170px',
              padding: '4px 0',
              boxShadow: '0 6px 16px rgba(0,0,0,0.22)'
            }}
          >
            {ELEMENT_TYPES.map(t => {
              const active = currentElementType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={setElementType(t)}
                  style={{
                    background: active ? '#2563eb' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '11px',
                    textAlign: 'left',
                    width: '100%',
                    letterSpacing: '0.04em',
                    display: 'block'
                  }}
                >
                  {ELEMENT_LABELS[t]}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
