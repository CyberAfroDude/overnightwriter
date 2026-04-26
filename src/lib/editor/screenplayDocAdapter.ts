import { JSONContent } from '@tiptap/core'
import { v4 as uuidv4 } from 'uuid'
import { DraftBlock, ElementType, InlineMark, InlineMarkType, InlineRun } from '../../types'

const SUPPORTED_MARK_TYPES: InlineMarkType[] = ['bold', 'italic', 'underline', 'strike']

const defaultBlock = (): DraftBlock => ({
  id: uuidv4(),
  type: 'scene-heading',
  text: '',
  ai_written: false
})

function sanitizeMarks(input: unknown): InlineMark[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: InlineMark[] = []
  const seen = new Set<InlineMarkType>()
  input.forEach(raw => {
    const t = (raw as { type?: string })?.type
    if (typeof t !== 'string') return
    if (!SUPPORTED_MARK_TYPES.includes(t as InlineMarkType)) return
    const marked = t as InlineMarkType
    if (seen.has(marked)) return
    seen.add(marked)
    out.push({ type: marked })
  })
  return out.length > 0 ? out : undefined
}

function sanitizeRichText(input: unknown): InlineRun[] | undefined {
  if (!Array.isArray(input)) return undefined
  const runs: InlineRun[] = []
  input.forEach(raw => {
    const node = raw as { type?: string; text?: unknown; marks?: unknown }
    if (node?.type !== 'text') return
    const text = typeof node.text === 'string' ? node.text : ''
    if (!text) return
    const marks = sanitizeMarks(node.marks)
    runs.push(marks ? { type: 'text', text, marks } : { type: 'text', text })
  })
  return runs.length > 0 ? runs : undefined
}

function richTextToPlain(runs?: InlineRun[]): string {
  if (!runs || runs.length === 0) return ''
  return runs.map(r => r.text).join('')
}

export function normalizeDraftBlocks(content: DraftBlock[]): DraftBlock[] {
  const blocks = Array.isArray(content) ? content : []
  if (blocks.length > 0) {
    const seenIds = new Set<string>()
    return blocks.map((block, index) => {
      const incomingId = typeof block.id === 'string' ? block.id.trim() : ''
      const id = incomingId && !seenIds.has(incomingId) ? incomingId : uuidv4()
      seenIds.add(id)

      const richText = sanitizeRichText((block as { richText?: unknown }).richText)
      const plainFallback = typeof block.text === 'string' ? block.text : ''
      const text = richText ? richTextToPlain(richText) : plainFallback

      const next: DraftBlock = {
        id,
        type: block.type || (index === 0 ? 'scene-heading' : 'action'),
        text,
        ai_written: block.ai_written ?? false
      }
      if (richText) next.richText = richText
      return next
    })
  }

  return [defaultBlock()]
}

function inlineRunToTipTap(run: InlineRun): JSONContent {
  const node: JSONContent = { type: 'text', text: run.text }
  if (run.marks && run.marks.length > 0) {
    node.marks = run.marks.map(m => ({ type: m.type }))
  }
  return node
}

export function draftBlocksToDoc(blocksInput: DraftBlock[]): JSONContent {
  const blocks = normalizeDraftBlocks(blocksInput)

  return {
    type: 'doc',
    content: blocks.map((block): JSONContent => {
      const inline: JSONContent[] = block.richText && block.richText.length > 0
        ? block.richText.map(inlineRunToTipTap)
        : block.text
          ? [{ type: 'text', text: block.text }]
          : []

      return {
        type: 'screenplayBlock',
        attrs: {
          blockId: block.id,
          screenplayType: block.type,
          aiWritten: block.ai_written
        },
        content: inline
      }
    })
  }
}

const flattenText = (node?: JSONContent): string => {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (!node.content || node.content.length === 0) return ''
  return node.content.map(flattenText).join('')
}

function nodeToInlineRun(node: JSONContent): InlineRun | null {
  if (node.type !== 'text' || typeof node.text !== 'string' || node.text.length === 0) return null
  const marks = sanitizeMarks(node.marks)
  return marks ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text }
}

function blockContentToRichText(content?: JSONContent[]): InlineRun[] | undefined {
  if (!content || content.length === 0) return undefined
  const runs: InlineRun[] = []
  content.forEach(node => {
    const run = nodeToInlineRun(node)
    if (run) runs.push(run)
  })
  if (runs.length === 0) return undefined
  // Only persist richText when at least one run actually carries marks. Keeps the
  // stored shape minimal for plain blocks (which is the common case).
  const hasAnyMark = runs.some(r => r.marks && r.marks.length > 0)
  return hasAnyMark ? runs : undefined
}

export function docToDraftBlocks(doc: JSONContent): DraftBlock[] {
  const content = Array.isArray(doc.content) ? doc.content : []

  const blocks: DraftBlock[] = content
    .filter(node => node.type === 'screenplayBlock')
    .map(node => {
      const attrs = (node.attrs || {}) as {
        blockId?: string
        screenplayType?: ElementType
        aiWritten?: boolean
      }
      const richText = blockContentToRichText(node.content)
      const text = flattenText(node)
      const block: DraftBlock = {
        id: attrs.blockId || uuidv4(),
        type: attrs.screenplayType || 'action',
        text,
        ai_written: attrs.aiWritten ?? false
      }
      if (richText) block.richText = richText
      return block
    })

  return normalizeDraftBlocks(blocks)
}
