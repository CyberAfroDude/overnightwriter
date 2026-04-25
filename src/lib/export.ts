import { DraftBlock, Script, Draft, Writer } from '../types'
import { buildFountainSource } from './editor/fountainProjection'
import { paginateBlocksHard, SCREENPLAY_PDF_LAYOUT } from './editor/screenplayPagination'

function buildTitlePageText(script: Script): string {
  const screenplayBy = script.writers.filter((w: Writer) => w.credit === 'Screenplay By')
  const storyBy = script.writers.filter((w: Writer) => w.credit === 'Story By')
  const lines: string[] = []
  lines.push(script.title.toUpperCase())
  lines.push('')
  if (screenplayBy.length > 0) {
    lines.push('Screenplay by')
    lines.push(screenplayBy.map((w: Writer) => w.name).join(' & '))
  }
  if (storyBy.length > 0) {
    lines.push('')
    lines.push('Story by')
    lines.push(storyBy.map((w: Writer) => w.name).join(' & '))
  }
  lines.push('')
  if (script.contact_email) lines.push(script.contact_email)
  if (script.contact_phone) lines.push(script.contact_phone)
  return lines.join('\n')
}

export function exportFountain(script: Script, draft: Draft) {
  downloadFile(`${script.title} - Draft ${draft.draft_number}.fountain`, buildFountainSource(script, draft), 'text/plain')
}

export function exportTXT(script: Script, draft: Draft) {
  const titleSection = buildTitlePageText(script)
  const body = draft.content.map(b => {
    switch (b.type) {
      case 'scene-heading': return `\n${b.text.toUpperCase()}\n`
      case 'character': return `\n                    ${b.text.toUpperCase()}`
      case 'dialogue': return `          ${b.text}`
      case 'parenthetical': return `               (${b.text})`
      case 'transition': return `\n${b.text.toUpperCase()}`
      default: return `\n${b.text}`
    }
  }).join('\n').trim()

  const full = titleSection + '\n\n---\n\n' + body
  downloadFile(`${script.title} - Draft ${draft.draft_number}.txt`, full, 'text/plain')
}

export function exportFDX(script: Script, draft: Draft) {
  const screenplayBy = script.writers.filter((w: Writer) => w.credit === 'Screenplay By')
  const storyBy = script.writers.filter((w: Writer) => w.credit === 'Story By')

  const elements = draft.content.map(b => {
    const typeMap: Record<string, string> = {
      'scene-heading': 'Scene Heading',
      'action': 'Action',
      'character': 'Character',
      'dialogue': 'Dialogue',
      'parenthetical': 'Parenthetical',
      'transition': 'Transition'
    }
    return `    <Paragraph Type="${typeMap[b.type] || 'Action'}">
      <Text>${escapeXml(b.text)}</Text>
    </Paragraph>`
  }).join('\n')

  const screenplayCredit = screenplayBy.length > 0
    ? `<Paragraph Alignment="Center" Type="Custom"><Text>Screenplay by ${escapeXml(screenplayBy.map((w: Writer) => w.name).join(' &amp; '))}</Text></Paragraph>`
    : ''
  const storyCredit = storyBy.length > 0
    ? `<Paragraph Alignment="Center" Type="Custom"><Text>Story by ${escapeXml(storyBy.map((w: Writer) => w.name).join(' &amp; '))}</Text></Paragraph>`
    : ''

  const fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
${elements}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Custom">
        <Text>${escapeXml(script.title)}</Text>
      </Paragraph>
      ${screenplayCredit}
      ${storyCredit}
    </Content>
  </TitlePage>
</FinalDraft>`

  downloadFile(`${script.title} - Draft ${draft.draft_number}.fdx`, fdx, 'text/xml')
}

export async function exportPDF(script: Script, draft: Draft) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'in', format: 'letter' })
  const { margin, pageWidth, lineHeight } = SCREENPLAY_PDF_LAYOUT

  doc.setFont('Courier', 'normal')
  doc.setFontSize(12)

  // Title page
  const screenplayBy = script.writers.filter((w: Writer) => w.credit === 'Screenplay By')
  const storyBy = script.writers.filter((w: Writer) => w.credit === 'Story By')

  doc.setFontSize(14)
  doc.text(script.title.toUpperCase(), pageWidth / 2, 3.5, { align: 'center' })

  let creditY = 4.1
  doc.setFontSize(12)

  if (screenplayBy.length > 0) {
    doc.setFont('Courier', 'normal')
    doc.text('Screenplay by', pageWidth / 2, creditY, { align: 'center' })
    creditY += lineHeight * 1.8
    doc.text(screenplayBy.map((w: Writer) => w.name).join(' & '), pageWidth / 2, creditY, { align: 'center' })
    creditY += lineHeight * 2.5
  }

  if (storyBy.length > 0) {
    doc.text('Story by', pageWidth / 2, creditY, { align: 'center' })
    creditY += lineHeight * 1.8
    doc.text(storyBy.map((w: Writer) => w.name).join(' & '), pageWidth / 2, creditY, { align: 'center' })
  }

  doc.setFontSize(10)
  const contactLines = [script.contact_email, script.contact_phone].filter(Boolean) as string[]
  contactLines.forEach((line, i) => {
    doc.text(line, margin.left, 9 + i * lineHeight * 1.5)
  })

  // Script pages
  doc.addPage()
  doc.setFontSize(12)
  const pages = paginateBlocksHard(draft.content).pages
  const textX = (type: DraftBlock['type']) => {
    switch (type) {
      case 'character':
        return margin.left + SCREENPLAY_PDF_LAYOUT.characterIndent
      case 'dialogue':
        return margin.left + SCREENPLAY_PDF_LAYOUT.dialogueIndent
      case 'parenthetical':
        return margin.left + SCREENPLAY_PDF_LAYOUT.parentheticalIndent
      case 'transition':
        return pageWidth - margin.right
      default:
        return margin.left
    }
  }
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) doc.addPage()

    doc.setFontSize(10)
    doc.setFont('Courier', 'normal')
    doc.text(`${pageIndex + 1}.`, pageWidth - margin.right, margin.top - 0.3, { align: 'right' })
    doc.setFontSize(12)

    page.segments.forEach(segment => {
      const x = textX(segment.type)
      segment.lines.forEach((line, lineIndex) => {
        const y = margin.top + (segment.pageRowStart + lineIndex + 1) * lineHeight
        switch (segment.type) {
        case 'scene-heading':
          doc.setFont('Courier', 'bold')
          doc.text(line, x, y)
          doc.setFont('Courier', 'normal')
          break
        case 'transition':
          doc.setFont('Courier', 'normal')
          doc.text(line, x, y, { align: 'right' })
          break
        case 'action':
        case 'character':
        case 'dialogue':
        case 'parenthetical':
          doc.setFont('Courier', 'normal')
          doc.text(line, x, y)
          break
        default:
          break
        }
      })
    })
  })

  doc.save(`${script.title} - Draft ${draft.draft_number}.pdf`)
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
