'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, ChevronDown, Flame } from 'lucide-react'
import { useCurrentUser } from '@/lib/currentUser'

function initialFor(name: string | undefined): string {
  if (!name) return '?'
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function NavTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof BookOpen
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: 500,
        color: active ? 'var(--color-brand-text)' : 'var(--color-ink-secondary)',
        background: active ? 'var(--color-brand-muted)' : 'transparent',
        textDecoration: 'none',
        padding: '7px 12px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        transition: `color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)`,
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.color = 'var(--color-brand)'
          e.currentTarget.style.background = 'var(--color-surface-sunken)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.color = 'var(--color-ink-secondary)'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </Link>
  )
}

/**
 * Global top navigation, shared by every signed-in page: brand → home,
 * section tabs (Recipes / Meal plans), avatar → settings. Sized by its parent
 * container, so pages with different content widths stay aligned. The section
 * tabs make every area reachable in one click from anywhere.
 */
export default function AppNav() {
  const pathname = usePathname()
  const { data: currentUser } = useCurrentUser()

  const onPlans = pathname === '/plans' || pathname.startsWith('/plans/')
  // Recipes covers browsing and recipe detail — everything that isn't plans/settings.
  const onRecipes = pathname === '/' || pathname.startsWith('/recipe/')

  const avatarHref = currentUser ? '/settings/security' : '/login'
  const avatarLabel = currentUser
    ? `Account settings for ${currentUser.display_name}`
    : 'Sign in'

  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBlock: '22px' }}>
      <Link
        href="/"
        aria-label="Hestia home"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginRight: '8px' }}
      >
        <Flame size={20} strokeWidth={1.75} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
        <span
          className="hidden sm:inline"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            fontWeight: 600,
            color: 'var(--color-brand)',
            letterSpacing: 'var(--tracking-tight)',
            lineHeight: 1,
          }}
        >
          Hestia
        </span>
      </Link>

      <nav aria-label="Sections" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <NavTab href="/" label="Recipes" icon={BookOpen} active={onRecipes} />
        <NavTab href="/plans" label="Meal plans" icon={CalendarDays} active={onPlans} />
      </nav>

      <Link
        href={avatarHref}
        aria-label={avatarLabel}
        title={avatarLabel}
        style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          textDecoration: 'none',
          padding: '2px',
          borderRadius: 'var(--radius-pill)',
          transition: `background var(--duration-fast) var(--ease-standard)`,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-brand-muted)',
            color: 'var(--color-brand-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: '14px',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initialFor(currentUser?.display_name)}
        </div>
        <ChevronDown size={12} style={{ color: 'var(--color-ink-muted)' }} />
      </Link>
    </header>
  )
}
