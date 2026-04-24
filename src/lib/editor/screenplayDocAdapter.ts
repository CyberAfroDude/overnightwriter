import { JSONContent } from '@tiptap/core'
import { v4 as uuidv4 } from 'uuid'
import { DraftBlock, ElementType } from '../../types'

const defaultBlock = (): DraftBlock => ({
  id: uuidv4(),
  type: 'scene-heading',
  text: '',
  ai_written: false
})

export function normalizeDraftBlocks(content: DraftBlock[]): DraftBlock[] {
  const blocks = Array.isArray(content) ? content : []
  if (blocks.length > 0) {
    return blocks.map((block, index) => ({
      id: block.id || uuidv4(),
      type: block.type || (index === 0 ? 'scene-heading' : 'action'),
      text: block.text || '',
      ai_written: block.ai_written ?? false
    }))
  }

  return [defaultBlock()]
}

export function draftBlocksToDoc(blocksInput: DraftBlock[]): JSONContent {
  const blocks = normalizeDraftBlocks(blocksInput)

  return {
    type: 'doc',
    content: blocks.map((block): JSONContent => ({
      type: 'screenplayBlock',
      attrs: {
        blockId: block.id,
        screenplayType: block.type,
        aiWritten: block.ai_written
      },
      content: block.text
        ? [{ type: 'text', text: block.text }]
        : []
    }))
  }
}

const flattenText = (node?: JSONContent): string => {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (!node.content || node.content.length === 0) return ''
  return node.content.map(flattenText).join('')
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
      return {
        id: attrs.blockId || uuidv4(),
        type: attrs.screenplayType || 'action',
        text: flattenText(node),
        ai_written: attrs.aiWritten ?? false
      }
    })

  return normalizeDraftBlocks(blocks)
}
