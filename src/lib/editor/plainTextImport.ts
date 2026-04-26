import { v4 as uuidv4 } from 'uuid'
import { DraftBlock, ElementType } from '../../types'

export function detectElementType(line: string, prevType: ElementType): ElementType {
  const t = line.trim()
  if (!t) return 'action'
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return 'scene-heading'
  if (/^\(.*\)$/.test(t)) return 'parenthetical'
  if (/^(FADE|CUT TO|SMASH CUT|DISSOLVE|MATCH CUT)/i.test(t)) return 'transition'
  if (/^[A-Z][A-Z0-9\s'"\-\.]+$/.test(t) && t.length < 50 && !t.includes(',')) {
    if (prevType === 'dialogue' || prevType === 'parenthetical' || prevType === 'scene-heading' || prevType === 'action') return 'character'
  }
  if (prevType === 'character' || prevType === 'parenthetical') return 'dialogue'
  return 'action'
}

export function parsePastedText(text: string): DraftBlock[] {
  const lines = text.split('\n')
  const blocks: DraftBlock[] = []
  let lastType: ElementType = 'action'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const type = detectElementType(trimmed, lastType)
    let cleanText = trimmed
    if (type === 'scene-heading') cleanText = trimmed.toUpperCase()
    if (type === 'character') cleanText = trimmed.toUpperCase()
    if (type === 'parenthetical') cleanText = trimmed.replace(/^\(|\)$/g, '')
    blocks.push({ id: uuidv4(), type, text: cleanText, ai_written: false })
    lastType = type
  }
  return blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'scene-heading', text: '', ai_written: false }]
}
