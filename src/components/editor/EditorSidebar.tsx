import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Script, Draft } from '../../types'
import { supabase } from '../../lib/supabase'

interface Props {
  scripts: Script[]
  currentScriptId: string
  currentDraftNumber: number
  onDraftSwitch: (scriptId: string, draftNumber: number) => void
  onNewDraft: () => void
  onDeleteDraft?: (draftId: string, scriptId: string) => Promise<{ error: Error | null }>
  onDeleteScript?: (scriptId: string) => Promise<{ error: Error | null }>
}

export default function EditorSidebar({ scripts, currentScriptId, currentDraftNumber, onDraftSwitch, onNewDraft, onDeleteDraft, onDeleteScript }: Props) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [expandedScript, setExpandedScript] = useState<string | null>(currentScriptId)
  const [draftsByScript, setDraftsByScript] = useState<Record<string, Draft[]>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'draft' | 'script'; id: string; scriptId?: string } | null>(null)

  const displayName = user?.email?.split('@')[0] || 'Writer'
  const initials = displayName.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!expandedScript) return
    supabase
      .from('drafts')
      .select('id, draft_number, script_id, created_at')
      .eq('script_id', expandedScript)
      .order('draft_number', { ascending: true })
      .then(({ data }) => {
        if (data) setDraftsByScript(prev => ({ ...prev, [expandedScript]: data as Draft[] }))
      })
  }, [expandedScript])

  // Reload drafts when new draft is created
  useEffect(() => {
    if (!currentScriptId) return
    supabase
      .from('drafts')
      .select('id, draft_number, script_id, created_at')
      .eq('script_id', currentScriptId)
      .order('draft_number', { ascending: true })
      .then(({ data }) => {
        if (data) setDraftsByScript(prev => ({ ...prev, [currentScriptId]: data as Draft[] }))
      })
  }, [currentScriptId, currentDraftNumber])

  const handleDeleteDraft = async () => {
    if (!confirmDelete || !onDeleteDraft || confirmDelete.type !== 'draft' || !confirmDelete.scriptId) return
    const { error } = await onDeleteDraft(confirmDelete.id, confirmDelete.scriptId)
    if (!error) {
      // Refresh drafts list
      const { data } = await supabase
        .from('drafts')
        .select('id, draft_number, script_id, created_at')
        .eq('script_id', confirmDelete.scriptId)
        .order('draft_number', { ascending: true })
      if (data) setDraftsByScript(prev => ({ ...prev, [confirmDelete.scriptId!]: data as Draft[] }))
      // Navigate to draft 1 of this script
      navigate(`/editor/${confirmDelete.scriptId}/1`)
    }
    setConfirmDelete(null)
  }

  const handleDeleteScript = async () => {
    if (!confirmDelete || !onDeleteScript || confirmDelete.type !== 'script') return
    const { error } = await onDeleteScript(confirmDelete.id)
    if (!error) {
      navigate('/dashboard')
    }
    setConfirmDelete(null)
  }

  return (
    <div style={{ width: '224px', borderRight: '0.5px solid #e8e8e8', display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* Scripts list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {scripts.map(script => (
          <div key={script.id}>
            {/* Script row */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: script.id === currentScriptId ? '#f8f8f8' : 'transparent' }}>
              <div
                onClick={() => setExpandedScript(expandedScript === script.id ? null : script.id)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', minWidth: 0 }}
              >
                <span style={{ fontSize: '12px', letterSpacing: '0.03em', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {script.title}
                </span>
                <span style={{ fontSize: '10px', color: '#bbb', letterSpacing: '0.05em', flexShrink: 0, marginLeft: '6px' }}>
                  ({script.draft_count})
                </span>
              </div>
              {/* + button to add new draft — only show for current script */}
              {script.id === currentScriptId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onNewDraft() }}
                  title="New Draft"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '14px', padding: '0 0 0 6px', lineHeight: 1, flexShrink: 0 }}
                >
                  +
                </button>
              )}
              {/* Delete script button */}
              {onDeleteScript && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'script', id: script.id }) }}
                  title="Delete Script"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: '11px', padding: '0 0 0 6px', lineHeight: 1, flexShrink: 0 }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Drafts list */}
            {expandedScript === script.id && draftsByScript[script.id]?.map(d => (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '4px 20px 4px 28px',
                  fontSize: '11px', letterSpacing: '0.04em',
                  color: d.draft_number === currentDraftNumber && script.id === currentScriptId ? '#111' : '#999',
                  background: d.draft_number === currentDraftNumber && script.id === currentScriptId ? '#f4f4f4' : 'transparent'
                }}
              >
                <div
                  onClick={() => onDraftSwitch(script.id, d.draft_number)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <span style={{
                    width: '4px', height: '4px', borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                    background: d.draft_number === currentDraftNumber && script.id === currentScriptId ? '#111' : '#ddd'
                  }} />
                  Draft {d.draft_number}
                </div>
                {/* Delete draft button — only show if more than 1 draft */}
                {onDeleteDraft && draftsByScript[script.id] && draftsByScript[script.id].length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'draft', id: d.id, scriptId: script.id }) }}
                    title="Delete Draft"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: '10px', padding: '0 4px', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: '24px'
        }}>
          <div style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '12px',
            color: '#111',
            letterSpacing: '0.04em',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            {confirmDelete.type === 'script' ? 'Delete this script?' : 'Delete this draft?'}
          </div>
          <div style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '10px',
            color: '#999',
            letterSpacing: '0.04em',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            {confirmDelete.type === 'script' ? 'All drafts will be permanently removed.' : 'This cannot be undone.'}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setConfirmDelete(null)}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: 'transparent',
                color: '#999',
                border: '0.5px solid #e8e8e8',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete.type === 'script' ? handleDeleteScript : handleDeleteDraft}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '10px',
                letterSpacing: '0.1em',
                padding: '8px 16px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div style={{ borderTop: '0.5px solid #e8e8e8', position: 'relative', paddingBottom: '60px' }}>
        {settingsOpen && (
          <div style={{ position: 'absolute', bottom: '124px', left: '12px', right: '12px', background: '#fff', border: '0.5px solid #e5e5e5', zIndex: 200, boxShadow: '0 -4px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', padding: '10px 16px', color: '#666', cursor: 'pointer', letterSpacing: '0.04em' }} onClick={() => navigate('/settings')}>Settings</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', padding: '10px 16px', color: '#666', cursor: 'pointer', letterSpacing: '0.04em' }} onClick={() => navigate('/api-keys')}>API Keys</div>
            <div style={{ height: '0.5px', background: '#e8e8e8' }} />
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', padding: '10px 16px', color: '#dc2626', cursor: 'pointer', letterSpacing: '0.04em' }} onClick={async () => { await signOut(); navigate('/') }}>Sign Out</div>
          </div>
        )}
        <div onClick={() => setSettingsOpen(!settingsOpen)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', cursor: 'pointer' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f0f0f0', border: '0.5px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', letterSpacing: '0.05em', color: '#666', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: '9px', color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '1px' }}>Free Plan</div>
          </div>
          <span style={{ fontSize: '10px', color: '#bbb' }}>↑</span>
        </div>
      </div>
    </div>
  )
}
