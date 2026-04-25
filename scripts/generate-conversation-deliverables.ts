/**
 * Reads artifacts/conversation-screenplay/source.json and writes PDF, FDX, TXT
 * using the same export pipeline as the app (see src/lib/export.ts).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { Draft, DraftBlock, ElementType, Script } from '../src/types'
import { buildPlainTextExport, buildFdxDocument, buildScreenplayPdfJsDoc } from '../src/lib/export'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcePath = join(root, 'artifacts/conversation-screenplay/source.json')
const outDir = join(root, 'artifacts/conversation-screenplay')

interface SourceFile {
  title: string
  screenplayBy: string
  blocks: { type: ElementType; text: string }[]
}

function randomId(): string {
  return crypto.randomUUID()
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
  console.log('Wrote:', join(outDir, `${base}.pdf`))
  console.log('Wrote:', join(outDir, `${base}.fdx`))
  console.log('Wrote:', join(outDir, `${base}.txt`))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
