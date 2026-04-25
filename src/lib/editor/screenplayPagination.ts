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
