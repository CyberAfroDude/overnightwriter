import { useState, useRef, useCallback, useLayoutEffect } from 'react'
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
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const lastBlockIdsRef = useRef<string>('')
  const { isMobile } = useViewport()
  const elementStyles = ELEMENT_STYLES(isMobile)

  // Extract unique character names from all blocks
  const characterNames = [...new Set(
    blocks.filter(b => b.type === 'character' && b.text.trim())
      .map(b => b.text.trim().toUpperCase())
  )].sort()

  // CRITICAL FIX #8: Sync DOM to state ONLY when block IDs change (new blocks added/removed)
  // NOT on every text change. This prevents the invisible text bug.
  const currentBlockIds = blocks.map(b => b.id).join(',')
  useLayoutEffect(() => {
    if (lastBlockIdsRef.current === currentBlockIds) return
    lastBlockIdsRef.current = currentBlockIds
    
    blocks.forEach(block => {
      const el = blockRefs.current.get(block.id)
      if (el && el.textContent !== block.text) {
        el.textContent = block.text
      }
    })
  }, [currentBlockIds, blocks])

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
      
      // If character block and we have autocomplete showing, select it
      if (block.type === 'character' && showAutocomplete && characterNames.length > 0) {
        const selectedName = characterNames[autocompleteIndex]
        updateBlock(id, selectedName)
        setShowAutocomplete(false)
        addBlockAfter(id, 'dialogue')
        return
      }
      
      // Character → Dialogue
      if (block.type === 'character') {
        addBlockAfter(id, 'dialogue')
        return
      }
      
      // Dialogue → Character (first Enter), Action (second Enter on empty character)
      if (block.type === 'dialogue') {
        addBlockAfter(id, 'character')
        return
      }
      
      // Parenthetical → Dialogue
      if (block.type === 'parenthetical') {
        addBlockAfter(id, 'dialogue')
        return
      }
      
      // Default: add block with auto-detected type
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
    
    // Show autocomplete for character blocks
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
    setFocusedId(id)
    const block = blocks.find(b => b.id === id)
    if (block) onElementChange(block.type)
    setShowAutocomplete(false)
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

    // If multi-line paste, use smart paste
    if (text.includes('\n') && onPaste) {
      const handled = onPaste(text)
      if (handled) return
    }

    // Single line paste - insert at cursor position
    const block = blocks.find(b => b.id === blockId)
    if (!block) return

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
      
      // Update block text
      const el = blockRefs.current.get(blockId)
      if (el) {
        updateBlock(blockId, el.textContent || '')
      }
    } else {
      // Fallback: append text
      const newText = block.text + text
      const el = blockRefs.current.get(blockId)
      if (el) el.textContent = newText
      updateBlock(blockId, newText)
    }
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '8.5in',
      fontFamily: '"DM Mono", monospace',
      fontSize: '12px',
      lineHeight: '1.8',
      color: '#111'
    }}>
      {blocks.map((block) => (
        <div key={block.id} style={{ position: 'relative' }}>
          <div
            ref={el => {
              if (el) {
                blockRefs.current.set(block.id, el)
                // Only set textContent on initial mount, not on every render
                // The useLayoutEffect above handles sync when blocks change
              } else {
                blockRefs.current.delete(block.id)
              }
            }}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => handleFocus(block.id)}
            onBlur={e => updateBlock(block.id, e.currentTarget.textContent || '')}
            onInput={e => handleInput(block.id, (e.target as HTMLDivElement).textContent || '')}
            onKeyDown={e => handleKeyDown(e, block.id)}
            onPaste={e => handlePaste(e, block.id)}
            data-placeholder={block.type === 'scene-heading' ? 'INT./EXT. LOCATION — DAY/NIGHT' :
              block.type === 'character' ? 'CHARACTER NAME' :
              block.type === 'dialogue' ? 'Dialogue...' :
              block.type === 'action' ? 'Action description...' :
              block.type === 'parenthetical' ? '(beat)' :
              'CUT TO:'}
            style={{
              outline: 'none',
              minHeight: '1.8em',
              color: block.ai_written ? '#2563eb' : '#111',
              ...elementStyles[block.type],
              position: 'relative'
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
      ))}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #ccc;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

export { ELEMENT_LABELS, ELEMENT_CYCLE }
