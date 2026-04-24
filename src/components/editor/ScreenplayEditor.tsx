import { useState, useRef, useCallback, useEffect } from 'react'
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
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const { isMobile } = useViewport()
  const elementStyles = ELEMENT_STYLES(isMobile)

  const getFocusedBlock = () => blocks.find(b => b.id === focusedId)

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

  const addBlockAfter = useCallback((id: string) => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx === -1) return

    const currentBlock = blocks[idx]
    let nextType: ElementType = 'action'
    if (currentBlock.type === 'character') nextType = 'dialogue'
    else if (currentBlock.type === 'dialogue') nextType = 'character'
    else if (currentBlock.type === 'parenthetical') nextType = 'dialogue'
    else if (currentBlock.type === 'scene-heading') nextType = 'action'

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
    if (e.key === 'Tab') {
      e.preventDefault()
      cycleElement(id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      addBlockAfter(id)
    } else if (e.key === 'Backspace') {
      const block = blocks.find(b => b.id === id)
      if (block?.text === '' && blocks.length > 1) {
        e.preventDefault()
        deleteBlock(id)
      }
    }
  }

  const handleFocus = (id: string) => {
    setFocusedId(id)
    const block = blocks.find(b => b.id === id)
    if (block) onElementChange(block.type)
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
        <div
          key={block.id}
          ref={el => {
            if (el) blockRefs.current.set(block.id, el)
            else blockRefs.current.delete(block.id)
          }}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => handleFocus(block.id)}
          onBlur={e => updateBlock(block.id, e.currentTarget.textContent || '')}
          onInput={e => updateBlock(block.id, (e.target as HTMLDivElement).textContent || '')}
          onKeyDown={e => handleKeyDown(e, block.id)}
          onPaste={e => {
            if (!onPaste) return
            const text = e.clipboardData.getData('text/plain')
            if (text && text.split('\n').length > 2) {
              e.preventDefault()
              onPaste(text)
            }
          }}
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
