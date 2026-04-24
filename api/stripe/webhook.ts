// api/stripe/webhook.ts
// Handles Stripe webhook events to update subscription status in Supabase
// Set your webhook endpoint in Stripe dashboard to: https://yourdomain.com/api/stripe/webhook

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// REPLACE with your Stripe webhook signing secret
// Found in Stripe Dashboard → Webhooks → your endpoint → Signing secret
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
if (!WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as any
        const userId = session.metadata?.supabase_user_id
        const planId = session.metadata?.plan_id
        if (!userId || !planId) break

        // Retrieve subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

        await upsertSubscription(userId, planId, subscription, session.customer as string)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        const planId = subscription.metadata?.plan_id
        if (!userId || !planId) break

        await upsertSubscription(userId, planId, subscription, subscription.customer as string)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (!userId) break

        // Downgrade to free
        await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: 'free',
            status: 'canceled',
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            current_period_end: null,
            trial_ends_at: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by customer ID and flag payment failure
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (sub) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('user_id', sub.user_id)
        }
        break
      }
    }

    return res.status(200).json({ received: true })

  } catch (err: any) {
    console.error('Webhook handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function upsertSubscription(
  userId: string,
  planId: string,
  subscription: Stripe.Subscription,
  customerId: string
) {
  await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      plan_id: planId,
      status: subscription.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
}

// Vercel config for raw body (required for Stripe webhook verification)
export const config = {
  api: { bodyParser: false }
}
