'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound, QrCode, RefreshCw, Trash2, UserPlus, ShieldOff,
  Loader2, Plus, Copy, Check, Share2, Bot,
} from 'lucide-react'
import AppNav from '@/components/AppNav'
import QRCode from 'qrcode'
import {
  apiTokenCreate, apiTokenRevoke, apiTokensList,
  authAdminRevokeUser, authCreateInvite, authListSessions, authListUsers,
  authLogout, authRevokeSession, authRotateKey, passkeyRevoke, passkeysList,
} from '@/lib/api'
import { enrollPasskey, passkeysSupported } from '@/lib/passkeys'
import {
  clearSavedKeyWords, readSavedKeyWords, saveKeyWords,
  useCurrentUser, useInvalidateCurrentUser,
} from '@/lib/currentUser'
import { wordsToQrPayload } from '@/lib/bip39'
import type {
  AdminUserInfo, ApiTokenCreated, ApiTokenInfo, ApiTokenScope, InviteCreated, PasskeyInfo, SessionInfo,
} from '@hestia/shared/types'

export default function SecurityPage() {
  const { data: user, isLoading } = useCurrentUser()
  if (isLoading) return <CenterSpinner />
  if (!user) return null

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 24px' }}>
        <AppNav />

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>Security</h1>
        <p style={{ color: 'var(--color-ink-secondary)', marginBottom: 32 }}>
          Signed in as {user.display_name}.
        </p>

        <PasskeysSection />
        <KeySection />
        <SessionsSection />
        <ApiTokensSection />
        {user.is_admin && <AdminSection />}
        <LogoutSection />
      </div>
    </main>
  )
}

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600,
        color: 'var(--color-ink)', marginBottom: 4,
      }}>{title}</h2>
      {subtitle && (
        <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>
          {subtitle}
        </p>
      )}
      <div style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: 16,
      }}>{children}</div>
    </section>
  )
}

// --- Passkeys section --------------------------------------------------------

function PasskeysSection() {
  const qc = useQueryClient()
  const supported = passkeysSupported()
  const { data: passkeys, isLoading } = useQuery<PasskeyInfo[]>({
    queryKey: ['auth', 'passkeys'], queryFn: passkeysList,
  })
  const addPasskey = useMutation({
    mutationFn: enrollPasskey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'passkeys'] }),
  })
  const revoke = useMutation({
    mutationFn: passkeyRevoke,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'passkeys'] }),
  })

  return (
    <Section title="Passkeys" subtitle="Sign in with Face ID, Windows Hello, or 1Password.">
      {!supported && (
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14, marginBottom: 8 }}>
          This browser doesn&apos;t support passkeys.
        </p>
      )}
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {passkeys && passkeys.length === 0 && (
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14, marginBottom: 12 }}>
          No passkeys yet. Add one to skip typing your words.
        </p>
      )}
      {passkeys && passkeys.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {passkeys.map((p) => (
            <li key={p.id} style={listRowStyle()}>
              <div>
                <div style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{p.nickname}</div>
                <div style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>
                  Added {fmtDate(p.created_at)}{p.last_used_at ? ` · last used ${fmtDate(p.last_used_at)}` : ''}
                </div>
              </div>
              <IconButton title="Remove passkey" onClick={() => {
                if (confirm(`Remove "${p.nickname}"?`)) revoke.mutate(p.id)
              }}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {supported && (
        <button onClick={() => addPasskey.mutate()} disabled={addPasskey.isPending}
          style={ghostButtonStyle(addPasskey.isPending)}>
          {addPasskey.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add a passkey
        </button>
      )}
      {addPasskey.error && (
        <p style={{ color: 'var(--color-error)', fontSize: 13, marginTop: 8 }}>
          {(addPasskey.error as Error).message}
        </p>
      )}
    </Section>
  )
}

// --- Recovery key section ----------------------------------------------------

function KeySection() {
  const qc = useQueryClient()
  const invalidateMe = useInvalidateCurrentUser()
  const [words, setWords] = useState<string[] | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  // Read once on mount. Lazy useState would cause an SSR/CSR hydration
  // mismatch since this is a 'use client' component rendered on both.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setWords(readSavedKeyWords()) }, [])

  useEffect(() => {
    if (!show || !words) return
    let cancelled = false
    QRCode.toDataURL(wordsToQrPayload(words), { width: 280, margin: 1 })
      .then((url) => { if (!cancelled) setQrUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [show, words])

  const rotate = useMutation({
    mutationFn: authRotateKey,
    onSuccess: (r: { key_words: string[] }) => {
      saveKeyWords(r.key_words)
      setWords(r.key_words)
      setShow(true)
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] })
      invalidateMe()
    },
  })

  return (
    <Section title="Recovery key" subtitle="Your 12-word phrase. Show it to log in on another device.">
      {!words && (
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>
          This device doesn&apos;t have your key saved. Rotate to generate a new one, or sign in on a device that has it.
        </p>
      )}
      {words && !show && (
        <button onClick={() => setShow(true)} style={ghostButtonStyle(false)}>
          <QrCode size={16} /> Show my key
        </button>
      )}
      {words && show && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12,
          }}>
            {words.map((w, i) => (
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
                  fontFamily: 'ui-monospace, monospace', fontSize: 14, color: 'var(--color-ink)',
                }}>{w}</span>
              </div>
            ))}
          </div>
          {qrUrl && (
            <div style={{
              display: 'flex', justifyContent: 'center', padding: 12, marginBottom: 12,
              background: 'white', borderRadius: 'var(--radius-md)',
            }}>
              <img src={qrUrl} alt="Recovery QR" style={{ width: 240, height: 240 }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              navigator.clipboard.writeText(words.join(' ')).then(() => {
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }).catch(() => {})
            }} style={ghostButtonStyle(false)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy words'}
            </button>
            <button onClick={() => setShow(false)} style={ghostButtonStyle(false)}>Hide</button>
          </div>
        </>
      )}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border-subtle)' }}>
        <button onClick={() => {
          if (confirm('Rotate your key? Every other signed-in device will be logged out and need to use your new words to get back in. Passkeys are not affected.')) {
            rotate.mutate()
          }
        }} disabled={rotate.isPending} style={ghostButtonStyle(rotate.isPending)}>
          {rotate.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Rotate key
        </button>
        {rotate.error && (
          <p style={{ color: 'var(--color-error)', fontSize: 13, marginTop: 8 }}>
            {(rotate.error as Error).message}
          </p>
        )}
      </div>
    </Section>
  )
}

