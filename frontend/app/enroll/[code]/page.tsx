'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Loader2, Check } from 'lucide-react'
import QRCode from 'qrcode'
import { authEnroll, authInviteInfo } from '@/lib/api'
import { saveKeyWords, useInvalidateCurrentUser } from '@/lib/currentUser'

export default function EnrollPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const invalidate = useInvalidateCurrentUser()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [result, setResult] = useState<{ words: string[]; qr: string } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    authInviteInfo(code)
      .then((r: { display_name: string }) => setDisplayName(r.display_name))
      .catch((e: Error) => setLoadErr(e.message || 'Invite not found or expired'))
  }, [code])

  useEffect(() => {
    if (result) {
      QRCode.toDataURL(result.qr, { width: 280, margin: 1 }).then(setQrDataUrl).catch(() => {})
    }
  }, [result])

  async function onCreate() {
    setEnrolling(true)
    try {
      const r = await authEnroll(code)
      saveKeyWords(r.key_words)
      setResult({ words: r.key_words, qr: r.key_qr_payload })
      await invalidate()
    } catch (e) {
      setLoadErr((e as Error).message || 'Enrollment failed')
    } finally {
      setEnrolling(false)
    }
  }

  async function onContinue() {
    router.push('/')
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}
      className="flex flex-col items-center justify-center p-6">
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div className="flex flex-col items-center" style={{ marginBottom: 24 }}>
          <Flame size={32} strokeWidth={1.75} style={{ color: 'var(--color-brand)', marginBottom: 12 }} />
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: '2rem', lineHeight: 1.1,
            fontWeight: 600, color: 'var(--color-ink)', letterSpacing: 'var(--tracking-tight)',
            textAlign: 'center',
          }}>
            {result ? 'Save your key.' : `Welcome${displayName ? `, ${displayName}` : ''}.`}
          </h1>
          {!result && (
            <p style={{ marginTop: 8, color: 'var(--color-ink-secondary)', textAlign: 'center' }}>
              Tap below to set up this device for Hestia.
            </p>
          )}
        </div>

        <div style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {loadErr && !result && (
            <div role="alert" style={{
              padding: '12px', background: 'var(--color-error-muted)',
              color: 'var(--color-error)', borderRadius: 'var(--radius-md)', fontSize: 14,
            }}>{loadErr}</div>
          )}

          {!loadErr && !result && (
            <>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 16 }}>
                You&apos;re about to create a new account on this device. We&apos;ll show you a 12-word recovery key — write it down somewhere safe, since it&apos;s the only way to sign in on another device.
              </p>
              <button disabled={enrolling || !displayName} onClick={onCreate}
                style={primaryButtonStyle(enrolling || !displayName)}>
                {enrolling && <Loader2 size={16} className="animate-spin" />}
                Create my key
              </button>
            </>
          )}

          {result && (
            <>
              <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>
                Write these down. Anyone with them can sign in as you.
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                marginBottom: 20,
              }}>
                {result.words.map((w, i) => (
                  <div key={i} style={{
                    padding: '10px 8px 8px 8px', position: 'relative',
                    background: 'var(--color-surface-sunken)',
                    borderRadius: 'var(--radius-md)', textAlign: 'center',
                  }}>
                    <span style={{
                      position: 'absolute', top: 4, left: 6, fontSize: 10,
                      color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums',
                    }}>{i + 1}</span>
                    <span style={{
                      fontFamily: 'ui-monospace, monospace', fontSize: 14,
                      color: 'var(--color-ink)',
                    }}>{w}</span>
                  </div>
                ))}
              </div>

              {qrDataUrl && (
                <details style={{ marginBottom: 20 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 8 }}>
                    Show QR code
                  </summary>
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 12,
                    background: 'white', borderRadius: 'var(--radius-md)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="Recovery QR" style={{ width: 240, height: 240 }} />
                  </div>
                </details>
              )}

              <button onClick={onContinue} style={primaryButtonStyle(false)}>
                <Check size={16} />
                I&apos;ve saved my key — continue
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '12px 16px',
    background: disabled ? 'var(--color-ink-disabled)' : 'var(--color-brand)',
    color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: disabled ? 'none' : 'var(--shadow-brand)',
  }
}
