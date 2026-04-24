// api/ai/write.ts
// Calls the user's chosen AI model on their behalf using their stored BYOK key
// Decrypts key server-side, calls provider API, returns screenplay blocks

import { createClient } from '@supabase/supabase-js'
import { createDecipheriv } from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ENCRYPTION_KEY_HEX = process.env.MODEL_KEY_ENCRYPTION_KEY
if (!ENCRYPTION_KEY_HEX) {
  throw new Error('MODEL_KEY_ENCRYPTION_KEY environment variable is required')
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

const SYSTEM_PROMPT = `You are a professional Hollywood screenwriter writing in strict Fountain screenplay format.

You will be given the current screenplay content and a user instruction.
You must respond ONLY with a JSON array of screenplay blocks. No prose, no markdown, no explanation.

Each block must have this exact shape:
{ "id": "<uuid>", "type": "<element_type>", "text": "<content>", "ai_written": true }

Element types and rules:
- "scene-heading": INT./EXT. LOCATION — TIME (always uppercase, e.g. INT. DINER — NIGHT)
- "action": Scene description (sentence case, present tense)
- "character": CHARACTER NAME only (always uppercase, no dialogue)
- "dialogue": What the character says (natural, no quotes)
- "parenthetical": Brief direction in parens, e.g. beat, quietly (lowercase)
- "transition": CUT TO: / FADE OUT. / SMASH CUT TO: (uppercase)

Rules:
1. Always follow character block immediately with dialogue block
2. Never put dialogue text in a character block
3. Never combine element types in one block
4. Write cinematically — show don't tell
5. Match the tone and voice of the existing script
6. Return ONLY the JSON array. No other text.

Example response:
[
  {"id":"uuid1","type":"scene-heading","text":"INT. DINER — NIGHT","ai_written":true},
  {"id":"uuid2","type":"action","text":"Mario wipes down the counter one last time.","ai_written":true},
  {"id":"uuid3","type":"character","text":"MARIO","ai_written":true},
  {"id":"uuid4","type":"dialogue","text":"We're closed.","ai_written":true}
]`

async function callClaude(apiKey: string, prompt: string, context: string): Promise<any[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `CURRENT SCREENPLAY:\n${context}\n\nINSTRUCTION: ${prompt}`
      }]
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Claude API error')
  const text = data.content[0]?.text || '[]'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

async function callOpenAI(apiKey: string, prompt: string, context: string): Promise<any[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `CURRENT SCREENPLAY:\n${context}\n\nINSTRUCTION: ${prompt}` }
      ]
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error')
  const text = data.choices[0]?.message?.content || '[]'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

async function callKimi(apiKey: string, prompt: string, context: string): Promise<any[]> {
  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `CURRENT SCREENPLAY:\n${context}\n\nINSTRUCTION: ${prompt}` }
      ]
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Kimi API error')
  const text = data.choices[0]?.message?.content || '[]'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

async function callGemini(apiKey: string, prompt: string, context: string): Promise<any[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          parts: [{ text: `CURRENT SCREENPLAY:\n${context}\n\nINSTRUCTION: ${prompt}` }]
        }],
        generationConfig: { maxOutputTokens: 2000 }
      })
    }
  )
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Gemini API error')
  const text = data.candidates[0]?.content?.parts[0]?.text || '[]'
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

function blocksToContext(blocks: any[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'scene-heading': return `\n${b.text.toUpperCase()}\n`
      case 'action': return `\n${b.text}`
      case 'character': return `\n\n                    ${b.text.toUpperCase()}`
      case 'dialogue': return `\n          ${b.text}`
      case 'parenthetical': return `\n               (${b.text})`
      case 'transition': return `\n\n${b.text.toUpperCase()}`
      default: return b.text
    }
  }).join('').trim()
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, provider, prompt, currentBlocks } = req.body

  if (!userId || !provider || !prompt) {
    return res.status(400).json({ error: 'Missing required fields: userId, provider, prompt' })
  }

  // Verify user has writer plan
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .single()

  const planHierarchy: Record<string, number> = { free: 0, nomad: 1, writer: 2, studio: 3 }
  const userPlanLevel = planHierarchy[sub?.plan_id || 'free'] || 0

  if (userPlanLevel < 2) {
    return res.status(403).json({ error: 'Writer plan required for in-app AI writing' })
  }

  // Get encrypted model key
  const { data: keyData } = await supabase
    .from('user_model_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()

  if (!keyData?.encrypted_key) {
    return res.status(404).json({ error: `No ${provider} API key found. Add it in Settings.` })
  }

  let apiKey: string
  try {
    apiKey = decrypt(keyData.encrypted_key)
  } catch {
    return res.status(500).json({ error: 'Failed to decrypt API key' })
  }

  // Build context from current blocks (last 50 blocks for context window)
  const contextBlocks = (currentBlocks || []).slice(-50)
  const context = blocksToContext(contextBlocks)

  // Call the appropriate model
  let newBlocks: any[]
  try {
    switch (provider) {
      case 'claude':  newBlocks = await callClaude(apiKey, prompt, context); break
      case 'openai':  newBlocks = await callOpenAI(apiKey, prompt, context); break
      case 'kimi':    newBlocks = await callKimi(apiKey, prompt, context); break
      case 'gemini':  newBlocks = await callGemini(apiKey, prompt, context); break
      default: return res.status(400).json({ error: `Unknown provider: ${provider}` })
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'AI generation failed' })
  }

  // Ensure all blocks have fresh UUIDs and ai_written flag
  const sanitizedBlocks = newBlocks.map((b: any) => ({
    id: uuidv4(),
    type: b.type || 'action',
    text: b.text || '',
    ai_written: true
  }))

  return res.status(200).json({
    success: true,
    blocks: sanitizedBlocks,
    provider,
    blocks_generated: sanitizedBlocks.length
  })
}
