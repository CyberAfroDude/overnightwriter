import { useEffect, useRef } from 'react'
import { useSubscription } from '../../hooks/useSubscription'
import { ADSENSE_CONFIG, canAccess } from '../../lib/config'

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

export default function AdBanner() {
  const { plan, loading } = useSubscription()
  const adRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // Hide for any paid plan (nomad+)
  const showAds = !loading && !canAccess(plan, 'nomad')

  useEffect(() => {
    if (!showAds || initialized.current) return

    // Load AdSense script if not already loaded
    const existingScript = document.querySelector('script[src*="adsbygoogle"]')
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CONFIG.publisherId}`
      script.async = true
      script.crossOrigin = 'anonymous'
      document.head.appendChild(script)

      script.onload = () => {
        try {
          window.adsbygoogle = window.adsbygoogle || []
          window.adsbygoogle.push({})
          initialized.current = true
        } catch (e) {
          console.error('AdSense error:', e)
        }
      }
    } else {
      try {
        window.adsbygoogle = window.adsbygoogle || []
        window.adsbygoogle.push({})
        initialized.current = true
      } catch (e) {
        console.error('AdSense error:', e)
      }
    }
  }, [showAds])

  if (!showAds) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: '224px',
      right: 0,
      height: '60px',
      background: '#fafafa',
      borderTop: '0.5px solid #e8e8e8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      overflow: 'hidden'
    }}>
      {/* Ad container — matches page width (8.5in = 816px) */}
      <div style={{ width: '100%', maxWidth: '816px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* AdSense unit */}
        <div ref={adRef} style={{ width: '100%', maxWidth: '728px', height: '60px' }}>
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: '100%', height: '60px' }}
            data-ad-client={ADSENSE_CONFIG.publisherId}
            data-ad-slot={ADSENSE_CONFIG.adUnitId}
            data-ad-format="horizontal"
            data-full-width-responsive="false"
          />
        </div>

        {/* Remove ads nudge */}
        <div style={{
          position: 'absolute',
          right: '0',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '9px',
            letterSpacing: '0.08em',
            color: '#ccc'
          }}>
            ad
          </span>
        </div>
      </div>
    </div>
  )
}

// AdSense meta tag for site verification — add to index.html head
// <meta name="google-adsense-account" content="ca-pub-XXXXXXXXXXXXXXXXX" />
