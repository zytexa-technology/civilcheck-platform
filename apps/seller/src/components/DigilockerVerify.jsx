// ─────────────────────────────────────────────────────────────────────────
//  DigilockerVerify — "Verify with DigiLocker" card for the Partner KYC page.
//
//  The backend does all OAuth work (state, code exchange, secrets); this
//  component only asks it for the authorization URL, navigates the browser
//  there, and — when DigiLocker sends the user back to /dashboard/kyc — reads
//  the fixed result code (?digilocker=success|failed|cancelled|unavailable|
//  session_expired). No token or user data ever appears in that URL.
//
//  DigiLocker verification is extra evidence; it does not by itself approve
//  the partner (admin review is unchanged).
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { getDigilockerStatus, startDigilockerAuth } from '../api/seller.api'
import { Card } from './ui'

const RESULT_MESSAGES = {
  success: { tone: 'ok', text: '✓ DigiLocker verification successful.' },
  failed: { tone: 'err', text: 'DigiLocker verification could not be completed. Please try again.' },
  cancelled: { tone: 'warn', text: 'You cancelled the DigiLocker verification. You can try again any time.' },
  unavailable: { tone: 'err', text: 'DigiLocker is temporarily unavailable. Please try again later.' },
  session_expired: { tone: 'warn', text: 'Your DigiLocker session expired. Please start again.' },
}

const TONES = {
  ok: { bg: 'var(--verified-soft, #e8f6ee)', fg: 'var(--verified, #1a7f4b)' },
  err: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  warn: { bg: 'var(--amber-soft, #fff7e6)', fg: 'var(--ink)' },
}

const Msg = ({ tone, children }) => (
  <div className="dev" style={{ background: TONES[tone].bg, color: TONES[tone].fg, borderRadius: 11, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
    {children}
  </div>
)

export default function DigilockerVerify() {
  const [info, setInfo] = useState(null) // { available, status: NOT_CONNECTED|PENDING|VERIFIED|FAILED, verifiedAt }
  const [phase, setPhase] = useState('loading') // loading | idle | redirecting
  const [result, setResult] = useState(null)

  useEffect(() => {
    // Result of a just-finished DigiLocker round trip, then tidy the URL.
    const params = new URLSearchParams(window.location.search)
    const code = params.get('digilocker')
    if (code && RESULT_MESSAGES[code]) {
      setResult(RESULT_MESSAGES[code])
      params.delete('digilocker')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    getDigilockerStatus()
      .then((d) => setInfo(d))
      .catch(() => setInfo({ available: false, status: 'NOT_CONNECTED' }))
      .finally(() => setPhase('idle'))
  }, [])

  const start = async () => {
    setResult(null)
    setPhase('redirecting')
    try {
      const { authorizationUrl } = await startDigilockerAuth()
      window.location.assign(authorizationUrl)
    } catch (e) {
      setPhase('idle')
      setResult(e.response?.status === 503 ? RESULT_MESSAGES.unavailable : RESULT_MESSAGES.failed)
    }
  }

  const verified = info?.status === 'VERIFIED'

  return (
    <Card>
      <div style={{ padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🔐 DigiLocker Verification</div>
        <p className="small muted dev" style={{ marginBottom: 14, lineHeight: 1.6 }}>
          Verify your identity securely through the government's DigiLocker. CivilCheck never sees your
          DigiLocker password and stores no document contents.
        </p>

        {phase === 'loading' && <p className="small muted">⏳ Checking status…</p>}
        {result && <Msg tone={result.tone}>{result.text}</Msg>}

        {phase !== 'loading' && (
          verified ? (
            <Msg tone="ok">
              ✓ Verified with DigiLocker
            </Msg>
          ) : info && info.available === false ? (
            <Msg tone="warn">DigiLocker verification is not available yet. You can still verify by uploading an identity document below.</Msg>
          ) : (
            <>
              {info?.status === 'FAILED' && !result && (
                <Msg tone="err">Your last DigiLocker verification did not succeed. You can try again.</Msg>
              )}
              {info?.status === 'PENDING' && !result && (
                <Msg tone="warn">⏳ Verification pending — you started DigiLocker verification but it was not completed. You can continue below.</Msg>
              )}
              <button className="btn btn-primary" onClick={start} disabled={phase === 'redirecting'}>
                {phase === 'redirecting' ? 'Redirecting to DigiLocker…' : info?.status === 'PENDING' ? 'Continue with DigiLocker' : info?.status === 'FAILED' ? 'Try DigiLocker again' : 'Verify with DigiLocker'}
              </button>
            </>
          )
        )}
      </div>
    </Card>
  )
}
