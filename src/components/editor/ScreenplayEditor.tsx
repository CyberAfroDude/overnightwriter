import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { DraftBlock, ElementType } from '../../types'
import { useViewport } from '../../hooks/useViewport'
import { v4 as uuidv4 } from 'uuid'

const ELEMENT_CYCLE: ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition'
]

const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading': 'Scene Heading',
  'action': 'Action',
  'character': 'Character',
  'dialogue': 'Dialogue',
  'parenthetical': 'Parenthetical',
  'transition': 'Transition'
}

const ELEMENT_STYLES = (isMobile: boolean): Record<ElementType, React.CSSProperties> => ({
  'scene-heading': {
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 400,
    marginTop: '1.2em'
  },
  'action': { marginTop: '0.5em' },
  'character': {
    textTransform: 'uppercase',
    paddingLeft: isMobile ? '1in' : '2.2in',
    marginTop: '0.8em'
  },
  'dialogue': {
    paddingLeft: isMobile ? '0.5in' : '1.2in',
    paddingRight: isMobile ? '0.5in' : '1.2in'
  },
  'parenthetical': {
    paddingLeft: isMobile ? '0.75in' : '1.7in',
    paddingRight: isMobile ? '0.75in' : '1.7in',
    fontStyle: 'italic'
  },
  'transition': {
    textTransform: 'uppercase',
    textAlign: 'right',
    marginTop: '0.5em'
  }
})

interface Props {
  blocks: DraftBlock[]
  onChange: (blocks: DraftBlock[]) => void
  onElementChange: (type: ElementType) => void
  onPaste?: (text: string) => boolean
}