// --- Sessions section --------------------------------------------------------

function SessionsSection() {
  const qc = useQueryClient()
  const { data: sessions, isLoading } = useQuery<SessionInfo[]>({
    queryKey: ['auth', 'sessions'], queryFn: authListSessions,
  })
  const revoke = useMutation({
    mutationFn: authRevokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  })
  return (
    <Section title="Active sessions">
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sessions?.map((s) => (
          <li key={s.id_prefix} style={listRowStyle()}>
            <div>
              <div style={{ color: 'var(--color-ink)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.user_agent ? trimUA(s.user_agent) : 'Unknown device'}
                {s.current && (
                  <span style={pillStyle('var(--color-sage-muted)', 'var(--color-sage-text)')}>this device</span>
                )}
                <span style={pillStyle('var(--color-brand-muted)', 'var(--color-brand-text)')}>
                  {s.auth_method === 'passkey' ? 'passkey' : 'words'}
                </span>
              </div>
              <div style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>
                Last seen {fmtDate(s.last_seen_at)}
              </div>
            </div>
            {!s.current && (
              <IconButton title="Sign this device out" onClick={() => revoke.mutate(s.id_prefix)}>
                <Trash2 size={16} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// --- API tokens section ------------------------------------------------------

const SCOPE_OPTIONS: { value: ApiTokenScope; label: string }[] = [
  { value: 'read', label: 'Read only' },
  { value: 'read_create', label: 'Read + add recipes' },
]

function ApiTokensSection() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiTokenScope>('read')
  const [created, setCreated] = useState<ApiTokenCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const { data: tokens, isLoading } = useQuery<ApiTokenInfo[]>({
    queryKey: ['auth', 'api-tokens'], queryFn: apiTokensList,
  })
  const create = useMutation({
    mutationFn: () => apiTokenCreate(name.trim(), scope),
    onSuccess: (r: ApiTokenCreated) => {
      setCreated(r)
      setCopied(false)
      setName('')
      setScope('read')
      qc.invalidateQueries({ queryKey: ['auth', 'api-tokens'] })
    },
  })
  const revoke = useMutation({
    mutationFn: apiTokenRevoke,
    onSuccess: (_r, id) => {
      if (created?.id === id) setCreated(null)
      qc.invalidateQueries({ queryKey: ['auth', 'api-tokens'] })
    },
  })

  return (
    <Section title="API tokens"
      subtitle="Access to recipes and tags for agents and scripts. Tokens can read, or read and add new recipes; they can never edit or delete. Send as Authorization: Bearer <token>.">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Muse meal planner)"
          maxLength={80}
          aria-label="Token name"
          style={{
            flex: '1 1 200px', minWidth: 0, padding: '10px 12px', fontSize: 14,
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)', color: 'var(--color-ink)', outline: 'none',
          }}
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as ApiTokenScope)}
          aria-label="Token access"
          style={{
            padding: '10px 12px', fontSize: 14,
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)', color: 'var(--color-ink)', outline: 'none',
          }}
        >
          {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" disabled={!name.trim() || create.isPending}
          style={ghostButtonStyle(!name.trim() || create.isPending)}>
          {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Create
        </button>
      </form>
      {create.error && (
        <p style={{ color: 'var(--color-error)', fontSize: 13, marginBottom: 8 }}>
          {(create.error as Error).message}
        </p>
      )}

      {created && (
        <div style={{
          padding: 12, marginBottom: 12,
          background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--color-ink-secondary)', marginBottom: 8 }}>
            Copy the token for &ldquo;{created.name}&rdquo; now. It won&apos;t be shown again.
          </div>
          <code style={{
            display: 'block', padding: 8, marginBottom: 8,
            background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-sm)',
            fontSize: 12, wordBreak: 'break-all', color: 'var(--color-ink)',
          }}>{created.token}</code>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => {
              navigator.clipboard.writeText(created.token).then(() => {
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }).catch(() => {})
            }} style={ghostButtonStyle(false)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy token'}
            </button>
            <button onClick={() => setCreated(null)} style={ghostButtonStyle(false)}>Done</button>
          </div>
        </div>
      )}

      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {tokens && tokens.length === 0 && !created && (
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>No API tokens.</p>
      )}
      {tokens && tokens.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tokens.map((t) => (
            <li key={t.id} style={listRowStyle()}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--color-ink)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bot size={14} style={{ color: 'var(--color-ink-muted)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  {t.scope === 'read_create'
                    ? <span style={pillStyle('var(--color-brand-muted)', 'var(--color-brand-text)')}>read + add</span>
                    : <span style={pillStyle('var(--color-sage-muted)', 'var(--color-sage-text)')}>read-only</span>}
                </div>
                <div style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>
                  <code>hst_{t.id_prefix}…</code> · created {fmtDate(t.created_at)} · {t.last_used_at ? `last used ${fmtDate(t.last_used_at)}` : 'never used'}
                </div>
              </div>
              <IconButton title="Revoke token" onClick={() => {
                if (confirm(`Revoke "${t.name}"? Anything using it will lose access immediately.`)) revoke.mutate(t.id)
              }}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// --- Admin section -----------------------------------------------------------

function AdminSection() {
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [invite, setInvite] = useState<InviteCreated | null>(null)
  const [inviteQr, setInviteQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)

  // Feature-detect navigator.share in an effect to avoid an SSR/CSR hydration
  // mismatch (it's undefined on the server).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && !!navigator.share) }, [])

  const { data: users } = useQuery<AdminUserInfo[]>({
    queryKey: ['auth', 'users'], queryFn: authListUsers,
  })
  const create = useMutation({
    mutationFn: () => authCreateInvite(displayName.trim()),
    onSuccess: (r: InviteCreated) => {
      setInvite(r)
      setDisplayName('')
      QRCode.toDataURL(r.enroll_url, { width: 240, margin: 1 }).then(setInviteQr).catch(() => {})
      qc.invalidateQueries({ queryKey: ['auth', 'users'] })
    },
  })
  const revoke = useMutation({
    mutationFn: authAdminRevokeUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'users'] }),
  })

  return (
    <Section title="Family (admin)" subtitle="Invite or remove members.">
      <form onSubmit={(e) => { e.preventDefault(); if (displayName.trim()) create.mutate() }}
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name (e.g. Mom)"
          style={{
            flex: 1, padding: '10px 12px', fontSize: 14,
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)', color: 'var(--color-ink)', outline: 'none',
          }}
        />
        <button type="submit" disabled={!displayName.trim() || create.isPending}
          style={ghostButtonStyle(!displayName.trim() || create.isPending)}>
          {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Invite
        </button>
      </form>

      {invite && (
        <div style={{
          padding: 12, marginBottom: 16,
          background: 'var(--color-surface-sunken)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--color-ink-secondary)', marginBottom: 8 }}>
            Send this link to {invite.intended_display_name}:
          </div>
          <code style={{
            display: 'block', padding: 8, marginBottom: 8,
            background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-sm)',
            fontSize: 12, wordBreak: 'break-all',
          }}>{invite.enroll_url}</code>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => {
              navigator.clipboard.writeText(invite.enroll_url).then(() => {
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }).catch(() => {})
            }} style={ghostButtonStyle(false)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {canShare && (
              <button onClick={async () => {
                try {
                  await navigator.share({
                    title: 'Join Hestia',
                    text: `${invite.intended_display_name}, here's your Hestia invite`,
                    url: invite.enroll_url,
                  })
                } catch { /* user cancelled the share sheet */ }
              }} style={ghostButtonStyle(false)}>
                <Share2 size={16} /> Share
              </button>
            )}
          </div>
          {inviteQr && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 8,
              background: 'white', borderRadius: 'var(--radius-md)' }}>
              <img src={inviteQr} alt="Invite QR" style={{ width: 200, height: 200 }} />
            </div>
          )}
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {users?.map((u) => (
          <li key={u.id} style={listRowStyle()}>
            <div>
              <div style={{ color: 'var(--color-ink)', fontWeight: 500, display: 'flex', gap: 8, alignItems: 'center' }}>
                {u.display_name}
                {u.is_admin && (
                  <span style={pillStyle('var(--color-brand-muted)', 'var(--color-brand-text)')}>admin</span>
                )}
                {!u.has_active_key && (
                  <span style={pillStyle('var(--color-error-muted)', 'var(--color-error)')}>no key</span>
                )}
              </div>
              <div style={{ color: 'var(--color-ink-muted)', fontSize: 12 }}>
                {u.passkey_count} passkey{u.passkey_count === 1 ? '' : 's'} · {u.session_count} session{u.session_count === 1 ? '' : 's'}
              </div>
            </div>
            {u.has_active_key && (
              <IconButton title="Revoke this member's key + passkeys" onClick={() => {
                if (confirm(`Revoke ${u.display_name}'s key and all their passkeys? They'll need a new invite.`)) {
                  revoke.mutate(u.id)
                }
              }}>
                <ShieldOff size={16} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// --- Logout ------------------------------------------------------------------

function LogoutSection() {
  const router = useRouter()
  const invalidate = useInvalidateCurrentUser()
  const m = useMutation({
    mutationFn: authLogout,
    onSuccess: async () => {
      clearSavedKeyWords()
      await invalidate()
      router.push('/login')
    },
  })
  return (
    <section style={{ marginBottom: 64 }}>
      <button onClick={() => m.mutate()} disabled={m.isPending}
        style={{
          ...ghostButtonStyle(m.isPending),
          color: 'var(--color-error)', borderColor: 'var(--color-error)',
        }}>
        {m.isPending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        Sign out this device
      </button>
    </section>
  )
}

// --- Bits --------------------------------------------------------------------

function CenterSpinner() {
  return (
    <main className="flex items-center justify-center" style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}>
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-ink-muted)' }} />
    </main>
  )
}

function listRowStyle(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 4px', gap: 12,
    borderBottom: '1px solid var(--color-border-subtle)',
  }
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-label)',
    padding: '2px 6px', borderRadius: 'var(--radius-pill)',
    background: bg, color,
  }
}

function ghostButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', fontSize: 14, fontWeight: 500,
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: disabled ? 'var(--color-ink-disabled)' : 'var(--color-ink)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function IconButton({ children, onClick, title }: {
  children: React.ReactNode; onClick: () => void; title?: string
}) {
  return (
    <button onClick={onClick} title={title}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 6, color: 'var(--color-ink-muted)',
        display: 'inline-flex', alignItems: 'center',
      }}>
      {children}
    </button>
  )
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function trimUA(ua: string) {
  // Show just the browser/OS bit, not the whole sniffable string.
  const m = ua.match(/\(([^)]+)\)/)
  return m ? m[1] : ua.slice(0, 60)
}
