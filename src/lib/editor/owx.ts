import { v4 as uuidv4 } from 'uuid'
import { Draft, DraftBlock, ElementType, Script } from '../../types'
import { normalizeDraftBlocks } from './screenplayDocAdapter'

type OWXBlockType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

interface OWXBlock {
  id: string
  type: OWXBlockType
  text: string
  source: 'human' | 'openclaw'
  created_at: string
  accepted: boolean
}

interface OWXProject {
  format: 'OWX'
  version: '1.0'
  metadata: {
    title: string
    author: string
    created_with: 'OvernightWriter'
    created_at: string
    updated_at: string
    mode: 'screenplay'
    word_count: number
    page_estimate: number
    project_id: string
    export_version: number
  }
  story_bible: {
    logline: string
    characters: string[]
    tone: string
    rules: string[]
    notes: string
  }
  script: OWXBlock[]
  ai_sessions: Array<Record<string, unknown>>
}

const toOWXType: Record<ElementType, OWXBlockType> = {
  'scene-heading': 'scene_heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition'
}

const toElementType: Record<OWXBlockType, ElementType> = {
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition'
}

function safeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')
}

function countWords(blocks: DraftBlock[]): number {
  return blocks
    .map(block => block.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((sum, count) => sum + count, 0)
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function primaryAuthor(script: Script): string {
  const screenplayBy = script.writers.filter(writer => writer.credit === 'Screenplay By').map(writer => writer.name)
  const storyBy = script.writers.filter(writer => writer.credit === 'Story By').map(writer => writer.name)
  const names = screenplayBy.length > 0 ? screenplayBy : storyBy
  return names.length > 0 ? names.join(' & ') : 'Unknown'
}

function buildOWXProject(script: Script, draft: Draft, blocks: DraftBlock[]): OWXProject {
  const now = new Date().toISOString()
  const normalized = normalizeDraftBlocks(blocks)
  const wordCount = countWords(normalized)
  return {
    format: 'OWX',
    version: '1.0',
    metadata: {
      title: script.title,
      author: primaryAuthor(script),
      created_with: 'OvernightWriter',
      created_at: draft.created_at || now,
      updated_at: now,
      mode: 'screenplay',
      word_count: wordCount,
      page_estimate: Math.max(1, Math.round(wordCount / 200)),
      project_id: script.id,
      export_version: 1
    },
    story_bible: {
      logline: '',
      characters: [...new Set(normalized.filter(block => block.type === 'character' && block.text.trim()).map(block => block.text.trim().toUpperCase()))],
      tone: '',
      rules: [],
      notes: ''
    },
    script: normalized.map(block => ({
      id: block.id || uuidv4(),
      type: toOWXType[block.type],
      text: block.text,
      source: block.ai_written ? 'openclaw' : 'human',
      created_at: now,
      accepted: true
    })),
    ai_sessions: []
  }
}

export function exportOWX(script: Script, draft: Draft, blocks: DraftBlock[]) {
  const project = buildOWXProject(script, draft, blocks)
  triggerDownload(
    JSON.stringify(project, null, 2),
    `${safeFilename(script.title)} - Draft ${draft.draft_number}.owx`,
    'application/json;charset=utf-8'
  )
}

function validateOWX(value: unknown): asserts value is OWXProject {
  if (!value || typeof value !== 'object') throw new Error('OWX file is not a valid JSON object.')
  const parsed = value as Partial<OWXProject>
  if (parsed.format !== 'OWX') throw new Error('Not a valid OWX file (missing format: "OWX").')
  if (parsed.version !== '1.0') throw new Error(`Unsupported OWX version: ${String(parsed.version || 'unknown')}.`)
  if (!Array.isArray(parsed.script)) throw new Error('OWX file is missing a valid script array.')
}

export function parseOWXToBlocks(source: string): DraftBlock[] {
  const parsed = JSON.parse(source) as unknown
  validateOWX(parsed)
  const blocks = parsed.script
    .map((block): DraftBlock | null => {
      if (!block || typeof block !== 'object') return null
      const item = block as Partial<OWXBlock>
      if (typeof item.text !== 'string' || !item.text.trim()) return null
      if (!item.type || !(item.type in toElementType)) return null
      return {
        id: item.id || uuidv4(),
        type: toElementType[item.type as OWXBlockType],
        text: item.text,
        ai_written: item.source === 'openclaw'
      }
    })
    .filter((block): block is DraftBlock => Boolean(block))

  return normalizeDraftBlocks(blocks)
}
