import { Draft, DraftBlock, Script, Writer } from '../../types'

export function blocksToFountain(blocks: DraftBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'scene-heading': return `\n${block.text.toUpperCase()}\n`
      case 'action': return `\n${block.text}\n`
      case 'character': return `\n${block.text.toUpperCase()}`
      case 'dialogue': return block.text
      case 'parenthetical': return `(${block.text})`
      case 'transition': return `\n${block.text.toUpperCase()}\n`
      default: return block.text
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
