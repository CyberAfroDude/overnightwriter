import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Script, Draft, DraftBlock, Writer } from '../types'
import { useAuth } from './useAuth'
import { v4 as uuidv4 } from 'uuid'

export function useScripts() {
  const { user } = useAuth()
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)

  const fetchScripts = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('scripts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setScripts(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchScripts() }, [fetchScripts])

  const createScript = async (
    title: string,
    writers: Writer[],
    contactEmail: string,
    contactPhone: string
  ): Promise<{ script: Script | null; draft: Draft | null; error: Error | null }> => {
    if (!user) return { script: null, draft: null, error: new Error('Not authenticated') }

    const { data: scriptData, error: scriptError } = await supabase
      .from('scripts')
      .insert({
        title,
        writers,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        user_id: user.id,
        draft_count: 1
      })
      .select()
      .single()

    if (scriptError || !scriptData) return { script: null, draft: null, error: scriptError as Error }

    const initialBlock: DraftBlock = {
      id: uuidv4(),
      type: 'scene-heading',
      text: '',
      ai_written: false
    }

    const { data: draftData, error: draftError } = await supabase
      .from('drafts')
      .insert({
        script_id: scriptData.id,
        draft_number: 1,
        content: [initialBlock]
      })
      .select()
      .single()

    if (draftError) return { script: scriptData, draft: null, error: draftError as Error }

    await fetchScripts()
    return { script: scriptData, draft: draftData, error: null }
  }

  const deleteScript = async (scriptId: string): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error('Not authenticated') }
    // Delete drafts first (FK constraint), then script
    await supabase.from('drafts').delete().eq('script_id', scriptId)
    const { error } = await supabase.from('scripts').delete().eq('id', scriptId)
    if (!error) await fetchScripts()
    return { error: error as Error | null }
  }

  return { scripts, loading, fetchScripts, createScript, deleteScript }
}

export function useDraft(scriptId: string | null, draftNumber: number | null) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDraft = useCallback(async () => {
    if (!scriptId || !draftNumber) { setLoading(false); return }
    const { data } = await supabase
      .from('drafts')
      .select('*')
      .eq('script_id', scriptId)
      .eq('draft_number', draftNumber)
      .single()
    setDraft(data)
    setLoading(false)
  }, [scriptId, draftNumber])

  useEffect(() => { fetchDraft() }, [fetchDraft])

  const saveDraft = async (content: DraftBlock[]) => {
    if (!draft) return
    const { data } = await supabase
      .from('drafts')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', draft.id)
      .select()
      .single()
    if (data) setDraft(data)
  }

  const getDraftsForScript = async (scriptId: string): Promise<Draft[]> => {
    const { data } = await supabase
      .from('drafts')
      .select('*')
      .eq('script_id', scriptId)
      .order('draft_number', { ascending: true })
    return data || []
  }

  const createNewDraft = async (scriptId: string, baseDraft: Draft): Promise<Draft | null> => {
    const newDraftNumber = baseDraft.draft_number + 1
    const { data, error } = await supabase
      .from('drafts')
      .insert({
        script_id: scriptId,
        draft_number: newDraftNumber,
        content: baseDraft.content
      })
      .select()
      .single()

    if (error) return null

    await supabase
      .from('scripts')
      .update({ draft_count: newDraftNumber, updated_at: new Date().toISOString() })
      .eq('id', scriptId)

    return data
  }

  const deleteDraft = async (draftId: string, scriptId: string): Promise<{ error: Error | null }> => {
    // Get remaining drafts count after deletion
    const { data: remaining } = await supabase
      .from('drafts')
      .select('draft_number')
      .eq('script_id', scriptId)
      .neq('id', draftId)
      .order('draft_number', { ascending: true })

    if (!remaining || remaining.length === 0) {
      return { error: new Error('Cannot delete the last draft') }
    }

    const { error } = await supabase.from('drafts').delete().eq('id', draftId)
    if (error) return { error: error as Error }

    // Renumber remaining drafts sequentially
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('drafts')
        .update({ draft_number: i + 1 })
        .eq('script_id', scriptId)
        .eq('draft_number', remaining[i].draft_number)
    }

    // Update script draft_count
    await supabase
      .from('scripts')
      .update({ draft_count: remaining.length, updated_at: new Date().toISOString() })
      .eq('id', scriptId)

    return { error: null }
  }

  return { draft, loading, saveDraft, getDraftsForScript, createNewDraft, deleteDraft, refetch: fetchDraft }
}
