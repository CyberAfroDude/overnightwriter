import { ElementType } from '../../types'

export const ELEMENT_CYCLE: ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition'
]

export const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading': 'Scene Heading',
  'action': 'Action',
  'character': 'Character',
  'dialogue': 'Dialogue',
  'parenthetical': 'Parenthetical',
  'transition': 'Transition'
}

export const ELEMENT_PLACEHOLDERS: Record<ElementType, string> = {
  'scene-heading': 'INT./EXT. LOCATION - DAY/NIGHT',
  'action': 'Action description...',
  'character': 'CHARACTER NAME',
  'dialogue': 'Dialogue...',
  'parenthetical': '(beat)',
  'transition': 'CUT TO:'
}

export const defaultNextType = (type: ElementType): ElementType => {
  if (type === 'character') return 'dialogue'
  if (type === 'dialogue') return 'character'
  if (type === 'parenthetical') return 'dialogue'
  if (type === 'scene-heading') return 'action'
  if (type === 'transition') return 'scene-heading'
  return 'action'
}
