// ─────────────────────────────────────────────────────────────────────────────
// AI Customer Support adapter — same shape as every other provider in this
// codebase (razorpay.ts, firebase.ts, notification.service.ts): credentials
// read per call, real HTTP when configured, a deterministic mock path when
// not, and the mock path is not a toy — it is what makes the whole support
// flow (including escalation) testable end-to-end without any API key.
//
//   key present → real HTTP call to Google's Gemini API (generateContent)
//   key absent  → deterministic keyword-match against the approved knowledge
//                 base (SupportKnowledgeEntry rows), never a canned "AI" string
//
// Provider switched from Anthropic to Gemini 2026-09-02 — GEMINI_API_KEY is
// the only variable this file reads now; AI_SUPPORT_API_KEY (Anthropic) is
// no longer referenced anywhere in this path. Raw fetch, no SDK, same as
// every other provider adapter in this codebase (see the list above) — a
// deliberate, existing project convention, not something introduced here.
//
// SAFETY BOUNDARY — read this before changing anything here:
// This function NEVER receives account-specific facts (payment status,
// verification results, refund state) as part of its prompt, and its return
// value is text plus a confidence/escalation flag — nothing more. It has no
// path to call any mutating service function. Any account-specific status a
// support conversation needs to show is injected by services/support.service.ts
// as a plain SYSTEM message built from a direct, code-level Prisma read —
// never phrased by this function. That is what makes "AI must not invent
// payment confirmation / refund approval / verification results" true by
// construction rather than by prompt instruction alone: the model is never
// given those facts to begin with, so it cannot assert them.
// ─────────────────────────────────────────────────────────────────────────────
import logger from './logger.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const PROVIDER_TIMEOUT_MS = 20_000
// Flash — fast/cheap, well-suited to short grounded support replies. Not the
// Pro tier: this task never needs deep reasoning, only "does the approved
// knowledge answer this, yes or no."
//
// gemini-2.5-flash was tried first (per the original request to prefer it)
// and confirmed, via one real live call, to be rejected by the API for this
// key with "no longer available to new users... use models/gemini-3.6-flash"
// — that recommendation came directly from Google's own response, not a
// guess, so this is what's actually configured.
const GEMINI_MODEL = 'gemini-3.6-flash'

export function isAiSupportConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export interface KnowledgeEntryForAi {
  key: string
  topic: string
  question: string
  answer: string
}

export interface AiAnswerInput {
  userMessage: string
  category: string
  knowledge: KnowledgeEntryForAi[]
  // Recent turns only (bounded by the caller) — enough for "did you already
  // answer this" context, not a full unbounded transcript.
  recentMessages: { sender: string; body: string }[]
}

export interface AiAnswerResult {
  confident: boolean
  answer: string
  // true when the answer itself is standing in for "I can't help with this,
  // a human will take over" — the caller still writes this as the AI's
  // message so the buyer sees why they're being escalated.
  shouldEscalate: boolean
  escalationReason?: string
}

const HUMAN_REQUEST_PATTERN = /\b(human|agent|person|representative|talk to (a )?(person|someone|human)|escalate|real (person|human))\b/i

const REFUSAL_ANSWER =
  "I can't confirm that from what I have available — I'll bring in a member of the support team to help with this."

// ─────────────────────────────────────────────────────────────────────────────
// MOCK MODE — token-overlap match against the approved knowledge base. No
// external call, fully deterministic, and honest about not knowing when
// nothing matches well enough (never guesses).
// ─────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'do', 'does', 'i', 'my', 'me', 'you', 'your',
  'to', 'for', 'of', 'in', 'on', 'and', 'or', 'what', 'how', 'can', 'will',
  'it', 'this', 'that', 'be', 'have', 'has',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  )
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared += 1
  return shared / Math.min(a.size, b.size)
}

