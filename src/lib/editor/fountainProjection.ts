import { Draft, DraftBlock, InlineMarkType, InlineRun, Script, Writer } from '../../types'

const FOUNTAIN_MARK_WRAPPERS: Record<InlineMarkType, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['_', '_'],
  // Fountain has no native strikethrough; pass the text through unchanged.
  strike: ['', '']
}

function runToFountain(run: InlineRun, uppercase: boolean): string {
  const text = uppercase ? run.text.toUpperCase() : run.text
  if (!run.marks || run.marks.length === 0) return text
  let wrapped = text
  // Apply in deterministic order so round-trips stay stable.
  const order: InlineMarkType[] = ['underline', 'italic', 'bold', 'strike']
  order.forEach(markType => {
    if (run.marks!.some(m => m.type === markType)) {
      const [open, close] = FOUNTAIN_MARK_WRAPPERS[markType]
      wrapped = `${open}${wrapped}${close}`
    }
  })
  return wrapped
}

function blockText(block: DraftBlock, uppercase = false): string {
  if (block.richText && block.richText.length > 0) {
    return block.richText.map(run => runToFountain(run, uppercase)).join('')
  }
  return uppercase ? block.text.toUpperCase() : block.text
}

export function blocksToFountain(blocks: DraftBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'scene-heading': return `\n${blockText(block, true)}\n`
      case 'action': return `\n${blockText(block)}\n`
      case 'character': return `\n${blockText(block, true)}`
      case 'dialogue': return blockText(block)
      case 'parenthetical': return `(${blockText(block)})`
      case 'transition': return `\n${blockText(block, true)}\n`
      default: return blockText(block)
    }
  }).join('\n').trim()
}

export function buildFountainSource(script: Script, draft: Draft): string {
  const screenplayBy = script.writers.filter((writer: Writer) => writer.credit === 'Screenplay By')
  const storyBy = script.writers.filter((writer: Writer) => writer.credit === 'Story By')

  const titleLines = [
    `Title: ${script.title}`,
    screenplayBy.length > 0 ? `Screenplay By: ${screenplayBy.map((writer: Writer) => writer.name).join(' & ')}` : '',
    storyBy.length > 0 ? `Story By: ${storyBy.map((writer: Writer) => writer.name).join(' & ')}` : '',
    script.contact_email ? `Contact: ${script.contact_email}` : '',
    script.contact_phone ? `Phone: ${script.contact_phone}` : '',
    '---',
    ''
  ].filter(Boolean).join('\n')

  return `${titleLines}\n${blocksToFountain(draft.content)}`.trim()
}