export default function ScreenplayEditor({ blocks, onChange, onElementChange, onPaste }: Props) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const editorRootRef = useRef<HTMLDivElement>(null)
  const { isMobile } = useViewport()
  const elementStyles = ELEMENT_STYLES(isMobile)
  const [pages, setPages] = useState<DraftBlock[][]>([blocks])

  // Track which block is currently being edited by the user
  // We skip React-controlled rendering for that block to avoid cursor jumps
  const editingRef = useRef<string | null>(null)

  // Extract unique character names from all blocks
  const characterNames = [...new Set(
    blocks.filter(b => b.type === 'character' && b.text.trim())
      .map(b => b.text.trim().toUpperCase())
  )].sort()

  const updateBlock = (id: string, text: string) => {
    onChange(blocks.map(b => b.id === id ? { ...b, text } : b))
  }

  const cycleElement = useCallback((id: string) => {
    const block = blocks.find(b => b.id === id)
    if (!block) return
    const currentIdx = ELEMENT_CYCLE.indexOf(block.type)
    const nextType = ELEMENT_CYCLE[(currentIdx + 1) % ELEMENT_CYCLE.length]
    const updated = blocks.map(b => b.id === id ? { ...b, type: nextType } : b)
    onChange(updated)
    onElementChange(nextType)
  }, [blocks, onChange, onElementChange])

  const addBlockAfter = useCallback((id: string, forceType?: ElementType) => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx === -1) return

    const currentBlock = blocks[idx]
    let nextType: ElementType = forceType || 'action'
    
    if (!forceType) {
      if (currentBlock.type === 'character') nextType = 'dialogue'
      else if (currentBlock.type === 'dialogue') nextType = 'character'
      else if (currentBlock.type === 'parenthetical') nextType = 'dialogue'
      else if (currentBlock.type === 'scene-heading') nextType = 'action'
      else if (currentBlock.type === 'action') nextType = 'action'
      else if (currentBlock.type === 'transition') nextType = 'scene-heading'
    }

    const newBlock: DraftBlock = {
      id: uuidv4(),
      type: nextType,
      text: '',
      ai_written: false
    }

    const newBlocks = [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)]
    onChange(newBlocks)

    setTimeout(() => {
      const el = blockRefs.current.get(newBlock.id)
      el?.focus()
      setFocusedId(newBlock.id)
      onElementChange(nextType)
    }, 10)
  }, [blocks, onChange, onElementChange])

  const deleteBlock = useCallback((id: string) => {
    if (blocks.length <= 1) return
    const idx = blocks.findIndex(b => b.id === id)
    const newBlocks = blocks.filter(b => b.id !== id)
    onChange(newBlocks)
    const prevIdx = Math.max(0, idx - 1)
    const prevId = newBlocks[prevIdx]?.id
    setTimeout(() => {
      const el = blockRefs.current.get(prevId)
      el?.focus()
      setFocusedId(prevId)
      const prevType = newBlocks[prevIdx]?.type
      if (prevType) onElementChange(prevType)
    }, 10)
  }, [blocks, onChange, onElementChange])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    const block = blocks.find(b => b.id === id)
    if (!block) return

    if (e.key === 'Tab') {
      e.preventDefault()
      cycleElement(id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      
      if (block.type === 'character' && showAutocomplete && characterNames.length > 0) {
        const selectedName = characterNames[autocompleteIndex]
        updateBlock(id, selectedName)
        setShowAutocomplete(false)
        addBlockAfter(id, 'dialogue')
        return
      }
      
      if (block.type === 'character') {
        addBlockAfter(id, 'dialogue')
        return
      }
      
      if (block.type === 'dialogue') {
        addBlockAfter(id, 'character')
        return
      }
      
      if (block.type === 'parenthetical') {
        addBlockAfter(id, 'dialogue')
        return
      }
      
      addBlockAfter(id)
    } else if (e.key === 'Backspace') {
      if (block.text === '' && blocks.length > 1) {
        e.preventDefault()
        deleteBlock(id)
      }
    } else if (e.key === 'ArrowDown' && showAutocomplete) {
      e.preventDefault()
      setAutocompleteIndex(prev => (prev + 1) % characterNames.length)
    } else if (e.key === 'ArrowUp' && showAutocomplete) {
      e.preventDefault()
      setAutocompleteIndex(prev => (prev - 1 + characterNames.length) % characterNames.length)
    } else if (e.key === 'Escape' && showAutocomplete) {
      setShowAutocomplete(false)
    }
  }

  const handleInput = (id: string, text: string) => {
    updateBlock(id, text)
    
    const block = blocks.find(b => b.id === id)
    if (block?.type === 'character' && text.trim()) {
      const matches = characterNames.filter(name => 
        name.toLowerCase().startsWith(text.trim().toLowerCase()) && 
        name.toLowerCase() !== text.trim().toLowerCase()
      )
      setShowAutocomplete(matches.length > 0)
      setAutocompleteIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }

  const handleFocus = (id: string) => {
    setActiveBlockId(id)
    setFocusedId(id)
    editingRef.current = id
    const block = blocks.find(b => b.id === id)
    if (block) onElementChange(block.type)
    setShowAutocomplete(false)
  }

  const handleBlur = (id: string, text: string) => {
    updateBlock(id, text)
    if (editingRef.current === id) {
      editingRef.current = null
    }
    if (activeBlockId === id) {
      setActiveBlockId(null)
    }
  }

  const handleAutocompleteSelect = (blockId: string, name: string) => {
    const el = blockRefs.current.get(blockId)
    if (el) el.textContent = name
    updateBlock(blockId, name)
    setShowAutocomplete(false)
    addBlockAfter(blockId, 'dialogue')
  }

  const handlePaste = (e: React.ClipboardEvent, blockId: string) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return

    if (text.includes('\n') && onPaste) {
      const handled = onPaste(text)
      if (handled) return
    }

    const block = blocks.find(b => b.id === blockId)
    if (!block) return

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
      
      const el = blockRefs.current.get(blockId)
      if (el) {
        updateBlock(blockId, el.textContent || '')
      }
    } else {
      const newText = block.text + text
      const el = blockRefs.current.get(blockId)
      if (el) el.textContent = newText
      updateBlock(blockId, newText)
    }
  }

  const hasVisibleContent = (text: string) => text.replace(/\u200B/g, '').trim().length > 0

  const paginateBlocks = useCallback(() => {
    if (isMobile) {
      setPages([blocks])
      return
    }

    // Approximate printable content height inside an 11in screenplay page.
    const pageContentHeightPx = 820
    const nextPages: DraftBlock[][] = [[]]
    let currentPage = 0
    let usedHeight = 0

    for (const block of blocks) {
      const measuredHeight = blockRefs.current.get(block.id)?.offsetHeight ?? 24
      const blockHeight = Math.max(measuredHeight, 24)

      if (usedHeight + blockHeight > pageContentHeightPx && nextPages[currentPage].length > 0) {
        currentPage += 1
        nextPages.push([])
        usedHeight = 0
      }

      nextPages[currentPage].push(block)
      usedHeight += blockHeight
    }

    setPages(prev => {
      const prevKey = prev.map(page => page.map(b => b.id).join('|')).join('||')
      const nextKey = nextPages.map(page => page.map(b => b.id).join('|')).join('||')
      return prevKey === nextKey ? prev : nextPages
    })
  }, [blocks, isMobile])

  useLayoutEffect(() => {
    paginateBlocks()
  }, [paginateBlocks])

  return (
    <div
      ref={editorRootRef}
      onKeyDownCapture={e => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          const selection = window.getSelection()
          if (!selection || !editorRootRef.current) return
          e.preventDefault()
          const range = document.createRange()
          range.selectNodeContents(editorRootRef.current)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }}
      onMouseDown={e => {
        if (e.target === editorRootRef.current) {
          setActiveBlockId(null)
          setFocusedId(null)
        }
      }}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}
    >
      {pages.map((pageBlocks, pageIndex) => (
        <div
          key={`page-${pageIndex}`}
          style={{
            width: '100%',
            maxWidth: '8.5in',
            minHeight: '11in',
            background: '#fff',
            border: '0.5px solid #d0d0d0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
            padding: isMobile ? '16px' : '1in 1.5in',
            boxSizing: 'border-box',
            fontFamily: '"DM Mono", monospace',
            fontSize: '12px',
            lineHeight: '1.8',
            color: '#111'
          }}
        >
          <div style={{ textAlign: 'right', fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#ccc', marginBottom: '24px' }}>
            {pageIndex + 1}.
          </div>
          {pageBlocks.map((block) => {
        const isEditing = editingRef.current === block.id
        const isEmpty = !hasVisibleContent(block.text)
        
        return (
          <div key={block.id} style={{ position: 'relative' }}>
            <div
              ref={el => {
                if (el) {
                  blockRefs.current.set(block.id, el)
                  // CRITICAL FIX: On mount, always sync text to DOM
                  // This ensures loaded content is visible immediately
                  if (el.textContent !== block.text) {
                    el.textContent = block.text
                  }
                } else {
                  blockRefs.current.delete(block.id)
                }
              }}
              contentEditable={activeBlockId === block.id}
              suppressContentEditableWarning
              spellCheck={false}
              onFocus={() => handleFocus(block.id)}
              onBlur={e => handleBlur(block.id, e.currentTarget.textContent || '')}
              onInput={e => handleInput(block.id, (e.target as HTMLDivElement).textContent || '')}
              onKeyDown={e => handleKeyDown(e, block.id)}
              onPaste={e => handlePaste(e, block.id)}
              data-placeholder={block.type === 'scene-heading' ? 'INT./EXT. LOCATION — DAY/NIGHT' :
                block.type === 'character' ? 'CHARACTER NAME' :
                block.type === 'dialogue' ? 'Dialogue...' :
                block.type === 'action' ? 'Action description...' :
                block.type === 'parenthetical' ? '(beat)' :
                'CUT TO:'}
              data-has-content={isEmpty ? 'false' : 'true'}
              data-active={activeBlockId === block.id ? 'true' : 'false'}
              onClick={() => {
                if (activeBlockId !== block.id) {
                  setActiveBlockId(block.id)
                  setTimeout(() => blockRefs.current.get(block.id)?.focus(), 0)
                }
              }}
              style={{
                outline: 'none',
                minHeight: '1.8em',
                color: block.ai_written ? '#2563eb' : '#111',
                ...elementStyles[block.type],
                position: 'relative',
                cursor: activeBlockId === block.id ? 'text' : 'default',
                userSelect: 'text'
              }}
            />
            
            {/* Character autocomplete dropdown */}
            {block.type === 'character' && showAutocomplete && focusedId === block.id && characterNames.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: block.type === 'character' ? (isMobile ? '1in' : '2.2in') : '0',
                  zIndex: 100,
                  background: '#fff',
                  border: '0.5px solid #e8e8e8',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  minWidth: '150px',
                  maxWidth: '250px'
                }}
              >
                {characterNames
                  .filter(name => {
                    const text = block.text.trim().toLowerCase()
                    return name.toLowerCase().startsWith(text) && name.toLowerCase() !== text
                  })
                  .map((name, i) => (
                    <div
                      key={name}
                      onClick={() => handleAutocompleteSelect(block.id, name)}
                      style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '11px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        background: i === autocompleteIndex ? '#f4f4f4' : '#fff',
                        color: '#111',
                        letterSpacing: '0.03em',
                        borderBottom: '0.5px solid #f0f0f0'
                      }}
                    >
                      {name}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )
      })}
        </div>
      ))}
      <style>{`
        [contenteditable="true"][data-has-content="false"]::before {
          content: attr(data-placeholder);
          color: #ccc;
          pointer-events: none;
          display: block;
        }
      `}</style>
    </div>
  )
}

export { ELEMENT_LABELS, ELEMENT_CYCLE }