function mockAnswer(input: AiAnswerInput): AiAnswerResult {
  if (HUMAN_REQUEST_PATTERN.test(input.userMessage)) {
    return {
      confident: false,
      answer: "Sure — I'll connect you with a member of our support team right away.",
      shouldEscalate: true,
      escalationReason: 'User explicitly asked for a human',
    }
  }

  const questionTokens = tokenize(input.userMessage)
  let best: { entry: KnowledgeEntryForAi; score: number } | null = null
  for (const entry of input.knowledge) {
    const score = overlapScore(questionTokens, tokenize(entry.question))
    if (!best || score > best.score) best = { entry, score }
  }

  // 0.5 = at least half of the shorter token set overlaps — a deliberately
  // conservative bar, since a false "confident" match here is exactly the
  // kind of invented answer this system must not produce.
  const CONFIDENCE_THRESHOLD = 0.5
  if (best && best.score >= CONFIDENCE_THRESHOLD) {
    return { confident: true, answer: best.entry.answer, shouldEscalate: false }
  }

  return {
    confident: false,
    answer: REFUSAL_ANSWER,
    shouldEscalate: true,
    escalationReason: 'No confident match in the approved knowledge base',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL MODE — Google Gemini generateContent API. The system prompt is built
// ENTIRELY from the approved knowledge base passed in; no other instructions,
// no account data. The model is told explicitly to refuse and flag
// low-confidence rather than guess — enforced again server-side below by
// requiring a literal "CONFIDENT:" / "ESCALATE:" prefix the response must
// carry, so a model that ignores the instruction still can't silently mark
// itself confident. This instruction text is provider-agnostic — it moved
// from Anthropic's `system` field to Gemini's `systemInstruction` field
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(knowledge: KnowledgeEntryForAi[]): string {
  const knowledgeBlock = knowledge.length
    ? knowledge.map((k) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n')
    : '(no approved knowledge entries for this category)'

  return [
    'You are CivilCheck support. Answer ONLY using the approved knowledge below.',
    'Never state or imply: legal conclusions, property ownership, property authenticity,',
    'verification results, payment confirmation, refund approval, or professional credentials.',
    'If the approved knowledge does not clearly answer the question, say you cannot confirm it',
    'and that a human will follow up — do not guess or improvise a policy.',
    'Respond in plain text, 2-4 sentences, no markdown.',
    'On the FIRST line of your reply, write exactly one of: CONFIDENT or ESCALATE — nothing else on that line.',
    'Then a blank line, then your reply to the user.',
    '',
    'Approved knowledge:',
    knowledgeBlock,
  ].join('\n')
}

async function realAnswer(input: AiAnswerInput): Promise<AiAnswerResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Should be unreachable — callers check isAiSupportConfigured() first —
    // but never silently fall back to the mock path from inside "real mode"
    // logic, since that would blur which path actually ran.
    throw new Error('generateAiAnswer: GEMINI_API_KEY missing in real-mode call')
  }

  if (HUMAN_REQUEST_PATTERN.test(input.userMessage)) {
    return {
      confident: false,
      answer: "Sure — I'll connect you with a member of our support team right away.",
      shouldEscalate: true,
      escalationReason: 'User explicitly asked for a human',
    }
  }

  try {
    const response = await fetch(`${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        // Header, not a `?key=` query param — keeps the key out of any URL
        // that might get logged (access logs, proxies, browser-style dev
        // tools) the same way every other provider adapter in this codebase
        // keeps its credential in a header, never the URL.
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(input.knowledge) }] },
        contents: [
          ...input.recentMessages
            .filter((m) => m.sender === 'USER' || m.sender === 'AI')
            // Gemini's roles are 'user' | 'model' (Anthropic's were
            // 'user' | 'assistant') — same conversation, different label.
            .map((m) => ({ role: m.sender === 'USER' ? 'user' : 'model', parts: [{ text: m.body }] })),
          { role: 'user', parts: [{ text: input.userMessage }] },
        ],
        generationConfig: {
          maxOutputTokens: 400,
          // Low, not zero — support answers should stay close to the approved
          // knowledge wording every time rather than varying stylistically
          // between replies, but a hard 0 has no real benefit over a small
          // value here and some providers treat 0 as "unset".
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })

    const payload = (await response.json().catch(() => null)) as
      | { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
      | null

    const parts = payload?.candidates?.[0]?.content?.parts

    if (!response.ok || !parts) {
      const error = payload?.error?.message || `HTTP ${response.status}`

      // Distinct, actionable server-side logging per failure class — never the
      // key itself, only the fact that a request using it was rejected. The
      // returned AiAnswerResult is identical in every branch (REFUSAL_ANSWER +
      // escalate): this only changes what an operator sees in the logs, not
      // what the buyer sees or how the ticket is handled.
      //
      // Gemini's own error semantics differ from Anthropic's: an invalid or
      // malformed key typically comes back as 400 (not 401), alongside 403
      // for a key that's valid but lacks access — both are bucketed as a
      // "key problem" here.
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        logger.warn(
          '[ai-support] Gemini rejected the configured GEMINI_API_KEY ' +
            `(HTTP ${response.status}) — the key is missing, revoked, or invalid. ` +
            'Falling back to knowledge-base support.'
        )
      } else if (response.status === 429) {
        logger.warn(
          '[ai-support] Gemini rate-limited this request (HTTP 429) — ' +
            'falling back to knowledge-base support for this reply.'
        )
      } else {
        logger.error(`[ai-support] Gemini call rejected: ${error}`)
      }

      return {
        confident: false,
        answer: REFUSAL_ANSWER,
        shouldEscalate: true,
        escalationReason: `AI provider error: ${error}`,
      }
    }

    const text = parts.map((p) => p.text ?? '').join('')
    const [firstLine, ...rest] = text.split('\n')
    const confident = firstLine.trim().toUpperCase() === 'CONFIDENT'
    const reply = rest.join('\n').trim() || text.trim()

    if (!confident) {
      return {
        confident: false,
        answer: reply || REFUSAL_ANSWER,
        shouldEscalate: true,
        escalationReason: 'AI marked itself not confident',
      }
    }
    return { confident: true, answer: reply, shouldEscalate: false }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logger.error(`[ai-support] Gemini call failed: ${error}`)
    return {
      confident: false,
      answer: REFUSAL_ANSWER,
      shouldEscalate: true,
      escalationReason: `AI provider call failed: ${error}`,
    }
  }
}

export async function generateAiAnswer(input: AiAnswerInput): Promise<AiAnswerResult> {
  if (isAiSupportConfigured()) return realAnswer(input)
  return mockAnswer(input)
}
