import { DraftBlock } from '../../types'

export const SCREENPLAY_PDF_LAYOUT = {
  pageWidth: 8.5,
  pageHeight: 11,
  margin: { top: 1, bottom: 1, left: 1.5, right: 1 },
  lineHeight: 0.167,
  characterWidth: 0.1,
  characterIndent: 2,
  dialogueIndent: 1,
  parentheticalIndent: 1.5
}

export interface PaginatedLine {
  blockId: string
  type: DraftBlock['type']
  text: string
  x: number
  y: number
  align?: 'left' | 'right'
  fontStyle?: 'normal' | 'bold'
}

export interface ScreenplayPage {
  number: number
  lines: PaginatedLine[]
}

/**
 * Hard-pagination contracts
 * - Canonical source remains DraftBlock[].
 * - Pagination output is computed view data (segments), never persisted as source-of-truth.
 */
export interface PaginationSpec {
  pageHeightIn: number
  marginTopIn: number
  marginBottomIn: number
  // The line grid is currently fixed-width/courier-oriented.
  lineHeightIn: number
  minSplitLines: number
}

export interface PaginationStyle {
  beforeLines: number
  afterLines: number
  indentIn: number
  maxWidthIn: number
  uppercase?: boolean
  keepWithNext?: boolean
}

export interface BlockSegment {
  segmentId: string
  blockId: string
  type: DraftBlock['type']
  pageIndex: number
  pageRowStart: number
  pageRowEnd: number
  startLine: number
  endLine: number
  lines: string[]
}

export interface HardPaginatedPage {
  index: number
  number: number
  segments: BlockSegment[]
  usedLines: number
}

export interface HardPaginationResult {
  pages: HardPaginatedPage[]
  // Index where incremental recomputation can restart (future optimization hook).
  recomputeFromBlockIndex: number
}

const bottomY = () => SCREENPLAY_PDF_LAYOUT.pageHeight - SCREENPLAY_PDF_LAYOUT.margin.bottom
const bodyWidth = () => SCREENPLAY_PDF_LAYOUT.pageWidth - SCREENPLAY_PDF_LAYOUT.margin.left - SCREENPLAY_PDF_LAYOUT.margin.right
const charsForWidth = (widthInches: number) => Math.max(1, Math.floor(widthInches / SCREENPLAY_PDF_LAYOUT.characterWidth))

function wrapText(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n+/)
  const lines: string[] = []

  paragraphs.forEach(paragraph => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let current = ''

    words.forEach(word => {
      if (word.length > maxChars) {
        if (current) {
          lines.push(current)
          current = ''
        }
        for (let i = 0; i < word.length; i += maxChars) {
          lines.push(word.slice(i, i + maxChars))
        }
        return
      }

      const next = current ? `${current} ${word}` : word
      if (next.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
    })

    if (current) lines.push(current)
  })

  return lines.length > 0 ? lines : ['']
}

function makePage(number: number): ScreenplayPage {
  return { number, lines: [] }
}

export function paginateScreenplayBlocks(blocks: DraftBlock[]): ScreenplayPage[] {
  const pages: ScreenplayPage[] = [makePage(1)]
  let y = SCREENPLAY_PDF_LAYOUT.margin.top

  const currentPage = () => pages[pages.length - 1]
  const advance = (lines: number) => { y += lines * SCREENPLAY_PDF_LAYOUT.lineHeight }
  const ensureSpace = (lines: number) => {
    if (currentPage().lines.length === 0) return
    if (y + lines * SCREENPLAY_PDF_LAYOUT.lineHeight <= bottomY()) return
    pages.push(makePage(pages.length + 1))
    y = SCREENPLAY_PDF_LAYOUT.margin.top
  }
  const addLine = (block: DraftBlock, text: string, x: number, options: Pick<PaginatedLine, 'align' | 'fontStyle'> = {}) => {
    ensureSpace(1)
    currentPage().lines.push({
      blockId: block.id,
      type: block.type,
      text,
      x,
      y,
      ...options
    })
    advance(1)
  }

  blocks.forEach(block => {
    if (!block.text.trim()) return

    const x = SCREENPLAY_PDF_LAYOUT.margin.left
    switch (block.type) {
      case 'scene-heading': {
        ensureSpace(2.5)
        advance(1)
        addLine(block, block.text.toUpperCase(), x, { fontStyle: 'bold' })
        advance(0.5)
        break
      }
      case 'action': {
        const lines = wrapText(block.text, charsForWidth(bodyWidth()))
        ensureSpace(lines.length + 0.5)
        lines.forEach(line => addLine(block, line, x))
        advance(0.5)
        break
      }
      case 'character': {
        ensureSpace(1.5)
        advance(0.5)
        addLine(block, block.text.toUpperCase(), x + SCREENPLAY_PDF_LAYOUT.characterIndent)
        break
      }
      case 'dialogue': {
        const lines = wrapText(block.text, charsForWidth(bodyWidth() - 2))
        ensureSpace(lines.length + 0.5)
        lines.forEach(line => addLine(block, line, x + SCREENPLAY_PDF_LAYOUT.dialogueIndent))
        advance(0.5)
        break
      }
      case 'parenthetical': {
        ensureSpace(1)
        addLine(block, `(${block.text})`, x + SCREENPLAY_PDF_LAYOUT.parentheticalIndent)
        break
      }
      case 'transition': {
        ensureSpace(2)
        advance(0.5)
        addLine(block, block.text.toUpperCase(), SCREENPLAY_PDF_LAYOUT.pageWidth - SCREENPLAY_PDF_LAYOUT.margin.right, { align: 'right' })
        advance(0.5)
        break
      }
    }
  })

  return pages
}

