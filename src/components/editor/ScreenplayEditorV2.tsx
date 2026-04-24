import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DraftBlock, ElementType } from '../../types'
import { useViewport } from '../../hooks/useViewport'
import { docToDraftBlocks, draftBlocksToDoc } from '../../lib/editor/screenplayDocAdapter'
import { defaultNextType, ELEMENT_CYCLE, ELEMENT_PLACEHOLDERS } from './screenplayModel'

interface Props {
  blocks: DraftBlock[]
  onChange: (blocks: DraftBlock[]) => void
  onElementChange: (type: ElementType) => void
  onPaste?: (text: string) => boolean
}

const SCREENPLAY_BLOCK = 'screenplayBlock'
const PAGE_HEIGHT = 1056
const PAGE_GAP = 24

const ScreenplayBlock = Node.create({
  name: SCREENPLAY_BLOCK,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      screenplayType: { default: 'action' },
      aiWritten: { default: false }
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-screenplay-type]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'p',
      mergeAttributes(HTMLAttributes, {
        'data-screenplay-type': HTMLAttributes.screenplayType,
        'data-ai-written': HTMLAttributes.aiWritten ? 'true' : 'false'
      }),
      0
    ]
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const attrs = this.editor.getAttributes(SCREENPLAY_BLOCK)
        const current = (attrs.screenplayType || 'action') as ElementType
        const idx = ELEMENT_CYCLE.indexOf(current)
        const next = ELEMENT_CYCLE[(idx + 1) % ELEMENT_CYCLE.length]
        return this.editor.commands.updateAttributes(SCREENPLAY_BLOCK, { screenplayType: next })
      },
      Enter: () => {
        const attrs = this.editor.getAttributes(SCREENPLAY_BLOCK)
        const current = (attrs.screenplayType || 'action') as ElementType
        const next = defaultNextType(current)
        const nextAttrs = {
          blockId: crypto.randomUUID(),
          screenplayType: next,
          aiWritten: false
        }
        const split = this.editor.commands.splitBlock()
        if (!split) return false
        return this.editor.commands.updateAttributes(SCREENPLAY_BLOCK, nextAttrs)
      }
    }
  }
})

