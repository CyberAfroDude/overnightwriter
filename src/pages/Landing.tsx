import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useViewport } from '../hooks/useViewport'

export default function Landing() {
  const { signIn, signUp, signInWithOAuth, signInWithMagicLink } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'none' | 'signin' | 'signup' | 'magic'>('none')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const handleSubmit = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    setError('')
    const { error } = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard')
  }

  const handleMagicLink = async () => {
    if (!email) { setError('Please enter your email.'); return }
    setLoading(true)
    setError('')
    const { error } = await signInWithMagicLink(email)
    setLoading(false)
    if (error) { setError(error.message); return }
    setMagicSent(true)
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError('')
    const { error } = await signInWithOAuth(provider)
    setLoading(false)
    if (error) setError(error.message)
    // OAuth redirects, so no navigate needed
  }

  const { isMobile } = useViewport()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fff',
      padding: isMobile ? '24px' : '40px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>

        {/* Logo */}
        <div style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '11px',
          letterSpacing: '0.25em',
          color: '#bbb',
          textTransform: 'uppercase',
          marginBottom: '28px'
        }}>
          Est. 2025
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: '"EB Garamond", serif',
          fontSize: 'clamp(40px, 8vw, 64px)',
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: '#111',
          margin: '0 0 14px 0'
        }}>
          OvernightWriter
        </h1>

        {/* Tagline */}
        <p style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '12px',
          fontWeight: 300,
          letterSpacing: '0.12em',
          color: '#888',
          margin: '0 0 52px 0'
        }}>
          Wake up to your next draft.
        </p>

        {/* Auth Form */}
        {mode === 'none' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px', alignItems: 'center' }}>
            {/* Social login buttons */}
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                letterSpacing: '0.08em',
                padding: '11px 28px',
                background: '#fff',
                color: '#444',
                border: '0.5px solid #ddd',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: isMobile ? '100%' : '260px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth('apple')}
              disabled={loading}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                letterSpacing: '0.08em',
                padding: '11px 28px',
                background: '#111',
                color: '#fff',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: isMobile ? '100%' : '260px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              Continue with Apple
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: isMobile ? '100%' : '260px', margin: '8px 0' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#e8e8e8' }} />
              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#ccc', letterSpacing: '0.1em' }}>or</span>
              <div style={{ flex: 1, height: '0.5px', background: '#e8e8e8' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', width: isMobile ? '100%' : 'auto' }}>
              <button
                onClick={() => setMode('signin')}
                style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  padding: '11px 28px',
                  background: 'transparent',
                  color: '#666',
                  border: '0.5px solid #ccc',
                  cursor: 'pointer',
                  flex: isMobile ? 1 : 'auto'
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => setMode('signup')}
                style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  padding: '11px 28px',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  flex: isMobile ? 1 : 'auto'
                }}
              >
                Sign Up Free
              </button>
            </div>

            <button
              onClick={() => setMode('magic')}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '10px',
                letterSpacing: '0.08em',
                padding: '8px 16px',
                background: 'transparent',
                color: '#999',
                border: 'none',
                cursor: 'pointer',
                marginTop: '4px'
              }}
            >
              ✉ Magic Link
            </button>
          </div>
        ) : mode === 'magic' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            {magicSent ? (
              <>
                <p style={{ fontFamily: '"DM Mono", monospace', fontSize: '12px', color: '#22c55e', letterSpacing: '0.05em' }}>
                  ✓ Magic link sent! Check your email.
                </p>
                <button
                  onClick={() => { setMode('none'); setMagicSent(false); setEmail('') }}
                  style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '11px',
                    letterSpacing: '0.1em',
                    padding: '11px 28px',
                    background: 'transparent',
                    color: '#aaa',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ← back
                </button>
              </>
            ) : (
              <>
                <p style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', color: '#888', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Enter your email and we'll send you a magic link.
                </p>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
                  style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '13px',
                    width: isMobile ? '100%' : '300px',
                    padding: '10px 0',
                    border: 'none',
                    borderBottom: '0.5px solid #ccc',
                    outline: 'none',
                    background: 'transparent',
                    color: '#111'
                  }}
                />
                {error && (
                  <p style={{ fontSize: '11px', color: '#dc2626', letterSpacing: '0.05em' }}>{error}</p>
                )}
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button
                    onClick={() => { setMode('none'); setError('') }}
                    style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '11px',
                      letterSpacing: '0.1em',
                      padding: '11px 20px',
                      background: 'transparent',
                      color: '#aaa',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ← back
                  </button>
                  <button
                    onClick={handleMagicLink}
                    disabled={loading}
                    style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '11px',
                      letterSpacing: '0.1em',
                      padding: '11px 28px',
                      background: '#111',
                      color: '#fff',
                      border: 'none',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    {loading ? '...' : 'Send Link'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '13px',
                width: isMobile ? '100%' : '300px',
                padding: '10px 0',
                border: 'none',
                borderBottom: '0.5px solid #ccc',
                outline: 'none',
                background: 'transparent',
                color: '#111'
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '13px',
                width: isMobile ? '100%' : '300px',
                padding: '10px 0',
                border: 'none',
                borderBottom: '0.5px solid #ccc',
                outline: 'none',
                background: 'transparent',
                color: '#111'
              }}
            />
            {error && (
              <p style={{ fontSize: '11px', color: '#dc2626', letterSpacing: '0.05em' }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => { setMode('none'); setError('') }}
                style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  padding: '11px 20px',
                  background: 'transparent',
                  color: '#aaa',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ← back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  padding: '11px 28px',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up Free'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
