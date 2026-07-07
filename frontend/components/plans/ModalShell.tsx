'use client'

import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Shared overlay + panel used by the meal-plan modals. Follows the fade/scale
 * animation timing of AddRecipeModal without its tab machinery.
 */
export default function ModalShell({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 480,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isRendered, setIsRendered] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing render state with animation timing
      setIsRendered(true)
      const t = setTimeout(() => setIsVisible(true), 10)
      return () => clearTimeout(t)
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => setIsRendered(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!isRendered) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'oklch(20% 0.02 50 / 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity var(--duration-base) var(--ease-standard)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: `${maxWidth}px`,
          maxHeight: 'min(640px, calc(100vh - 48px))',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(8px)',
          opacity: isVisible ? 1 : 0,
          transition: 'transform var(--duration-base) var(--ease-standard), opacity var(--duration-base) var(--ease-standard)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--color-border-subtle)',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '19px',
              fontWeight: 600,
              color: 'var(--color-ink)',
              letterSpacing: 'var(--tracking-snug)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: 'var(--radius-pill)',
              background: 'none',
              border: 'none',
              color: 'var(--color-ink-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-sunken)'; e.currentTarget.style.color = 'var(--color-ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-ink-muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

/** Shared input styling for the plan modals. */
export const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: '14px',
  fontFamily: 'var(--font-body)',
  color: 'var(--color-ink)',
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-ink-secondary)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  marginBottom: '6px',
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontFamily: 'var(--font-body)',
        fontSize: '14px',
        fontWeight: 500,
        color: 'white',
        background: disabled ? 'var(--color-ink-muted)' : 'var(--color-brand)',
        border: 'none',
        borderRadius: 'var(--radius-pill)',
        padding: '10px 20px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background var(--duration-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-brand-hover)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-brand)' }}
    >
      {children}
    </button>
  )
}
