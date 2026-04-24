import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useScripts, useDraft } from '../hooks/useScripts'
import { useAutosave } from '../hooks/useAutosave'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import { useViewport } from '../hooks/useViewport'
import { supabase } from '../lib/supabase'
import { Script, DraftBlock, ElementType } from '../types'
import ScreenplayEditor, { ELEMENT_LABELS } from '../components/editor/ScreenplayEditor'
import TitlePage from '../components/editor/TitlePage'
import EditorSidebar from '../components/editor/EditorSidebar'
import AIGenerateBar from '../components/editor/AIGenerateBar'
import PricingModal from '../components/pricing/PricingModal'
import { exportFountain, exportTXT, exportFDX, exportPDF } from '../lib/export'
import { canAccess } from '../lib/config'
import { v4 as uuidv4 } from 'uuid'

const FloppyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="3.5" y="1" width="5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="3" y="7" width="8" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="0.8"/>
    <line x1="7.5" y1="1.5" x2="7.5" y2="4" stroke="currentColor" strokeWidth="0.8"/>
  </svg>
)

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <line x1="7" y1="10" x2="7" y2="2" stroke="currentColor" strokeWidth="1"/>
    <polyline points="4,5 7,2 10,5" stroke="currentColor" strokeWidth="1" fill="none"/>
    <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1"/>
  </svg>
)

// FIX #8: Smart paste parser
function detectElementType(line: string, prevType: ElementType): ElementType {
  const t = line.trim()
  if (!t) return 'action'
  if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return 'scene-heading'
  if (/^\(.*\)$/.test(t)) return 'parenthetical'
  if (/^(FADE|CUT TO|SMASH CUT|DISSOLVE|MATCH CUT)/i.test(t)) return 'transition'
  if (/^[A-Z][A-Z0-9\s'"\-\.]+$/.test(t) && t.length < 50 && !t.includes(',')) {
    if (prevType === 'dialogue' || prevType === 'parenthetical' || prevType === 'scene-heading' || prevType === 'action') return 'character'
  }
  if (prevType === 'character' || prevType === 'parenthetical') return 'dialogue'
  return 'action'
}

function parsePastedText(text: string): DraftBlock[] {
  const lines = text.split('\n')
  const blocks: DraftBlock[] = []
  let lastType: ElementType = 'action'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const type = detectElementType(trimmed, lastType)
    // Clean up text based on type
    let cleanText = trimmed
    if (type === 'scene-heading') cleanText = trimmed.toUpperCase()
    if (type === 'character') cleanText = trimmed.toUpperCase()
    if (type === 'parenthetical') cleanText = trimmed.replace(/^\(|\)$/g, '')
    blocks.push({ id: uuidv4(), type, text: cleanText, ai_written: false })
    lastType = type
  }
  return blocks.length > 0 ? blocks : [{ id: uuidv4(), type: 'scene-heading', text: '', ai_written: false }]
}

