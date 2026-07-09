'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ShieldAlert, Activity, ListFilter } from 'lucide-react'
import AppNav from '@/components/AppNav'
import { adminUserActivity, adminAuthEvents } from '@/lib/api'
import { useCurrentUser } from '@/lib/currentUser'
import type { AuthEvent, UserActivity } from '@hestia/shared/types'

export default function AdminPage() {
  const { data: user, isLoading } = useCurrentUser()
  if (isLoading) return <CenterSpinner />
  if (!user) return null

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 48px' }}>
        <AppNav />

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600,
          color: 'var(--color-ink)', marginBottom: 4,
        }}>Admin</h1>
        <p style={{ color: 'var(--color-ink-secondary)', marginBottom: 32 }}>
          Who&apos;s using Hestia, and from where.
        </p>

        {!user.is_admin ? (
          <NotAuthorized />
        ) : (
          <>
            <ActivitySection />
            <EventsSection />
          </>
        )}
      </div>
    </main>
  )
}

function NotAuthorized() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: 16,
      background: 'var(--color-surface-raised)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-xl)', color: 'var(--color-ink-secondary)',
    }}>
      <ShieldAlert size={18} style={{ color: 'var(--color-error)' }} />
      You need to be an admin to view this page.
    </div>
  )
}

// --- Activity overview -------------------------------------------------------

function ActivitySection() {
  const { data, isLoading } = useQuery<UserActivity[]>({
    queryKey: ['admin', 'activity'], queryFn: adminUserActivity,
  })
  return (
    <Section title="Activity" icon={Activity} subtitle="One row per member. Sorted by most recently active.">
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {data && data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle()}>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Last seen</Th>
                <Th>From</Th>
                <Th>Sessions</Th>
                <Th>Sign-ins</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.user_id} style={rowStyle()}>
                  <Td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--color-ink)', fontWeight: 500 }}>{a.display_name}</span>
                      {a.is_admin && <Pill bg="var(--color-brand-muted)" color="var(--color-brand-text)">admin</Pill>}
                      {isRecent(a.last_seen_at, 5) && <Pill bg="var(--color-sage-muted)" color="var(--color-sage-text)">online</Pill>}
                    </span>
                  </Td>
                  <Td muted>{a.last_seen_at ? fmtDate(a.last_seen_at) : '—'}</Td>
                  <Td muted>{fmtLocation(a.last_country, a.last_ip)}</Td>
                  <Td muted>{a.active_sessions}</Td>
                  <Td muted>{a.login_count}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.length === 0 && <Empty>No members yet.</Empty>}
    </Section>
  )
}

// --- Event feed --------------------------------------------------------------

const EVENT_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'login', label: 'Logins' },
  { value: 'login_failed', label: 'Failed logins' },
  { value: 'logout', label: 'Logouts' },
  { value: 'enroll', label: 'Enrollments' },
  { value: 'key_rotate', label: 'Key rotations' },
]

function EventsSection() {
  const [filter, setFilter] = useState('')
  const { data, isLoading } = useQuery<AuthEvent[]>({
    queryKey: ['admin', 'auth-events', filter],
    queryFn: () => adminAuthEvents({ limit: 200, event_type: filter || undefined }),
  })
  return (
    <Section title="Recent events" icon={ListFilter} subtitle="Every sign-in, sign-out, and failed attempt.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {EVENT_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            style={chipStyle(filter === f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      {data && data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle()}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Event</Th>
                <Th>From</Th>
                <Th>Device</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} style={rowStyle()}>
                  <Td muted>{fmtDate(e.created_at)}</Td>
                  <Td>{e.display_name || <span style={{ color: 'var(--color-ink-muted)' }}>unknown</span>}</Td>
                  <Td><EventBadge event={e} /></Td>
                  <Td muted>{fmtLocation(e.country, e.ip)}</Td>
                  <Td muted>{e.user_agent ? trimUA(e.user_agent) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.length === 0 && <Empty>No events recorded yet.</Empty>}
    </Section>
  )
}

