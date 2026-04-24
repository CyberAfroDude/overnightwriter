// api/settings/model-key.ts
// Saves and removes BYOK model API keys encrypted server-side

import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// REPLACE: 32-byte hex encryption key — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ENCRYPTION_KEY_HEX = process.env.MODEL_KEY_ENCRYPTION_KEY
if (!ENCRYPTION_KEY_HEX) {
  throw new Error('MODEL_KEY_ENCRYPTION_KEY environment variable is required')
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { userId, provider, key } = req.body
  if (!userId || !provider) return res.status(400).json({ error: 'Missing required fields' })

  // Verify user has writer plan
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .single()

  const planHierarchy: Record<string, number> = { free: 0, nomad: 1, writer: 2, studio: 3 }
  const userPlanLevel = planHierarchy[sub?.plan_id || 'free'] || 0

  if (userPlanLevel < 2) {
    return res.status(403).json({ error: 'Writer plan required to manage AI model keys' })
  }

  if (req.method === 'POST') {
    if (!key) return res.status(400).json({ error: 'Missing key' })
    const encryptedKey = encrypt(key)

    await supabase
      .from('user_model_keys')
      .upsert({
        user_id: userId,
        provider,
        encrypted_key: encryptedKey,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' })

    return res.status(200).json({ success: true })
  }

  if (req.method === 'DELETE') {
    await supabase
      .from('user_model_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)

    return res.status(200).json({ success: true })
  }

  return res.status(405).end()
}

// Export decrypt for use in AI writing endpoint
export { decrypt }