export default function ScreenplayEditorV2({ blocks, onChange, onElementChange, onPaste }: Props) {
  const { isMobile } = useViewport()
  const [pages, setPages] = useState(1)
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const [autocompletePos, setAutocompletePos] = useState<{ top: number; left: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const ignoreUpdateRef = useRef(false)
  const characterNames = useMemo(
    () => [...new Set(blocks.filter(b => b.type === 'character' && b.text.trim()).map(b => b.text.trim().toUpperCase()))].sort(),
    [blocks]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
        hardBreak: false
      }),
      ScreenplayBlock,
      Placeholder.configure({
        includeChildren: false,
        showOnlyCurrent: true,
        placeholder: ({ node }) => {
          const t = (node.attrs?.screenplayType || 'action') as ElementType
          return ELEMENT_PLACEHOLDERS[t]
        }
      })
    ],
    content: draftBlocksToDoc(blocks),
    editorProps: {
      attributes: {
        class: 'screenplay-prosemirror'
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain') || ''
        if (text.includes('\n') && onPaste?.(text)) return true
        return false
      }
    },
    onSelectionUpdate: ({ editor: e }) => {
      const t = (e.getAttributes(SCREENPLAY_BLOCK).screenplayType || 'action') as ElementType
      onElementChange(t)

      if (t !== 'character') {
        setAutocompleteItems([])
        setAutocompletePos(null)
        return
      }
      const text = e.state.selection.$from.parent.textContent.trim().toLowerCase()
      const matches = characterNames.filter(name => name.toLowerCase().startsWith(text) && name.toLowerCase() !== text)
      if (matches.length === 0) {
        setAutocompleteItems([])
        setAutocompletePos(null)
        return
      }
      const coords = e.view.coordsAtPos(e.state.selection.from)
      setAutocompleteItems(matches)
      setAutocompleteIndex(0)
      setAutocompletePos({ left: coords.left, top: coords.bottom + 4 })
    },
    onUpdate: ({ editor: e }) => {
      if (ignoreUpdateRef.current) return
      onChange(docToDraftBlocks(e.getJSON()))
    }
  })

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    const incoming = JSON.stringify(draftBlocksToDoc(blocks))
    if (current !== incoming) {
      ignoreUpdateRef.current = true
      editor.commands.setContent(draftBlocksToDoc(blocks), { emitUpdate: false })
      ignoreUpdateRef.current = false
    }
  }, [blocks, editor])

  useEffect(() => {
    if (!editor || !hostRef.current) return
    const updatePages = () => {
      const contentHeight = editor.view.dom.scrollHeight
      const fullPage = PAGE_HEIGHT + PAGE_GAP
      setPages(Math.max(1, Math.ceil(contentHeight / fullPage)))
    }
    updatePages()
    const observer = new ResizeObserver(updatePages)
    observer.observe(editor.view.dom)
    return () => observer.disconnect()
  }, [editor])

  if (!editor) return null

  return (
    <div style={{ width: '100%', maxWidth: '8.5in', position: 'relative' }}>
      <div
        ref={hostRef}
        style={{
          position: 'relative',
          paddingBottom: `${(pages - 1) * PAGE_GAP}px`,
          minHeight: isMobile ? 'auto' : `${pages * PAGE_HEIGHT + (pages - 1) * PAGE_GAP}px`
        }}
      >
        {!isMobile && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from({ length: pages }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  top: `${idx * (PAGE_HEIGHT + PAGE_GAP)}px`,
                  left: 0,
                  right: 0,
                  height: `${PAGE_HEIGHT}px`,
                  border: '0.5px solid #d0d0d0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
                  background: '#fff'
                }}
              />
            ))}
          </div>
        )}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: isMobile ? '16px' : '1in 1.5in',
            minHeight: isMobile ? '60vh' : `${pages * PAGE_HEIGHT + (pages - 1) * PAGE_GAP}px`,
            boxSizing: 'border-box'
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {autocompleteItems.length > 0 && autocompletePos && (
        <div
          style={{
            position: 'fixed',
            left: autocompletePos.left,
            top: autocompletePos.top,
            zIndex: 200,
            background: '#fff',
            border: '0.5px solid #e8e8e8',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            minWidth: '150px',
            maxWidth: '250px'
          }}
        >
          {autocompleteItems.map((name, i) => (
            <div
              key={name}
              onMouseDown={e => {
                e.preventDefault()
                editor.commands.insertContent(name)
                setAutocompleteItems([])
                setAutocompletePos(null)
              }}
              onMouseEnter={() => setAutocompleteIndex(i)}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                padding: '6px 12px',
                cursor: 'pointer',
                background: i === autocompleteIndex ? '#f4f4f4' : '#fff',
                borderBottom: '0.5px solid #f0f0f0'
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .screenplay-prosemirror {
          outline: none;
          font-family: "DM Mono", monospace;
          font-size: 12px;
          line-height: 1.8;
          color: #111;
          min-height: 100%;
          white-space: pre-wrap;
        }
        .screenplay-prosemirror p {
          margin: 0;
          min-height: 1.8em;
        }
        .screenplay-prosemirror p.is-editor-empty:first-child::before,
        .screenplay-prosemirror p.is-empty::before {
          content: attr(data-placeholder);
          color: #ccc;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .screenplay-prosemirror p[data-ai-written="true"] {
          color: #2563eb;
        }
        .screenplay-prosemirror p[data-screenplay-type="scene-heading"] {
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 1.2em;
        }
        .screenplay-prosemirror p[data-screenplay-type="action"] {
          margin-top: 0.5em;
        }
        .screenplay-prosemirror p[data-screenplay-type="character"] {
          text-transform: uppercase;
          padding-left: ${isMobile ? '1in' : '2.2in'};
          margin-top: 0.8em;
        }
        .screenplay-prosemirror p[data-screenplay-type="dialogue"] {
          padding-left: ${isMobile ? '0.5in' : '1.2in'};
          padding-right: ${isMobile ? '0.5in' : '1.2in'};
        }
        .screenplay-prosemirror p[data-screenplay-type="parenthetical"] {
          font-style: italic;
          padding-left: ${isMobile ? '0.75in' : '1.7in'};
          padding-right: ${isMobile ? '0.75in' : '1.7in'};
        }
        .screenplay-prosemirror p[data-screenplay-type="transition"] {
          text-transform: uppercase;
          text-align: right;
          margin-top: 0.5em;
        }
      `}</style>
    </div>
  )
}
