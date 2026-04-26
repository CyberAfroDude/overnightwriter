import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { DraftBlock, ElementType } from '../../types'
import { useViewport } from '../../hooks/useViewport'
import { docToDraftBlocks, draftBlocksToDoc } from '../../lib/editor/screenplayDocAdapter'
import { paginateBlocksHard } from '../../lib/editor/screenplayPagination'
import { defaultNextType, ELEMENT_CYCLE, ELEMENT_PLACEHOLDERS } from './screenplayModel'

interface Props {
  /** Stable per draft; full editor hydrate only when this or `contentEpoch` changes (Layer 1). */
  documentKey: string
  /** Bump when parent replaces `blocks` without the editor being the source (draft load, paste, AI append). */
  contentEpoch: number
  blocks: DraftBlock[]
  onChange: (blocks: DraftBlock[]) => void
  onElementChange: (type: ElementType) => void
  onPaste?: (text: string) => boolean
}

const SCREENPLAY_BLOCK = 'screenplayBlock'
const PAGE_HEIGHT = 1056
const PAGE_GAP = 0
const PAGE_VERTICAL_PADDING = 192 // 1in top + 1in bottom at 96dpi

const createBlockId = () => crypto.randomUUID()

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
        'data-block-id': HTMLAttributes.blockId || '',
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
          blockId: createBlockId(),
          screenplayType: next,
          aiWritten: false
        }
        if (!this.editor.commands.splitBlock()) return false
        return this.editor.commands.setNode(SCREENPLAY_BLOCK, nextAttrs)
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(transaction => transaction.docChanged)) return null

          const seenIds = new Set<string>()
          let tr = newState.tr
          let changed = false

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== SCREENPLAY_BLOCK) return

            const incomingId = typeof node.attrs.blockId === 'string' ? node.attrs.blockId.trim() : ''
            const blockId = incomingId && !seenIds.has(incomingId) ? incomingId : createBlockId()
            seenIds.add(blockId)

            if (blockId !== node.attrs.blockId) {
              changed = true
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId })
            }
          })

          return changed ? tr : null
        }
      })
    ]
  }
})

export default function ScreenplayEditorV2({
  documentKey,
  contentEpoch,
  blocks,
  onChange,
  onElementChange,
  onPaste
}: Props) {
  const { isMobile } = useViewport()
  const [pages, setPages] = useState(1)
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const [autocompletePos, setAutocompletePos] = useState<{ top: number; left: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const ignoreUpdateRef = useRef(false)
  const lastHydrationRef = useRef<{ key: string; epoch: number } | null>(null)
  const characterNames = useMemo(
    () => [...new Set(blocks.filter(b => b.type === 'character' && b.text.trim()).map(b => b.text.trim().toUpperCase()))].sort(),
    [blocks]
  )
  const pageBreakBeforeMap = useMemo(() => {
    const pagesData = paginateBlocksHard(blocks).pages
    const markers = new Map<string, number>()
    pagesData.forEach((page, idx) => {
      if (idx === 0) return
      const firstSegment = page.segments[0]
      if (!firstSegment?.blockId) return
      markers.set(firstSegment.blockId, page.number)
    })
    return markers
  }, [blocks])

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

  // Layer 1: never replace the ProseMirror doc from every `blocks` update — only on draft identity or explicit parent epoch.
  useLayoutEffect(() => {
    if (!editor) return
    const prev = lastHydrationRef.current
    if (prev && prev.key === documentKey && prev.epoch === contentEpoch) return
    lastHydrationRef.current = { key: documentKey, epoch: contentEpoch }
    ignoreUpdateRef.current = true
    editor.commands.setContent(draftBlocksToDoc(blocks), { emitUpdate: false })
    ignoreUpdateRef.current = false
  }, [documentKey, contentEpoch, blocks, editor])

  useEffect(() => {
    if (!editor || !hostRef.current) return
    const updatePages = () => {
      const contentHeight = editor.view.dom.scrollHeight
      // Include fixed top/bottom screenplay margins so final lines do not spill into page-end UI.
      const totalHeight = isMobile ? contentHeight : contentHeight + PAGE_VERTICAL_PADDING
      setPages(Math.max(1, Math.ceil(totalHeight / PAGE_HEIGHT)))
    }
    updatePages()
    const observer = new ResizeObserver(updatePages)
    observer.observe(editor.view.dom)
    return () => observer.disconnect()
  }, [editor, isMobile])

  useEffect(() => {
    if (!editor?.view?.dom) return
    const paragraphs = editor.view.dom.querySelectorAll('p[data-block-id]')
    paragraphs.forEach(paragraph => {
      const blockId = paragraph.getAttribute('data-block-id') || ''
      const pageNumber = pageBreakBeforeMap.get(blockId)
      if (pageNumber) {
        paragraph.setAttribute('data-page-break-before', 'true')
        paragraph.setAttribute('data-page-number', String(pageNumber))
      } else {
        paragraph.removeAttribute('data-page-break-before')
        paragraph.removeAttribute('data-page-number')
      }
    })
  }, [editor, pageBreakBeforeMap, blocks])

  if (!editor) return null

  return (
    <div style={{ width: '100%', maxWidth: '8.5in', position: 'relative' }}>
      <div
        ref={hostRef}
        style={{
          position: 'relative',
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
          font-family: "Courier Prime", "Courier New", Courier, monospace;
          font-size: 12pt;
          line-height: 1.5;
          color: #111;
          min-height: 100%;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .screenplay-prosemirror p {
          margin: 0;
          min-height: 1.5em;
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
        .screenplay-prosemirror p[data-page-break-before="true"] {
          margin-top: 2.2em !important;
          padding-top: 1.2em;
          border-top: 1px solid #d0d0d0;
          position: relative;
        }
        .screenplay-prosemirror p[data-page-break-before="true"]::before {
          content: "PAGE " attr(data-page-number);
          position: absolute;
          top: -0.7em;
          left: 50%;
          transform: translateX(-50%);
          font-family: "DM Mono", monospace;
          font-size: 9px;
          letter-spacing: 0.12em;
          color: #b0b0b0;
          background: #fff;
          padding: 0 8px;
          font-style: normal;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  )
}