function EventBadge({ event }: { event: AuthEvent }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    login: { label: 'login', bg: 'var(--color-sage-muted)', color: 'var(--color-sage-text)' },
    logout: { label: 'logout', bg: 'var(--color-surface-sunken)', color: 'var(--color-ink-secondary)' },
    login_failed: { label: 'failed', bg: 'var(--color-error-muted)', color: 'var(--color-error)' },
    enroll: { label: 'enrolled', bg: 'var(--color-brand-muted)', color: 'var(--color-brand-text)' },
    key_rotate: { label: 'key rotated', bg: 'var(--color-brand-muted)', color: 'var(--color-brand-text)' },
  }
  const m = map[event.event_type] ?? { label: event.event_type, bg: 'var(--color-surface-sunken)', color: 'var(--color-ink-secondary)' }
  const method = event.auth_method === 'passkey' ? 'passkey' : event.auth_method === 'word_key' ? 'words' : event.auth_method
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Pill bg={m.bg} color={m.color}>{m.label}</Pill>
      {method && <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{method}</span>}
      {event.detail && <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>· {event.detail}</span>}
    </span>
  )
}

// --- Bits --------------------------------------------------------------------

function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: typeof Activity; children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600,
        color: 'var(--color-ink)', marginBottom: 4,
      }}>
        <Icon size={18} strokeWidth={1.75} style={{ color: 'var(--color-brand)' }} />
        {title}
      </h2>
      {subtitle && (
        <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14, marginBottom: 12 }}>{subtitle}</p>
      )}
      <div style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-xl)', padding: 16,
      }}>{children}</div>
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)',
      color: 'var(--color-ink-muted)', whiteSpace: 'nowrap',
      borderBottom: '1px solid var(--color-border-subtle)',
    }}>{children}</th>
  )
}

function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td style={{
      padding: '9px 10px', fontSize: 13, verticalAlign: 'middle',
      color: muted ? 'var(--color-ink-secondary)' : 'var(--color-ink)',
      whiteSpace: 'nowrap',
    }}>{children}</td>
  )
}

function Pill({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-label)', padding: '2px 6px',
      borderRadius: 'var(--radius-pill)', background: bg, color,
    }}>{children}</span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: 'var(--color-ink-muted)', fontSize: 14 }}>{children}</p>
}

function CenterSpinner() {
  return (
    <main className="flex items-center justify-center" style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}>
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-ink-muted)' }} />
    </main>
  )
}

function tableStyle(): React.CSSProperties {
  return { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }
}

function rowStyle(): React.CSSProperties {
  return { borderBottom: '1px solid var(--color-border-subtle)' }
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px', fontSize: 12, fontWeight: 500,
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)',
    background: active ? 'var(--color-brand-muted)' : 'transparent',
    color: active ? 'var(--color-brand-text)' : 'var(--color-ink-secondary)',
    cursor: 'pointer',
  }
}

/** The backend stores UTC without an offset (e.g. "2026-07-08T02:54:04"), which
 * `new Date()` would misread as local time. Append a 'Z' when no zone is present
 * so these parse as the UTC instant they actually are. */
function toUtcMs(iso: string): number {
  const norm = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  return Date.parse(norm)
}

function fmtDate(iso: string) {
  const t = toUtcMs(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso
}

/** True if the timestamp is within the last `minutes`. */
function isRecent(iso: string | null, minutes: number): boolean {
  if (!iso) return false
  const t = toUtcMs(iso)
  return Number.isFinite(t) && Date.now() - t < minutes * 60_000
}

function trimUA(ua: string) {
  const m = ua.match(/\(([^)]+)\)/)
  return m ? m[1] : ua.slice(0, 48)
}

/** "🇬🇧 GB · 1.2.3.4", degrading gracefully when country or IP is missing. */
function fmtLocation(country: string | null, ip: string | null) {
  const parts: string[] = []
  if (country) parts.push(`${flagEmoji(country)} ${country}`)
  if (ip) parts.push(ip)
  return parts.length ? parts.join(' · ') : 'local / unknown'
}

function flagEmoji(cc: string): string {
  if (cc.length !== 2) return ''
  const base = 0x1f1e6
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  )
}