const DEFAULT_SPEC: PaginationSpec = {
  pageHeightIn: SCREENPLAY_PDF_LAYOUT.pageHeight,
  marginTopIn: SCREENPLAY_PDF_LAYOUT.margin.top,
  marginBottomIn: SCREENPLAY_PDF_LAYOUT.margin.bottom,
  lineHeightIn: SCREENPLAY_PDF_LAYOUT.lineHeight,
  minSplitLines: 2
}

function styleForType(type: DraftBlock['type']): PaginationStyle {
  const fullWidth = bodyWidth()
  switch (type) {
    case 'scene-heading':
      return { beforeLines: 1, afterLines: 0.5, indentIn: 0, maxWidthIn: fullWidth, uppercase: true }
    case 'action':
      return { beforeLines: 0, afterLines: 0.5, indentIn: 0, maxWidthIn: fullWidth }
    case 'character':
      return { beforeLines: 0.5, afterLines: 0, indentIn: SCREENPLAY_PDF_LAYOUT.characterIndent, maxWidthIn: fullWidth - SCREENPLAY_PDF_LAYOUT.characterIndent, uppercase: true, keepWithNext: true }
    case 'dialogue':
      return { beforeLines: 0, afterLines: 0.5, indentIn: SCREENPLAY_PDF_LAYOUT.dialogueIndent, maxWidthIn: fullWidth - 2 }
    case 'parenthetical':
      return { beforeLines: 0, afterLines: 0, indentIn: SCREENPLAY_PDF_LAYOUT.parentheticalIndent, maxWidthIn: fullWidth - 2.5, keepWithNext: true }
    case 'transition':
      return { beforeLines: 0.5, afterLines: 0.5, indentIn: 0, maxWidthIn: fullWidth, uppercase: true }
  }
}

function linesPerPage(spec: PaginationSpec): number {
  return Math.floor((spec.pageHeightIn - spec.marginTopIn - spec.marginBottomIn) / spec.lineHeightIn)
}

function estimateBlockFootprint(block: DraftBlock): number {
  const raw = block.text || ''
  if (!raw.trim()) return 0
  const style = styleForType(block.type)
  const normalized = style.uppercase ? raw.toUpperCase() : raw
  const wrapped = wrapText(normalized, charsForWidth(style.maxWidthIn))
  return Math.ceil(style.beforeLines) + wrapped.length + Math.ceil(style.afterLines)
}

/**
 * Starter hard-pagination engine.
 *
 * Current behavior:
 * - Computes deterministic page/segment boundaries against a fixed line grid.
 * - Splits long blocks by wrapped lines across pages.
 *
 * Planned additions:
 * - widow/orphan tuning
 * - keep-with-next enforcement for grouped blocks
 * - incremental recomputation from changed block index
 */
export function paginateBlocksHard(
  blocks: DraftBlock[],
  spec: PaginationSpec = DEFAULT_SPEC
): HardPaginationResult {
  const maxLines = Math.max(1, linesPerPage(spec))
  const pages: HardPaginatedPage[] = [{ index: 0, number: 1, segments: [], usedLines: 0 }]
  let segmentCounter = 0

  const currentPage = () => pages[pages.length - 1]
  const newPage = () => {
    pages.push({ index: pages.length, number: pages.length + 1, segments: [], usedLines: 0 })
  }
  const consume = (count: number) => { currentPage().usedLines += count }
  const ensureRoom = (needed: number) => {
    if (currentPage().usedLines + needed <= maxLines) return
    newPage()
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const raw = block.text || ''
    if (!raw.trim()) continue
    const style = styleForType(block.type)

    if (style.keepWithNext) {
      const next = blocks[index + 1]
      if (next && next.text.trim()) {
        const groupedFootprint = estimateBlockFootprint(block) + estimateBlockFootprint(next)
        // Keep short grouped pairs together by starting them on the next page.
        if (groupedFootprint > 0 && groupedFootprint <= maxLines) {
          ensureRoom(groupedFootprint)
        }
      }
    }

    const normalized = style.uppercase ? raw.toUpperCase() : raw
    const wrapped = wrapText(normalized, charsForWidth(style.maxWidthIn))

    if (style.beforeLines > 0) {
      const before = Math.ceil(style.beforeLines)
      ensureRoom(before)
      consume(before)
    }

    let lineIdx = 0
    while (lineIdx < wrapped.length) {
      if (currentPage().usedLines >= maxLines) newPage()
      const capacity = maxLines - currentPage().usedLines
      const remaining = wrapped.length - lineIdx
      let take = Math.max(1, Math.min(capacity, remaining))
      if (block.type === 'dialogue' && remaining > spec.minSplitLines) {
        // Widow/orphan guard: avoid splitting dialogue into very short tails/heads across pages.
        if (take < spec.minSplitLines) {
          newPage()
          continue
        }
        const tail = remaining - take
        if (tail > 0 && tail < spec.minSplitLines) {
          take = Math.max(spec.minSplitLines, take - (spec.minSplitLines - tail))
        }
      }
      const slice = wrapped.slice(lineIdx, lineIdx + take)
      const startLine = lineIdx
      const endLine = lineIdx + take - 1
      currentPage().segments.push({
        segmentId: `${block.id}:${segmentCounter++}`,
        blockId: block.id,
        type: block.type,
        pageIndex: currentPage().index,
        pageRowStart: currentPage().usedLines,
        pageRowEnd: currentPage().usedLines + take - 1,
        startLine,
        endLine,
        lines: slice
      })
      consume(take)
      lineIdx += take
    }

    if (style.afterLines > 0) {
      const after = Math.ceil(style.afterLines)
      ensureRoom(after)
      consume(after)
    }
  }

  return { pages, recomputeFromBlockIndex: 0 }
}
