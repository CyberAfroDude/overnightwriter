import { Script, Writer } from '../../types'

interface Props {
  script: Script
}

export default function TitlePage({ script }: Props) {
  // Group writers by credit type
  const screenplayBy = script.writers.filter((w: Writer) => w.credit === 'Screenplay By')
  const storyBy = script.writers.filter((w: Writer) => w.credit === 'Story By')

  return (
    <div style={{
      width: '100%',
      minHeight: '11in',
      background: '#fff',
      padding: '1in 1.5in 1in 1.5in',
      fontFamily: '"DM Mono", monospace',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxSizing: 'border-box'
    }}>
      {/* Center block */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {/* Title */}
        <div style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '16px',
          fontWeight: 400,
          color: '#111',
          lineHeight: 1.3,
          marginBottom: '32px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          {script.title}
        </div>

        {/* Screenplay By group */}
        {screenplayBy.length > 0 && (
          <div style={{ marginBottom: storyBy.length > 0 ? '20px' : 0 }}>
            <div style={{ fontSize: '12px', color: '#888', letterSpacing: '0.06em', marginBottom: '6px', fontFamily: '"DM Mono", monospace' }}>
              Screenplay by
            </div>
            <div style={{ fontSize: '13px', color: '#333', letterSpacing: '0.04em', fontFamily: '"DM Mono", monospace', lineHeight: 1.8 }}>
              {screenplayBy.map((w: Writer, i: number) => (
                <span key={i}>
                  {w.name}{i < screenplayBy.length - 1 ? ' & ' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Story By group */}
        {storyBy.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', color: '#888', letterSpacing: '0.06em', marginBottom: '6px', fontFamily: '"DM Mono", monospace' }}>
              Story by
            </div>
            <div style={{ fontSize: '13px', color: '#333', letterSpacing: '0.04em', fontFamily: '"DM Mono", monospace', lineHeight: 1.8 }}>
              {storyBy.map((w: Writer, i: number) => (
                <span key={i}>
                  {w.name}{i < storyBy.length - 1 ? ' & ' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contact bottom left */}
      <div style={{
        fontSize: '11px',
        color: '#999',
        lineHeight: 1.8,
        letterSpacing: '0.03em',
        alignSelf: 'flex-start',
        fontFamily: '"DM Mono", monospace'
      }}>
        {script.contact_email && <div>{script.contact_email}</div>}
        {script.contact_phone && <div>{script.contact_phone}</div>}
      </div>
    </div>
  )
}
