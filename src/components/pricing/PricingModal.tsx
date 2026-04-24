import { useState } from 'react'
import { STRIPE_CONFIG, PLAN_FEATURES, PLAN_HIERARCHY, PLAN_NAMES, PlanId } from '../../lib/config'
import { useSubscription } from '../../hooks/useSubscription'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

interface Props {
  isOpen: boolean
  onClose: () => void
  highlightPlan?: PlanId // which plan to highlight when opened from a locked feature
}

type Billing = 'monthly' | 'annual'

const PLANS: { id: PlanId; name: string; monthlyPrice: number; annualPrice: number; tagline: string }[] = [
  { id: 'free',   name: 'Free',   monthlyPrice: 0,    annualPrice: 0,   tagline: 'Always free' },
  { id: 'nomad',  name: 'Nomad',  monthlyPrice: 4.99, annualPrice: 49,  tagline: 'No ads, pure focus' },
  { id: 'writer', name: 'Writer', monthlyPrice: 9,    annualPrice: 90,  tagline: 'AI writes with you' },
  { id: 'studio', name: 'Studio', monthlyPrice: 29,   annualPrice: 290, tagline: 'AI writes while you sleep' },
]

export default function PricingModal({ isOpen, onClose, highlightPlan }: Props) {
  const { plan: currentPlan } = useSubscription()
  const { user } = useAuth()
  const [billing, setBilling] = useState<Billing>('annual')
  const [loading, setLoading] = useState<PlanId | null>(null)

  if (!isOpen) return null

  const handleUpgrade = async (planId: PlanId) => {
    if (planId === 'free' || planId === currentPlan) return
    if (!user) return

    setLoading(planId)

    try {
      // Get or create Stripe customer, create checkout session
      const priceId = billing === 'monthly'
        ? STRIPE_CONFIG.prices[planId as keyof typeof STRIPE_CONFIG.prices]?.monthly
        : STRIPE_CONFIG.prices[planId as keyof typeof STRIPE_CONFIG.prices]?.annual

      if (!priceId) { setLoading(null); return }

      // Call Stripe checkout session creator
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          planId,
          userId: user.id,
          userEmail: user.email,
          billing,
          successUrl: `${window.location.origin}/dashboard?upgraded=true`,
          cancelUrl: window.location.href
        })
      })

      const { url, error } = await response.json()
      if (error) { console.error(error); setLoading(null); return }
      window.location.href = url

    } catch (e) {
      console.error(e)
      setLoading(null)
    }
  }

  const handleManageDowngrade = async () => {
    if (!user) return
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, returnUrl: window.location.href })
    })
    const { url } = await res.json()
    if (url) window.location.href = url
  }

  const getPlanAction = (planId: PlanId) => {
    if (planId === currentPlan) {
      return { disabled: true, label: 'Current plan', onClick: () => undefined }
    }

    const currentRank = PLAN_HIERARCHY[currentPlan]
    const targetRank = PLAN_HIERARCHY[planId]
    const isUpgrade = targetRank > currentRank
    const isDowngrade = targetRank < currentRank

    if (isUpgrade && planId !== 'free') {
      return {
        disabled: false,
        label: `Upgrade to ${PLAN_NAMES[planId]}`,
        onClick: () => handleUpgrade(planId)
      }
    }

    if (isDowngrade) {
      return {
        disabled: false,
        label: `Downgrade to ${PLAN_NAMES[planId]}`,
        onClick: handleManageDowngrade
      }
    }

    return { disabled: true, label: 'Unavailable', onClick: () => undefined }
  }

  const btnStyle = (planId: PlanId): React.CSSProperties => {
    const isCurrent = planId === currentPlan
    const isHighlighted = planId === highlightPlan
    const isDowngrade = PLAN_HIERARCHY[planId] < PLAN_HIERARCHY[currentPlan]
    const isUpgrade = PLAN_HIERARCHY[planId] > PLAN_HIERARCHY[currentPlan]

    if (isCurrent) return {
      fontFamily: '"DM Mono", monospace',
      fontSize: '10px',
      letterSpacing: '0.1em',
      padding: '10px 20px',
      background: 'transparent',
      color: '#bbb',
      border: '0.5px solid #e8e8e8',
      cursor: 'default',
      width: '100%'
    }

    if (isDowngrade) return {
      fontFamily: '"DM Mono", monospace',
      fontSize: '10px',
      letterSpacing: '0.1em',
      padding: '10px 20px',
      background: 'transparent',
      color: '#7a7a7a',
      border: '0.5px solid #d9d9d9',
      cursor: 'pointer',
      width: '100%'
    }

    return {
      fontFamily: '"DM Mono", monospace',
      fontSize: '10px',
      letterSpacing: '0.1em',
      padding: '10px 20px',
      background: isUpgrade && isHighlighted ? '#111' : 'transparent',
      color: isUpgrade && isHighlighted ? '#fff' : '#111',
      border: `0.5px solid ${(isUpgrade && isHighlighted) ? '#111' : '#ccc'}`,
      cursor: isUpgrade ? 'pointer' : 'default',
      width: '100%'
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '44px'
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <div style={{ fontFamily: '"EB Garamond", serif', fontSize: '28px', fontWeight: 400, color: '#111', marginBottom: '6px' }}>
              Upgrade OvernightWriter
            </div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', color: '#999', letterSpacing: '0.08em' }}>
              7-day free trial on all paid plans. Cancel anytime.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#bbb', padding: '4px' }}
          >
            ×
          </button>
        </div>

        {/* Billing toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          justifyContent: 'center'
        }}>
          <button
            onClick={() => setBilling('monthly')}
            style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '6px 16px',
              background: billing === 'monthly' ? '#111' : 'transparent',
              color: billing === 'monthly' ? '#fff' : '#999',
              border: '0.5px solid #ddd',
              cursor: 'pointer'
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '10px',
              letterSpacing: '0.1em',
              padding: '6px 16px',
              background: billing === 'annual' ? '#111' : 'transparent',
              color: billing === 'annual' ? '#fff' : '#999',
              border: '0.5px solid #ddd',
              cursor: 'pointer'
            }}
          >
            Annual <span style={{ color: billing === 'annual' ? '#aaa' : '#ccc', fontSize: '9px' }}>save 2 months</span>
          </button>
        </div>

        {/* Plan cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '32px'
        }}>
          {PLANS.map(plan => {
            const isHighlighted = plan.id === highlightPlan
            const isCurrent = plan.id === currentPlan

            return (
              <div
                key={plan.id}
                style={{
                  border: isHighlighted ? '1px solid #111' : '0.5px solid #e8e8e8',
                  padding: '24px 18px',
                  position: 'relative'
                }}
              >
                {isCurrent && (
                  <div style={{
                    position: 'absolute',
                    top: '-1px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#111',
                    color: '#fff',
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '8px',
                    letterSpacing: '0.12em',
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap'
                  }}>
                    Current
                  </div>
                )}

                <div style={{ fontFamily: '"EB Garamond", serif', fontSize: '20px', color: '#111', marginBottom: '4px' }}>
                  {plan.name}
                </div>
                <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#bbb', letterSpacing: '0.06em', marginBottom: '16px', lineHeight: 1.5 }}>
                  {plan.tagline}
                </div>

                {/* Price */}
                <div style={{ marginBottom: '20px' }}>
                  {plan.monthlyPrice === 0 ? (
                    <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '18px', color: '#111' }}>Free</div>
                  ) : (
                    <>
                      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '18px', color: '#111' }}>
                        ${billing === 'monthly' ? plan.monthlyPrice : (plan.annualPrice / 12).toFixed(2)}
                        <span style={{ fontSize: '10px', color: '#bbb' }}>/mo</span>
                      </div>
                      {billing === 'annual' && (
                        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '9px', color: '#bbb', marginTop: '2px' }}>
                          ${plan.annualPrice}/yr
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Features */}
                <div style={{ marginBottom: '20px' }}>
                  {PLAN_FEATURES[plan.id].map((feature, i) => (
                    <div key={i} style={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '9px',
                      color: '#888',
                      letterSpacing: '0.04em',
                      lineHeight: 1.7,
                      paddingLeft: '10px',
                      position: 'relative'
                    }}>
                      <span style={{ position: 'absolute', left: 0, color: '#ccc' }}>·</span>
                      {feature}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                {(() => {
                  const action = getPlanAction(plan.id)
                  return (
                    <button
                      onClick={action.onClick}
                      disabled={loading === plan.id || action.disabled}
                      style={btnStyle(plan.id)}
                    >
                      {loading === plan.id ? '...' : action.label}
                    </button>
                  )
                })()}
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '9px',
          color: '#ccc',
          letterSpacing: '0.06em',
          textAlign: 'center',
          lineHeight: 1.8
        }}>
          7-day free trial. No card required to start. Cancel anytime before trial ends and you won't be charged.
          <br />
          Payments processed securely by Stripe.
        </div>

      </div>
    </div>
  )
}
