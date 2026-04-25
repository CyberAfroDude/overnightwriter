import { Fountain } from 'fountain-js'
import { v4 as uuidv4 } from 'uuid'
import { DraftBlock, ElementType } from '../../types'
import { normalizeDraftBlocks } from './screenplayDocAdapter'

interface FountainToken {
  type: string
  text?: string
}

const TITLE_PAGE_KEYS = new Set([
  'title',
  'credit',
  'author',
  'authors',
  'source',
  'notes',
  'draft date',
  'date',
  'contact',
  'copyright',
  'revision',
  'screenplay by',
  'story by',
  'phone'
])

function stripTitlePage(source: string): string {
  const lines = source.replace(/\r\n|\r/g, '\n').split('\n')
  const firstContentLine = lines.find(line => line.trim())
  const firstKey = firstContentLine?.split(':')[0]?.trim().toLowerCase()

  if (!firstKey || !TITLE_PAGE_KEYS.has(firstKey)) return source

  const separatorIndex = lines.findIndex(line => line.trim() === '---')
  if (separatorIndex === -1) return source
  return lines.slice(separatorIndex + 1).join('\n')
}

const cleanTokenText = (text?: string): string => (text || '').trim()

const cleanParenthetical = (text?: string): string => cleanTokenText(text).replace(/^\(|\)$/g, '')

function blockFromToken(token: FountainToken): DraftBlock | null {
  const text = cleanTokenText(token.text)

  switch (token.type) {
    case 'scene_heading':
      return { id: uuidv4(), type: 'scene-heading', text: text.toUpperCase(), ai_written: false }
    case 'action':
    case 'centered':
    case 'lyrics':
      if (!text || text === '---') return null
      return { id: uuidv4(), type: 'action', text, ai_written: false }
    case 'character':
      return { id: uuidv4(), type: 'character', text: text.toUpperCase(), ai_written: false }
    case 'dialogue':
      return { id: uuidv4(), type: 'dialogue', text, ai_written: false }
    case 'parenthetical':
      return { id: uuidv4(), type: 'parenthetical', text: cleanParenthetical(text), ai_written: false }
    case 'transition':
      return { id: uuidv4(), type: 'transition', text: text.toUpperCase(), ai_written: false }
    default:
      return null
  }
}

export function parseFountainToBlocks(source: string): DraftBlock[] {
  const body = stripTitlePage(source)
  const parsed = new Fountain().parse(body, true)
  const tokens = (parsed.tokens || []) as FountainToken[]
  const blocks = tokens
    .map(blockFromToken)
    .filter((block): block is DraftBlock => Boolean(block))

  return normalizeDraftBlocks(blocks)
}
