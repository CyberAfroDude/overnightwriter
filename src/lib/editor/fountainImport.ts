import { Fountain } from 'fountain-js'
import { v4 as uuidv4 } from 'uuid'
import {
  DraftBlock,
  ElementType,
  InlineMark,
  InlineRun,
  Writer,
} from '../../types'
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
  'phone',
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

/**
 * Parse Fountain inline emphasis (`**bold**`, `*italic*`, `_underline_`, escapes)
 * into our InlineRun model. Returns runs with marks where they apply, or a single
 * unmarked run when the text has no markers.
 */
function parseFountainInlineMarks(input: string): InlineRun[] {
  const runs: InlineRun[] = []
  let buf = ''
  let bold = false
  let italic = false
  let underline = false

  const flush = () => {
    if (!buf) return
    const marks: InlineMark[] = []
    if (bold) marks.push({ type: 'bold' })
    if (italic) marks.push({ type: 'italic' })
    if (underline) marks.push({ type: 'underline' })
    const run: InlineRun = { type: 'text', text: buf }
    if (marks.length > 0) run.marks = marks
    runs.push(run)
    buf = ''
  }

  let i = 0
  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]
    if (ch === '\\' && next !== undefined) {
      buf += next
      i += 2
      continue
    }
    if (ch === '*' && next === '*') {
      flush()
      bold = !bold
      i += 2
      continue
    }
    if (ch === '*') {
      flush()
      italic = !italic
      i += 1
      continue
    }
    if (ch === '_') {
      flush()
      underline = !underline
      i += 1
      continue
    }
    buf += ch
    i += 1
  }
  flush()
  return runs
}

function stripFountainMarks(text: string): string {
  return parseFountainInlineMarks(text).map(r => r.text).join('')
}

function maybeAttachRichText(text: string, transform: (s: string) => string = s => s): {
  text: string
  richText?: InlineRun[]
} {
  const runs = parseFountainInlineMarks(text)
  const hasMarks = runs.some(r => r.marks && r.marks.length > 0)
  const plainParts: string[] = []
  const transformedRuns: InlineRun[] = []
  for (const run of runs) {
    const t = transform(run.text)
    plainParts.push(t)
    transformedRuns.push(run.marks ? { type: 'text', text: t, marks: run.marks } : { type: 'text', text: t })
  }
  return {
    text: plainParts.join(''),
    richText: hasMarks ? transformedRuns : undefined,
  }
}

function blockFromToken(token: FountainToken): DraftBlock | null {
  const text = cleanTokenText(token.text)

  switch (token.type) {
    case 'scene_heading': {
      const { text: plain, richText } = maybeAttachRichText(text, s => s.toUpperCase())
      return { id: uuidv4(), type: 'scene-heading', text: plain, richText, ai_written: false }
    }
    case 'action':
    case 'centered':
    case 'lyrics': {
      if (!text || text === '---') return null
      const { text: plain, richText } = maybeAttachRichText(text)
      return { id: uuidv4(), type: 'action', text: plain, richText, ai_written: false }
    }
    case 'character': {
      const { text: plain, richText } = maybeAttachRichText(text, s => s.toUpperCase())
      return { id: uuidv4(), type: 'character', text: plain, richText, ai_written: false }
    }
    case 'dialogue': {
      const { text: plain, richText } = maybeAttachRichText(text)
      return { id: uuidv4(), type: 'dialogue', text: plain, richText, ai_written: false }
    }
    case 'parenthetical': {
      const stripped = cleanParenthetical(text)
      const { text: plain, richText } = maybeAttachRichText(stripped)
      return { id: uuidv4(), type: 'parenthetical', text: plain, richText, ai_written: false }
    }
    case 'transition': {
      const { text: plain, richText } = maybeAttachRichText(text, s => s.toUpperCase())
      return { id: uuidv4(), type: 'transition', text: plain, richText, ai_written: false }
    }
    default:
      return null
  }
}

export interface FountainImportPayload {
  blocks: DraftBlock[]
  title?: string
  writers?: Writer[]
}

function parseTitlePageMetadata(tokens: FountainToken[]): { title?: string; writers?: Writer[] } {
  let title: string | undefined
  const writers: Writer[] = []

  const splitNames = (raw: string): string[] =>
    raw.split(/\s*&\s*|\s*,\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean)

  for (const token of tokens) {
    if (!token.text) continue
    const text = stripFountainMarks(token.text).replace(/\s+/g, ' ').trim()
    if (!text) continue

    if (token.type === 'title') {
      title = text
    } else if (token.type === 'author' || token.type === 'authors') {
      splitNames(text).forEach(name => writers.push({ name, credit: 'Screenplay By' }))
    }
  }

  return {
    title,
    writers: writers.length > 0 ? writers : undefined,
  }
}

export function parseFountainImport(source: string): FountainImportPayload {
  const fountain = new Fountain()
  // Pass full source so fountain-js sees the title page.
  const parsed = fountain.parse(source, true)
  const tokens = (parsed.tokens || []) as FountainToken[]

  const { title, writers } = parseTitlePageMetadata(tokens)

  // Body blocks: ignore title-page-only token types.
  const titlePageTypes = new Set([
    'title', 'credit', 'author', 'authors', 'source', 'notes',
    'draft_date', 'date', 'contact', 'copyright', 'revision',
  ])
  const blocks = tokens
    .filter(t => !titlePageTypes.has(t.type))
    .map(blockFromToken)
    .filter((block): block is DraftBlock => Boolean(block))

  return {
    blocks: normalizeDraftBlocks(blocks),
    title,
    writers,
  }
}

/** @deprecated Use `parseFountainImport` for full title-page + inline-mark fidelity. */
export function parseFountainToBlocks(source: string): DraftBlock[] {
  // Preserve legacy call sites that just want the body blocks.
  // Fall back to the title-page-stripping path so behavior is unchanged for
  // call sites that expect the old block-only output.
  const body = stripTitlePage(source)
  return parseFountainImport(body).blocks
}
