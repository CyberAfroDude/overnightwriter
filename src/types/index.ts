export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'

export interface Writer {
  name: string
  credit: 'Screenplay By' | 'Story By'
}

export type ImportSource = 'owx' | 'fountain' | 'fdx' | 'txt'

export interface Script {
  id: string
  title: string
  writers: Writer[]
  contact_email: string
  contact_phone: string
  user_id: string
  created_at: string
  updated_at: string
  draft_count: number
  /**
   * If the script was created via the Import flow this records the source format
   * (`owx`, `fountain`, `fdx`, `txt`). `null`/`undefined` means the script was
   * authored from scratch in the editor.
   */
  import_source?: ImportSource | null
}

export interface Draft {
  id: string
  script_id: string
  draft_number: number
  content: DraftBlock[]
  created_at: string
  updated_at: string
}

export type InlineMarkType = 'bold' | 'italic' | 'underline' | 'strike'

export interface InlineMark {
  type: InlineMarkType
}

export interface InlineRun {
  type: 'text'
  text: string
  marks?: InlineMark[]
}

export interface DraftBlock {
  id: string
  type: ElementType
  text: string
  /**
   * Optional rich-text representation carrying inline marks (bold/italic/underline/strike).
   * When present, it is the source of truth for the block's body. `text` is kept as a plain-text
   * mirror for search, plain exports, and backward compatibility with older drafts.
   */
  richText?: InlineRun[]
  ai_written: boolean
}

export interface ApiKey {
  id: string
  user_id: string
  label: string
  key_prefix: string
  created_at: string
}
