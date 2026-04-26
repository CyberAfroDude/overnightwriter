import { v4 as uuidv4 } from 'uuid'
import {
  DraftBlock,
  ElementType,
  InlineMark,
  InlineMarkType,
  InlineRun,
  Writer,
} from '../../types'
import { normalizeDraftBlocks } from './screenplayDocAdapter'

export interface FdxImportPayload {
  blocks: DraftBlock[]
  title?: string
  writers?: Writer[]
}

const TYPE_MAP: Record<string, ElementType> = {
  'scene heading': 'scene-heading',
  'action': 'action',
  'character': 'character',
  'dialogue': 'dialogue',
  'parenthetical': 'parenthetical',
  'transition': 'transition',
  'shot': 'action',
  'general': 'action',
}

const STYLE_MAP: Record<string, InlineMarkType> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  strikeout: 'strike',
}

function parseStyleAttribute(style: string | null | undefined): InlineMark[] {
  if (!style) return []
  const tokens = style.split(/[+,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
  const marks: InlineMark[] = []
  const seen = new Set<InlineMarkType>()
  for (const token of tokens) {
    const mark = STYLE_MAP[token]
    if (mark && !seen.has(mark)) {
      seen.add(mark)
      marks.push({ type: mark })
    }
  }
  return marks
}

function getDirectChildren(parent: Element, tagName: string): Element[] {
  const matches: Element[] = []
  const target = tagName.toLowerCase()
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (child.tagName.toLowerCase() === target) matches.push(child)
  }
  return matches
}

function paragraphToBlock(p: Element): DraftBlock | null {
  const typeAttr = (p.getAttribute('Type') || '').toLowerCase().trim()
  const mappedType = TYPE_MAP[typeAttr]
  if (!mappedType) return null

  const textNodes = getDirectChildren(p, 'Text')
  if (textNodes.length === 0) return null

  const runs: InlineRun[] = []
  const plainParts: string[] = []
  for (const node of textNodes) {
    const text = node.textContent || ''
    if (!text) continue
    const marks = parseStyleAttribute(node.getAttribute('Style'))
    const run: InlineRun = { type: 'text', text }
    if (marks.length > 0) run.marks = marks
    runs.push(run)
    plainParts.push(text)
  }

  let plain = plainParts.join('')
  if (mappedType === 'scene-heading' || mappedType === 'character' || mappedType === 'transition') {
    plain = plain.toUpperCase()
  }
  if (mappedType === 'parenthetical') {
    plain = plain.replace(/^\s*\(/, '').replace(/\)\s*$/, '')
  }
  plain = plain.replace(/\s+/g, ' ').trim()
  if (!plain) return null

  const block: DraftBlock = {
    id: uuidv4(),
    type: mappedType,
    text: plain,
    ai_written: false,
  }
  const hasMarks = runs.some(r => r.marks && r.marks.length > 0)
  if (hasMarks) block.richText = runs
  return block
}

function collectTitlePageLines(doc: Document): string[] {
  const titlePage = doc.querySelector('TitlePage')
  if (!titlePage) return []
  const contentEl = getDirectChildren(titlePage, 'Content')[0]
  const root = contentEl || titlePage
  const lines: string[] = []
  for (const para of getDirectChildren(root, 'Paragraph')) {
    const texts = getDirectChildren(para, 'Text')
    const text = texts.map(t => t.textContent || '').join('').trim()
    if (text) lines.push(text)
  }
  return lines
}

function parseTitlePage(doc: Document): { title?: string; writers?: Writer[] } {
  const lines = collectTitlePageLines(doc)
  if (lines.length === 0) return {}

  let title: string | undefined
  const writers: Writer[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const screenplayMatch = line.match(/^(?:screenplay\s+by|written\s+by|by)\s*[:\-]?\s*(.+)$/i)
    const storyMatch = line.match(/^story\s+by\s*[:\-]?\s*(.+)$/i)
    if (screenplayMatch) {
      screenplayMatch[1].split(/\s*&\s*|\s*,\s*|\s+and\s+/i).forEach(name => {
        const trimmed = name.trim()
        if (trimmed) writers.push({ name: trimmed, credit: 'Screenplay By' })
      })
    } else if (storyMatch) {
      storyMatch[1].split(/\s*&\s*|\s*,\s*|\s+and\s+/i).forEach(name => {
        const trimmed = name.trim()
        if (trimmed) writers.push({ name: trimmed, credit: 'Story By' })
      })
    } else if (!title) {
      title = line
    }
  }

  return {
    title: title?.trim() || undefined,
    writers: writers.length > 0 ? writers : undefined,
  }
}

export function parseFdxImport(source: string): FdxImportPayload {
  if (typeof DOMParser === 'undefined') {
    throw new Error('FDX import requires a browser environment.')
  }
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Could not read this .fdx file (invalid XML).')
  }

  const root = doc.querySelector('FinalDraft')
  if (!root) {
    throw new Error('Not a Final Draft (.fdx) document.')
  }

  const blocks: DraftBlock[] = []
  const contentRoots = doc.querySelectorAll('FinalDraft > Content')
  contentRoots.forEach(content => {
    for (const para of getDirectChildren(content, 'Paragraph')) {
      const block = paragraphToBlock(para)
      if (block) blocks.push(block)
    }
  })

  const titlePage = parseTitlePage(doc)

  return {
    blocks: normalizeDraftBlocks(blocks),
    title: titlePage.title,
    writers: titlePage.writers,
  }
}
