'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Flame, KeyRound, QrCode, Hash, Loader2 } from 'lucide-react'
import { authLoginWithQr, authLoginWithWords } from '@/lib/api'
import {
  bip39Suggestions,
  isBip39Word,
  parseQrPayload,
  validatePhrase,
} from '@/lib/bip39'
import { passkeysSupported, signInWithPasskey } from '@/lib/passkeys'
import { saveKeyWords, useInvalidateCurrentUser } from '@/lib/currentUser'

type Tab = 'passkey' | 'words' | 'qr'

export default function Login() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'
  const invalidate = useInvalidateCurrentUser()
  const [tab, setTab] = useState<Tab>('words')  // safe default; we upgrade to 'passkey' once mounted
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [passkeyOk, setPasskeyOk] = useState(false)

  // Defer browser feature detection to after hydration to keep SSR + client
  // markup identical. Without this, picking the default tab based on WebAuthn
  // availability flips between server (false) and client (true).
  useEffect(() => {
    setMounted(true)
    const ok = passkeysSupported()
    setPasskeyOk(ok)
    if (ok) setTab('passkey')
  }, [])

  async function onPasskey() {
    setError(null); setBusy(true)
    try {
      await signInWithPasskey()
      await invalidate()
      router.push(next)
    } catch (e) {
      setError((e as Error).message || 'Passkey sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitWords(words: string[]) {
    setError(null); setBusy(true)
    try {
      await authLoginWithWords(words)
      saveKeyWords(words)
      await invalidate()
      router.push(next)
    } catch (e) {
      setError((e as Error).message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitQr(payload: string) {
    setError(null); setBusy(true)
    try {
      const words = parseQrPayload(payload)
      await authLoginWithQr(payload)
      saveKeyWords(words)
      await invalidate()
      router.push(next)
    } catch (e) {
      setError((e as Error).message || 'QR sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}
      className="flex flex-col items-center justify-center p-6">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="flex flex-col items-center" style={{ marginBottom: 24 }}>
          <Flame size={32} strokeWidth={1.75} style={{ color: 'var(--color-brand)', marginBottom: 12 }} />
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: '2.5rem', lineHeight: 1.1,
            fontWeight: 600, color: 'var(--color-ink)', letterSpacing: 'var(--tracking-tight)',
            textAlign: 'center',
          }}>Welcome home.</h1>
          <p style={{ marginTop: 8, color: 'var(--color-ink-secondary)' }}>Sign in to your Hestia.</p>
        </div>

        <div style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <Tabs current={tab} onChange={setTab} passkeyOk={passkeyOk} />

          {tab === 'passkey' && (
            <PasskeyPanel busy={busy} onSubmit={onPasskey} />
          )}
          {tab === 'words' && (
            <WordsPanel busy={busy} onSubmit={onSubmitWords} />
          )}
          {tab === 'qr' && (
            <QrPanel busy={busy} onSubmit={onSubmitQr} />
          )}

          {error && (
            <div role="alert" style={{
              marginTop: 16, padding: '10px 12px',
              background: 'var(--color-error-muted)', color: 'var(--color-error)',
              borderRadius: 'var(--radius-md)', fontSize: 14,
            }}>{error}</div>
          )}
        </div>

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--color-ink-muted)', textAlign: 'center' }}>
          New to Hestia? Ask the admin in your household for an invite link.
        </p>
      </div>
    </main>
  )
}

function Tabs({ current, onChange, passkeyOk }: {
  current: Tab; onChange: (t: Tab) => void; passkeyOk: boolean
}) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; show: boolean }> = [
    { id: 'passkey', label: 'Passkey', icon: KeyRound, show: passkeyOk },
    { id: 'words',   label: 'Words',   icon: Hash,     show: true },
    { id: 'qr',      label: 'Scan QR', icon: QrCode,   show: true },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--color-border-subtle)' }}>
      {tabs.filter((t) => t.show).map((t) => {
        const active = current === t.id
        const Icon = t.icon
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            style={{
              flex: 1, padding: '10px 8px', background: 'transparent',
              border: 'none', borderBottom: active ? '2px solid var(--color-brand)' : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer',
              color: active ? 'var(--color-ink)' : 'var(--color-ink-muted)',
              fontWeight: 500, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Icon size={16} strokeWidth={2} />{t.label}
          </button>
        )
      })}
    </div>
  )
}

function PasskeyPanel({ busy, onSubmit }: { busy: boolean; onSubmit: () => void }) {
  return (
    <div>
      <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 16 }}>
        Use Face ID, Windows Hello, or your 1Password vault.
      </p>
      <PrimaryButton busy={busy} onClick={onSubmit} label="Sign in with passkey" />
    </div>
  )
}

function WordsPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (w: string[]) => void }) {
  const [words, setWords] = useState<string[]>(Array(12).fill(''))
  const valid = validatePhrase(words)

  function setWord(i: number, v: string) {
    setWords((prev) => {
      const next = [...prev]
      next[i] = v.toLowerCase()
      return next
    })
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').trim()
    const tokens = text.toLowerCase().split(/[\s,]+/).filter(Boolean)
    if (tokens.length >= 12) {
      e.preventDefault()
      setWords(tokens.slice(0, 12))
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(words) }}>
      <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>
        Enter your 12-word key. Paste them all at once if it&apos;s easier.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {words.map((w, i) => (
          <WordInput key={i} index={i} value={w} onChange={(v) => setWord(i, v)} onPaste={onPaste} />
        ))}
      </div>
      <PrimaryButton busy={busy} disabled={!valid} type="submit"
        label={valid ? 'Sign in' : `${words.filter(Boolean).length}/12 words`} />
    </form>
  )
}

function WordInput({ index, value, onChange, onPaste }: {
  index: number; value: string; onChange: (v: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
}) {
  const [focused, setFocused] = useState(false)
  const suggestions = focused && value && !isBip39Word(value) ? bip39Suggestions(value, 4) : []
  const ok = !value || isBip39Word(value)
  return (
    <div style={{ position: 'relative' }}>
      <label style={{
        position: 'absolute', left: 8, top: 8, fontSize: 10,
        color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums',
      }}>{index + 1}</label>
      <input
        type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        style={{
          width: '100%', padding: '20px 8px 8px 8px',
          fontFamily: 'var(--font-body)', fontSize: 14,
          border: `1px solid ${ok ? 'var(--color-border)' : 'var(--color-error)'}`,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          color: 'var(--color-ink)', outline: 'none',
        }}
      />
      {suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, zIndex: 10,
          listStyle: 'none', padding: 4, background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
        }}>
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(s) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 8px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--color-ink)', fontSize: 13,
                }}>{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function QrPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  // Hold scanner instance in a ref so we can clean up across hot reloads.
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null)

  async function start() {
    setScanError(null)
    if (!containerRef.current) return
    setScanning(true)
    const { Html5Qrcode } = await import('html5-qrcode')
    const elId = 'qr-reader'
    containerRef.current.id = elId
    const scanner = new Html5Qrcode(elId)
    scannerRef.current = {
      stop: () => scanner.stop().catch(() => {}),
      clear: () => scanner.clear(),
    }
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (!decoded.startsWith('hestia://auth?w=')) return
          scanner.stop().then(() => scanner.clear()).catch(() => {})
          scannerRef.current = null
          setScanning(false)
          onSubmit(decoded)
        },
        () => { /* per-frame errors are noisy and uninteresting */ },
      )
    } catch (e) {
      setScanning(false)
      setScanError((e as Error).message || 'Could not access camera')
    }
  }

  useEffect(() => () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {})
      scannerRef.current = null
    }
  }, [])

  return (
    <div>
      <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>
        Open <strong>Settings → Security → Show my key</strong> on a device you&apos;re already signed in to, then point the camera at the QR.
      </p>
      <div ref={containerRef} style={{
        width: '100%', minHeight: scanning ? 280 : 0,
        background: 'var(--color-surface-sunken)',
        borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 12,
      }} />
      {!scanning && (
        <PrimaryButton busy={busy} onClick={start} label="Start camera" />
      )}
      {scanError && (
        <p style={{ marginTop: 8, color: 'var(--color-error)', fontSize: 13 }}>{scanError}</p>
      )}
    </div>
  )
}

function PrimaryButton({
  busy, disabled, label, onClick, type = 'button',
}: {
  busy?: boolean; disabled?: boolean; label: string
  onClick?: () => void; type?: 'button' | 'submit'
}) {
  const isDisabled = busy || disabled
  return (
    <button type={type} onClick={onClick} disabled={isDisabled}
      style={{
        width: '100%', padding: '12px 16px',
        background: isDisabled ? 'var(--color-ink-disabled)' : 'var(--color-brand)',
        color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 15,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: isDisabled ? 'none' : 'var(--shadow-brand)',
        transition: 'background var(--duration-base) var(--ease-standard)',
      }}>
      {busy && <Loader2 size={16} className="animate-spin" />}
      {label}
    </button>
  )
}
