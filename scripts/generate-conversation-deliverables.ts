/**
 * Reads artifacts/conversation-screenplay/source.json and writes PDF, FDX, TXT, OWX
 * using the same export/parsing pipeline as the app.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { Draft, DraftBlock, ElementType, Script } from '../src/types'
import { buildPlainTextExport, buildFdxDocument, buildScreenplayPdfJsDoc } from '../src/lib/export'
import { normalizeDraftBlocks } from '../src/lib/editor/screenplayDocAdapter'
import { parseOWXToBlocks } from '../src/lib/editor/owx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcePath = join(root, 'artifacts/conversation-screenplay/source.json')
const outDir = join(root, 'artifacts/conversation-screenplay')

interface SourceFile {
  title: string
  screenplayBy: string
  blocks: { type: ElementType; text: string }[]
}

type OWXBlockType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

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
  script: Array<{
    id: string
    type: OWXBlockType
    text: string
    source: 'human' | 'openclaw'
    created_at: string
    accepted: boolean
  }>
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

function randomId(): string {
  return crypto.randomUUID()
}

function countWords(blocks: DraftBlock[]): number {
  return blocks
    .map(block => block.text.trim().split(/\s+/).filter(Boolean).length)
    .reduce((sum, count) => sum + count, 0)
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
      characters: [
        ...new Set(
          normalized
            .filter(block => block.type === 'character' && block.text.trim())
            .map(block => block.text.trim().toUpperCase())
        )
      ],
      tone: '',
      rules: [],
      notes: ''
    },
    script: normalized.map(block => ({
      id: block.id || randomId(),
      type: toOWXType[block.type],
      text: block.text,
      source: block.ai_written ? 'openclaw' : 'human',
      created_at: now,
      accepted: true
    })),
    ai_sessions: []
  }
}

function sameTypeSequence(a: DraftBlock[], b: DraftBlock[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].type !== b[i].type) return false
  }
  return true
}

async function main() {
  const raw = readFileSync(sourcePath, 'utf8')
  const source = JSON.parse(raw) as SourceFile

  const now = new Date().toISOString()
  const script: Script = {
    id: 'artifact-overnight-terror',
    title: source.title,
    writers: [{ name: source.screenplayBy, credit: 'Screenplay By' }],
    contact_email: 'artifacts@overnightwriter.local',
    contact_phone: '',
    user_id: 'artifact',
    created_at: now,
    updated_at: now,
    draft_count: 1
  }

  const blocks: DraftBlock[] = source.blocks.map(b => ({
    id: randomId(),
    type: b.type,
    text: b.text,
    ai_written: true
  }))

  const draft: Draft = {
    id: 'artifact-draft-1',
    script_id: script.id,
    draft_number: 1,
    content: blocks,
    created_at: now,
    updated_at: now
  }

  mkdirSync(outDir, { recursive: true })
  const base = `${source.title} - Draft ${draft.draft_number}`

  const txt = buildPlainTextExport(script, draft)
  writeFileSync(join(outDir, `${base}.txt`), txt, 'utf8')

  const fdx = buildFdxDocument(script, draft)
  writeFileSync(join(outDir, `${base}.fdx`), fdx, 'utf8')

  const doc = await buildScreenplayPdfJsDoc(script, draft)
  const buf = doc.output('arraybuffer') as ArrayBuffer
  writeFileSync(join(outDir, `${base}.pdf`), Buffer.from(buf))

  const owxProject = buildOWXProject(script, draft, blocks)
  const owxPath = join(outDir, `${base}.owx`)
  const owxRaw = JSON.stringify(owxProject, null, 2)
  writeFileSync(owxPath, owxRaw, 'utf8')

  const parsed = parseOWXToBlocks(owxRaw)
  const expected = normalizeDraftBlocks(blocks)
  const countMatch = parsed.length === expected.length
  const typeSequenceMatch = sameTypeSequence(parsed, expected)
  if (!countMatch || !typeSequenceMatch) {
    throw new Error(
      `OWX round-trip validation failed (countMatch=${countMatch}, typeSequenceMatch=${typeSequenceMatch})`
    )
  }

  console.log('Wrote:', join(outDir, `${base}.pdf`))
  console.log('Wrote:', join(outDir, `${base}.fdx`))
  console.log('Wrote:', join(outDir, `${base}.txt`))
  console.log('Wrote:', owxPath)
  console.log(
    `OWX validation passed: parsed=${parsed.length}, expected=${expected.length}, typeSequenceMatch=${typeSequenceMatch}`
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
