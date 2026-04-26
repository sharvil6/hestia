'use client'

import { useRouter } from 'next/navigation'
import { Flame } from 'lucide-react'

const FAMILY_MEMBERS = [
  {
    id: '1',
    name: 'Mom',
    avatarBg: 'oklch(92% 0.035 34)',
    avatarText: 'oklch(40% 0.14 34)',
  },
  {
    id: '2',
    name: 'Dad',
    avatarBg: 'oklch(91% 0.025 220)',
    avatarText: 'oklch(38% 0.10 220)',
  },
  {
    id: '3',
    name: 'Kids',
    avatarBg: 'oklch(93% 0.040 128)',
    avatarText: 'oklch(42% 0.075 128)',
  },
]

export default function Login() {
  const router = useRouter()

  const handleLogin = (id: string) => {
    document.cookie = `hestia_user=${id}; path=/; max-age=31536000`
    router.push('/')
  }

  return (
    <main
      style={{ minHeight: '100dvh', background: 'var(--color-canvas)' }}
      className="flex flex-col items-center justify-center p-6"
    >
      {/* Brand lockup */}
      <div className="flex flex-col items-center mb-12">
        <div
          style={{ color: 'var(--color-brand)', marginBottom: '16px' }}
        >
          <Flame size={32} strokeWidth={1.75} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '3rem',
            lineHeight: 1.1,
            fontWeight: 600,
            color: 'var(--color-ink)',
            letterSpacing: 'var(--tracking-tight)',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          Welcome home.
        </h1>
        <p
          style={{
            fontSize: '1.125rem',
            color: 'var(--color-ink-secondary)',
            textAlign: 'center',
          }}
        >
          Who&apos;s cooking today?
        </p>
      </div>

      {/* Profile cards */}
      <div className="flex gap-5 justify-center flex-wrap">
        {FAMILY_MEMBERS.map(member => (
          <button
            key={member.id}
            onClick={() => handleLogin(member.id)}
            style={{
              width: '120px',
              minHeight: '144px',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-sm)',
              padding: '24px 16px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: `border-color var(--duration-base) var(--ease-standard),
                           box-shadow var(--duration-base) var(--ease-standard),
                           transform var(--duration-base) var(--ease-standard)`,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.borderColor = 'var(--color-brand)'
              el.style.boxShadow = 'var(--shadow-md)'
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.borderColor = 'var(--color-border-subtle)'
              el.style.boxShadow = 'var(--shadow-sm)'
              el.style.transform = 'translateY(0)'
            }}
            onMouseDown={e => {
              e.currentTarget.style.transform = 'scale(0.98)'
            }}
            onMouseUp={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
          >
            {/* Avatar circle */}
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: 'var(--radius-pill)',
                background: member.avatarBg,
                color: member.avatarText,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: '22px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {member.name.charAt(0)}
            </div>

            {/* Name label */}
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-ink-secondary)',
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
              }}
            >
              {member.name}
            </span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <p
        style={{
          marginTop: '48px',
          fontSize: '13px',
          color: 'var(--color-ink-muted)',
          textAlign: 'center',
        }}
      >
        Hestia keeps your family&apos;s recipes together.
      </p>
    </main>
  )
}
