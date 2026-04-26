import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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
// Industry-standard "anchored page card" pagination (Final Draft / WriterDuet /
// Movie Magic / Arc Studio pattern):
//   - Page card rectangles are rendered at FIXED pixel intervals so every page
//     is always exactly one letter sheet tall, even when content is sparse.
//   - The first block of each new page is anchored to the top of its page
//     card via a dynamically-computed `margin-top` so empty space falls
//     between rectangles, not across them.
//   - Pressing Enter at the end of a page naturally pushes content onto the
//     next page card because pagination is recomputed every render and the
//     anchor margin shrinks as content grows.
const PAGE_HEIGHT_PX = 1056
const PAGE_GAP_PX = 64

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
  const [pageBreakLayouts, setPageBreakLayouts] = useState<Map<string, { marginTop: number; pageNumber: number }>>(new Map())
  const prevLayoutsRef = useRef<Map<string, { marginTop: number; pageNumber: number }>>(new Map())
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
  const paginated = useMemo(() => paginateBlocksHard(blocks).pages, [blocks])
  // Page breaks: each entry is the first block of a page (page >= 2). The
  // pagination algorithm decides which block opens each new page; the
  // measurement effect below decides how far down to push that block.
  const pageBreakBlockIds = useMemo(() => {
    const map = new Map<string, number>()
    let previousPageLastBlockId: string | null = null
    paginated.forEach((page, idx) => {
      if (idx === 0) {
        const last = page.segments[page.segments.length - 1]
        previousPageLastBlockId = last?.blockId || previousPageLastBlockId
        return
      }
      if (page.segments.length === 0) return
      const marker =
        page.segments.find(segment => segment.blockId && segment.blockId !== previousPageLastBlockId) ||
        page.segments[0]
      if (marker?.blockId) {
        map.set(marker.blockId, page.number)
      }
      const last = page.segments[page.segments.length - 1]
      previousPageLastBlockId = last?.blockId || previousPageLastBlockId
    })
    return map
  }, [paginated])
  const pageBreakCss = useMemo(() => {
    if (isMobile) return ''
    return Array.from(pageBreakLayouts.entries())
      .map(([blockId, layout]) => {
        const safeBlockId = blockId.replace(/"/g, '\\"')
        return `
          .screenplay-prosemirror p[data-block-id="${safeBlockId}"] {
            margin-top: ${layout.marginTop}px !important;
          }
        `
      })
      .join('\n')
  }, [isMobile, pageBreakLayouts])

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
    onTransaction: ({ editor: e }) => {
      // Keep ACTION indicator in sync even when selection does not move (e.g. Tab type cycle).
      const t = (e.getAttributes(SCREENPLAY_BLOCK).screenplayType || 'action') as ElementType
      onElementChange(t)
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

  // Anchor each page-break block to the top of its fixed-height page card by
  // computing the margin-top required to push it from its natural offset down
  // to `pageIndex * (PAGE_HEIGHT + GAP)`. Re-runs after every layout (via
  // ResizeObserver) so the anchor stays correct as the user types.
  useLayoutEffect(() => {
    if (!editor?.view?.dom) return
    if (isMobile) {
      if (prevLayoutsRef.current.size > 0) {
        prevLayoutsRef.current = new Map()
        setPageBreakLayouts(new Map())
      }
      return
    }

    const measure = () => {
      const editorEl = editor.view.dom as HTMLElement
      const newLayouts = new Map<string, { marginTop: number; pageNumber: number }>()

      pageBreakBlockIds.forEach((pageNumber, blockId) => {
        const safe = blockId.replace(/"/g, '\\"')
        const el = editorEl.querySelector<HTMLElement>(`p[data-block-id="${safe}"]`)
        if (!el) return

        const computed = window.getComputedStyle(el)
        const appliedMargin = parseFloat(computed.marginTop || '0') || 0
        const naturalTop = el.offsetTop - appliedMargin
        const targetTop = (pageNumber - 1) * (PAGE_HEIGHT_PX + PAGE_GAP_PX)
        const requiredMargin = Math.max(PAGE_GAP_PX, targetTop - naturalTop)
        newLayouts.set(blockId, { marginTop: requiredMargin, pageNumber })
      })

      const prev = prevLayoutsRef.current
      let changed = prev.size !== newLayouts.size
      if (!changed) {
        newLayouts.forEach((v, k) => {
          const e = prev.get(k)
          if (!e || Math.abs(e.marginTop - v.marginTop) > 0.5 || e.pageNumber !== v.pageNumber) {
            changed = true
          }
        })
      }
      if (changed) {
        prevLayoutsRef.current = newLayouts
        setPageBreakLayouts(newLayouts)
      }
    }

    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(editor.view.dom)
    return () => ro.disconnect()
  }, [editor, blocks, pageBreakBlockIds, isMobile])

  if (!editor) return null

  const pageCount = isMobile ? 1 : Math.max(1, paginated.length)
  const totalContentHeight = pageCount * PAGE_HEIGHT_PX + (pageCount - 1) * PAGE_GAP_PX

  return (
    <div style={{ width: '100%', maxWidth: '8.5in', position: 'relative' }}>
      <div
        ref={hostRef}
        style={{
          position: 'relative',
          minHeight: isMobile ? 'auto' : `${totalContentHeight}px`
        }}
      >
        {!isMobile && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from({ length: pageCount }).map((_, idx) => (
              <div
                key={`page-${idx}`}
                style={{
                  position: 'absolute',
                  top: `${idx * (PAGE_HEIGHT_PX + PAGE_GAP_PX)}px`,
                  left: 0,
                  right: 0,
                  height: `${PAGE_HEIGHT_PX}px`,
                  borderRadius: '2px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.08)',
                  background: '#fff'
                }}
              />
            ))}
            {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, idx) => {
              const dividerCenter = (idx + 1) * (PAGE_HEIGHT_PX + PAGE_GAP_PX) - PAGE_GAP_PX / 2
              return (
                <div
                  key={`marker-${idx}`}
                  style={{
                    position: 'absolute',
                    top: `${dividerCenter - 1}px`,
                    left: 0,
                    right: 0,
                    height: '2px',
                    pointerEvents: 'none'
                  }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '0.5px',
                      left: 0,
                      right: 0,
                      borderTop: '1px dashed rgba(0,0,0,0.22)'
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '-9px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '10px',
                      letterSpacing: '0.18em',
                      color: '#6b6b6b',
                      background: '#ECECEE',
                      padding: '2px 14px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Page {idx + 2}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: isMobile ? '16px' : '1in 1.5in',
            minHeight: isMobile ? '60vh' : `${totalContentHeight}px`,
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
          line-height: 1;
          color: #111;
          min-height: 100%;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .screenplay-prosemirror p {
          margin: 0;
          min-height: 1em;
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
          margin-top: 1.5em;
        }
        .screenplay-prosemirror p[data-screenplay-type="action"] {
          margin-top: 0.5em;
        }
        .screenplay-prosemirror p[data-screenplay-type="character"] {
          text-transform: uppercase;
          padding-left: ${isMobile ? '1in' : '2.2in'};
          margin-top: 1em;
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
          margin-top: 1em;
        }
        ${pageBreakCss}
      `}</style>
    </div>
  )
}