export default function Editor() {
  const { scriptId, draftNumber } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { plan } = useSubscription()
  const { scripts, fetchScripts, deleteScript, createScript } = useScripts()
  const { draft, loading, saveDraft, createNewDraft, deleteDraft } = useDraft(
    scriptId || null,
    draftNumber ? parseInt(draftNumber) : null
  )

  const [script, setScript] = useState<Script | null>(null)
  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [currentElement, setCurrentElement] = useState<ElementType>('scene-heading')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [autosaveEnabled] = useState(true)
  const [showSavedNotice, setShowSavedNotice] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [showScenePanel, setShowScenePanel] = useState(false)
  const [showNewScriptModal, setShowNewScriptModal] = useState(false)
  const [newScriptTitle, setNewScriptTitle] = useState('')
  const isSwitchingRef = useRef(false)
  const { isMobile } = useViewport()

  // Load script metadata
  useEffect(() => {
    if (!scriptId) return
    supabase.from('scripts').select('*').eq('id', scriptId).single()
      .then(({ data }) => { if (data) setScript(data) })
  }, [scriptId])

  // FIX #4: Only reset blocks when draft ID actually changes
  useEffect(() => {
    if (draft?.content) {
      setBlocks(draft.content)
    }
  }, [draft?.id])

  const handleSave = useCallback(async (content: DraftBlock[]) => {
    await saveDraft(content)
  }, [saveDraft])

  const { saving, manualSave } = useAutosave(blocks, handleSave, autosaveEnabled)

  const handleManualSave = async () => {
    await manualSave()
    setShowSavedNotice(true)
    setTimeout(() => setShowSavedNotice(false), 2000)
  }

  // FIX #4: Save before switching drafts
  const handleDraftSwitch = async (newScriptId: string, newDraftNumber: number) => {
    if (isSwitchingRef.current) return
    isSwitchingRef.current = true
    await saveDraft(blocks)
    navigate(`/editor/${newScriptId}/${newDraftNumber}`)
    setTimeout(() => { isSwitchingRef.current = false }, 600)
  }

  // Cmd+G shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        setGenerateOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleBlocksGenerated = (newBlocks: DraftBlock[]) => {
    setBlocks(prev => [...prev, ...newBlocks])
  }

  // FIX #3: New draft only via dedicated button — guard against double-click
  const creatingDraftRef = useRef(false)
  const handleNewDraft = async () => {
    if (!draft || !scriptId || creatingDraftRef.current) return
    creatingDraftRef.current = true
    await saveDraft(blocks)
    const newDraft = await createNewDraft(scriptId, { ...draft, content: blocks })
    if (newDraft) {
      await fetchScripts()
      navigate(`/editor/${scriptId}/${newDraft.draft_number}`)
    }
    setTimeout(() => { creatingDraftRef.current = false }, 1000)
  }

  // + Script flow
  const handleNewScript = async () => {
    if (!newScriptTitle.trim()) return
    const { script: newScript, draft: newDraft, error } = await createScript(
      newScriptTitle.trim(),
      [{ name: user?.email?.split('@')[0] || 'Writer', credit: 'Screenplay By' }],
      user?.email || '',
      ''
    )
    if (!error && newScript && newDraft) {
      setShowNewScriptModal(false)
      setNewScriptTitle('')
      navigate(`/editor/${newScript.id}/${newDraft.draft_number}`)
    }
  }

  const handleExport = async (format: string) => {
    if (!script || !draft) return
    const currentDraft = { ...draft, content: blocks }
    setExportOpen(false)
    if (format === 'fountain') exportFountain(script, currentDraft)
    else if (format === 'txt') exportTXT(script, currentDraft)
    else if (format === 'fdx') exportFDX(script, currentDraft)
    else if (format === 'pdf') await exportPDF(script, currentDraft)
  }

  // FIX #8: Smart paste handler
  const handlePaste = useCallback((pastedText: string) => {
    if (pastedText.trim().length < 10) return false
    const parsed = parsePastedText(pastedText)
    if (parsed.length > 1) {
      setBlocks(parsed)
      return true
    }
    return false
  }, [])

  // FIX #9: Scene and character analysis
  const scenes = blocks.filter(b => b.type === 'scene-heading' && b.text.trim())
  const characters = [...new Set(
    blocks.filter(b => b.type === 'character' && b.text.trim())
      .map(b => b.text.trim().toUpperCase())
  )].sort()

  const showAds = !canAccess(plan, 'nomad')
  const adHeight = showAds ? 60 : 0

  if (loading || !script || !draft) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '12px', color: '#ccc', letterSpacing: '0.08em' }}>
          Loading...
        </div>
      </div>
    )
  }

  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '5px 7px', color: '#111', display: 'flex', alignItems: 'center',
    justifyContent: 'center', position: 'relative' as const
  }

  // Mobile-responsive styles
  const sidebarWidth = isMobile ? '100%' : '224px'
  const pagePadding = isMobile ? '16px' : '1in 1.5in'
  const titlePagePadding = isMobile ? '40px 24px' : '1in 1.5in'

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#fff', overflow: 'hidden' }}>

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{
          position: isMobile ? 'absolute' : 'relative',
          top: 0, left: 0, bottom: 0,
          width: sidebarWidth,
          zIndex: isMobile ? 150 : 1,
          background: '#fff'
        }}>
          <EditorSidebar
            scripts={scripts}
            currentScriptId={scriptId || ''}
            currentDraftNumber={parseInt(draftNumber || '1')}
            onDraftSwitch={handleDraftSwitch}
            onNewDraft={handleNewDraft}
            onDeleteDraft={deleteDraft}
            onDeleteScript={deleteScript}
          />
          {isMobile && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed',
                top: 0, right: 0, bottom: 0,
                width: '40px',
                background: 'rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span style={{ color: '#999', fontSize: '18px' }}>›</span>
            </div>
          )}
        </div>
      )}

      {/* Main editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: isMobile ? '10px 12px' : '10px 16px', borderBottom: '0.5px solid #e8e8e8', gap: isMobile ? '6px' : '10px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
            <span style={{ display: 'block', width: '18px', height: '1px', background: '#111' }} />
            <span style={{ display: 'block', width: '18px', height: '1px', background: '#111' }} />
            <span style={{ display: 'block', width: '18px', height: '1px', background: '#111' }} />
          </button>

          <div style={{ fontFamily: '"EB Garamond", serif', fontSize: '14px', letterSpacing: '0.04em', color: '#111', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {script.title} — Draft {draftNumber}
          </div>

          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '0.15em', color: '#bbb', border: '0.5px solid #e8e8e8', padding: '3px 8px', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {ELEMENT_LABELS[currentElement]}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {!isMobile && (
              <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '0.08em', color: '#ccc', whiteSpace: 'nowrap', padding: '0 4px' }}>
                {saving ? '● saving' : showSavedNotice ? '● saved' : '● autosaved'}
              </div>
            )}

            {/* Floppy save */}
            <button onClick={handleManualSave} style={iconBtnStyle} title="Save"><FloppyIcon /></button>

            {/* + Script button */}
            {!isMobile && (
              <button onClick={() => setShowNewScriptModal(true)} style={{ ...iconBtnStyle, fontSize: '9px', letterSpacing: '0.1em', fontFamily: '"DM Mono", monospace', color: '#111', padding: '5px 8px', border: '0.5px solid #111' }} title="New Script">
                + Script
              </button>
            )}

            {/* FIX #9: Scene/Character panel toggle */}
            {!isMobile && (
              <button
                onClick={() => setShowScenePanel(!showScenePanel)}
                title="Scenes & Characters"
                style={{ ...iconBtnStyle, fontSize: '9px', letterSpacing: '0.1em', fontFamily: '"DM Mono", monospace', color: showScenePanel ? '#111' : '#aaa', padding: '5px 8px', border: showScenePanel ? '0.5px solid #111' : '0.5px solid #e8e8e8' }}
              >
                ¶
              </button>
            )}

            {/* AI generate */}
            <button
              onClick={() => setGenerateOpen(prev => !prev)}
              title="AI Write (Cmd+G)"
              style={{ ...iconBtnStyle, fontSize: '9px', letterSpacing: '0.1em', fontFamily: '"DM Mono", monospace', color: generateOpen ? '#fff' : '#111', background: generateOpen ? '#111' : 'transparent', border: '0.5px solid', borderColor: generateOpen ? '#111' : '#111', padding: '4px 10px', gap: '4px' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1L6.2 3.8L9 4.5L6.8 6.8L7.3 9.5L5 8.1L2.7 9.5L3.2 6.8L1 4.5L3.8 3.8L5 1Z" stroke="currentColor" strokeWidth="0.8" fill="none"/>
              </svg>
              AI
            </button>

            {/* Export */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setExportOpen(!exportOpen)} style={iconBtnStyle} title="Export"><ExportIcon /></button>
              {exportOpen && (
                <div style={{ position: 'absolute', top: '30px', right: 0, background: '#fff', border: '0.5px solid #e5e5e5', minWidth: '150px', zIndex: 50 }} onMouseLeave={() => setExportOpen(false)}>
                  {[
                    { label: 'PDF', ext: '.pdf', format: 'pdf' },
                    { label: 'Fountain', ext: '.fountain', format: 'fountain' },
                    { label: 'Final Draft', ext: '.fdx', format: 'fdx' },
                    { label: 'Plain Text', ext: '.txt', format: 'txt' },
                  ].map(opt => (
                    <div key={opt.format} onClick={() => handleExport(opt.format)}
                      style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', letterSpacing: '0.06em', padding: '10px 16px', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                      <span>{opt.label}</span>
                      <span style={{ color: '#ccc', fontSize: '9px' }}>{opt.ext}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Page area */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', background: '#fff', paddingBottom: `${adHeight + 40}px` }}>

            {/* Title page */}
            <div style={{
              width: '100%', maxWidth: '8.5in',
              background: '#fff',
              border: '0.5px solid #d0d0d0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
              marginBottom: '24px'
            }}>
              <TitlePage script={script} />
            </div>

            {/* Page break between title page and script */}
            <div style={{ width: '100%', maxWidth: '8.5in', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#ddd' }} />
              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#ccc', letterSpacing: '0.15em' }}>PAGE 1</span>
              <div style={{ flex: 1, height: '0.5px', background: '#ddd' }} />
            </div>

            {/* Screenplay page */}
            <div style={{
              width: '100%', maxWidth: '8.5in', minHeight: '11in',
              background: '#fff',
              border: '0.5px solid #d0d0d0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
              padding: pagePadding, boxSizing: 'border-box'
            }}>
              <div style={{ textAlign: 'right', fontFamily: '"DM Mono", monospace', fontSize: '10px', color: '#ccc', marginBottom: '24px' }}>1.</div>
              <ScreenplayEditor
                blocks={blocks}
                onChange={setBlocks}
                onElementChange={setCurrentElement}
                onPaste={handlePaste}
              />
            </div>

            <div style={{ height: '80px' }} />
          </div>

          {/* FIX #9: Scene & Character panel */}
          {showScenePanel && !isMobile && (
            <div style={{ width: '200px', borderLeft: '0.5px solid #e8e8e8', overflowY: 'auto', flexShrink: 0, padding: '16px 0', background: '#fff' }}>
              <div style={{ padding: '0 16px 12px', borderBottom: '0.5px solid #f0f0f0', marginBottom: '12px' }}>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '0.15em', color: '#aaa', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Scenes ({scenes.length})
                </div>
                {scenes.map((s, i) => (
                  <div key={i} style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#666', letterSpacing: '0.03em', padding: '3px 0', lineHeight: 1.6, borderBottom: '0.5px solid #f8f8f8' }}>
                    <span style={{ color: '#ccc', marginRight: '6px' }}>{i + 1}.</span>
                    {s.text}
                  </div>
                ))}
                {scenes.length === 0 && <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#ccc' }}>No scenes yet</div>}
              </div>
              <div style={{ padding: '0 16px' }}>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', letterSpacing: '0.15em', color: '#aaa', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Characters ({characters.length})
                </div>
                {characters.map((c, i) => (
                  <div key={i} style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#666', letterSpacing: '0.03em', padding: '3px 0', lineHeight: 1.6 }}>
                    {c}
                  </div>
                ))}
                {characters.length === 0 && <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#ccc' }}>No characters yet</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Generate Bar — FIX #2: positioned above ad banner */}
      <AIGenerateBar
        isOpen={generateOpen}
        onClose={() => setGenerateOpen(false)}
        currentBlocks={blocks}
        onBlocksGenerated={handleBlocksGenerated}
        onOpenPricing={() => { setGenerateOpen(false); setPricingOpen(true) }}
        bottomOffset={adHeight}
      />

      {/* New Script Modal */}
      {showNewScriptModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.95)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', border: '0.5px solid #e8e8e8',
            padding: '40px', maxWidth: '400px', width: '90%'
          }}>
            <div style={{
              fontFamily: '"EB Garamond", serif', fontSize: '18px',
              color: '#111', marginBottom: '24px', letterSpacing: '0.04em'
            }}>
              New Script
            </div>
            <input
              type="text"
              placeholder="Script title..."
              value={newScriptTitle}
              onChange={e => setNewScriptTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNewScript() }}
              autoFocus
              style={{
                fontFamily: '"DM Mono", monospace', fontSize: '13px',
                width: '100%', padding: '10px 0', border: 'none',
                borderBottom: '0.5px solid #ccc', outline: 'none',
                background: 'transparent', color: '#111', marginBottom: '24px'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowNewScriptModal(false); setNewScriptTitle('') }}
                style={{
                  fontFamily: '"DM Mono", monospace', fontSize: '10px',
                  letterSpacing: '0.1em', padding: '8px 16px',
                  background: 'transparent', color: '#999',
                  border: '0.5px solid #e8e8e8', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleNewScript}
                disabled={!newScriptTitle.trim()}
                style={{
                  fontFamily: '"DM Mono", monospace', fontSize: '10px',
                  letterSpacing: '0.1em', padding: '8px 16px',
                  background: '#111', color: '#fff',
                  border: 'none', cursor: newScriptTitle.trim() ? 'pointer' : 'not-allowed',
                  opacity: newScriptTitle.trim() ? 1 : 0.5
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} highlightPlan="writer" />
    </div>
  )
}
