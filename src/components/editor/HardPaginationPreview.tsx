import { useMemo, type CSSProperties } from 'react'
import { DraftBlock } from '../../types'
import { paginateBlocksHard } from '../../lib/editor/screenplayPagination'

interface Props {
  blocks: DraftBlock[]
}

const pageStyle: CSSProperties = {
  width: '100%',
  maxWidth: '8.5in',
  minHeight: '11in',
  background: '#fff',
  border: '0.5px solid #d0d0d0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
  padding: '1in 1.5in 1in 1.5in',
  boxSizing: 'border-box'
}

function renderSegmentLine(type: DraftBlock['type'], line: string, idx: number) {
  const base: CSSProperties = {
    margin: 0,
    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
    fontSize: '12pt',
    lineHeight: 1.5,
    color: '#111',
    whiteSpace: 'pre-wrap'
  }

  const styleByType: Record<DraftBlock['type'], CSSProperties> = {
    'scene-heading': { textTransform: 'uppercase', fontWeight: 700, marginTop: '0.6em' },
    action: { marginTop: '0.25em' },
    character: { textTransform: 'uppercase', paddingLeft: '2.2in', marginTop: '0.4em' },
    dialogue: { paddingLeft: '1.2in', paddingRight: '1.2in' },
    parenthetical: { fontStyle: 'italic', paddingLeft: '1.7in', paddingRight: '1.7in' },
    transition: { textTransform: 'uppercase', textAlign: 'right', marginTop: '0.25em' }
  }

  return (
    <p key={idx} style={{ ...base, ...styleByType[type] }}>
      {line}
    </p>
  )
}

export default function HardPaginationPreview({ blocks }: Props) {
  const result = useMemo(() => paginateBlocksHard(blocks), [blocks])

  return (
    <div style={{ width: '100%', padding: '24px', overflowY: 'auto', background: '#fafafa' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        {result.pages.map(page => (
          <div key={page.index} style={pageStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#aaa', letterSpacing: '0.1em' }}>
                HARD PREVIEW
              </span>
              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#aaa', letterSpacing: '0.1em' }}>
                PAGE {page.number}
              </span>
            </div>
            {page.segments.map(segment => (
              <div key={segment.segmentId}>
                {segment.lines.map((line, idx) => renderSegmentLine(segment.type, line, idx))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
