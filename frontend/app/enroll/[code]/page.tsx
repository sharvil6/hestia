'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Loader2 } from 'lucide-react'
import { authEnroll } from '@/lib/api'
import { saveKeyWords, useInvalidateCurrentUser } from '@/lib/currentUser'

export default function EnrollPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const invalidate = useInvalidateCurrentUser()
  const [error, setError] = useState<string | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    // Single-use invite: guard against React StrictMode's double-invoke, which
    // would POST twice and 404 the second time.
    if (fired.current) return
    fired.current = true

    authEnroll(code)
      .then(async (r) => {
        saveKeyWords(r.key_words)
        await invalidate()
        router.replace('/')
      })
      .catch((e: Error) => setError(e.message || 'This invite is no longer valid.'))
  }, [code, invalidate, router])

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
            {error ? 'Invite unavailable.' : 'Setting up your account…'}
          </h1>
        </div>

        {error ? (
          <div style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div role="alert" style={{
              padding: '12px', marginBottom: 16, background: 'var(--color-error-muted)',
              color: 'var(--color-error)', borderRadius: 'var(--radius-md)', fontSize: 14,
            }}>{error}</div>
            <a href="/login" style={{
              display: 'block', textAlign: 'center', color: 'var(--color-ink-secondary)',
              fontSize: 14, textDecoration: 'underline',
            }}>Go to sign in</a>
          </div>
        ) : (
          <div className="flex justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-ink-muted)' }} />
          </div>
        )}
      </div>
    </main>
  )
}
