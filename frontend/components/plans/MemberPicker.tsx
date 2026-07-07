'use client'

import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { listUsersBasic } from '@/lib/api'
import { useCurrentUser } from '@/lib/currentUser'
import type { UserPublic } from '@hestia/shared/types'

function initialFor(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

export function MemberAvatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <div
      title={name}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: 'var(--radius-pill)',
        background: 'var(--color-sage-muted)',
        color: 'var(--color-sage-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontSize: `${Math.round(size * 0.45)}px`,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initialFor(name)}
    </div>
  )
}

/**
 * Checkbox-style list of every other user, for choosing meal-plan members.
 * The current user (the owner) is excluded — ownership is implicit.
 */
export default function MemberPicker({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[]
  onToggle: (userId: string) => void
}) {
  const { data: currentUser } = useCurrentUser()
  const { data: users, isLoading } = useQuery<UserPublic[]>({
    queryKey: ['users', 'basic'],
    queryFn: listUsersBasic,
  })

  const candidates = (users ?? []).filter(u => u.id !== currentUser?.id)

  if (isLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>Loading people…</p>
  }
  if (candidates.length === 0) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>
        No one else to invite yet — plans can always be shared later.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {candidates.map(u => {
        const selected = selectedIds.includes(u.id)
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onToggle(u.id)}
            aria-pressed={selected}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              background: selected ? 'var(--color-sage-muted)' : 'transparent',
              border: '1px solid ' + (selected ? 'var(--color-sage)' : 'var(--color-border-subtle)'),
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
          >
            <MemberAvatar name={u.display_name} />
            <span style={{ fontSize: '14px', color: 'var(--color-ink)', flexGrow: 1 }}>{u.display_name}</span>
            {selected && <Check size={16} style={{ color: 'var(--color-sage-text)' }} />}
          </button>
        )
      })}
    </div>
  )
}
