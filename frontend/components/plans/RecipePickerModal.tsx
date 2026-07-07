'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, Search } from 'lucide-react'
import { getRecipes } from '@/lib/api'
import { mediaUrl } from '@/lib/media'
import type { Recipe } from '@hestia/shared/types'
import ModalShell, { fieldStyle } from './ModalShell'

/** Pick a recipe from the family library to drop into a meal slot. */
export default function RecipePickerModal({
  isOpen,
  onClose,
  onPick,
  slotLabel,
}: {
  isOpen: boolean
  onClose: () => void
  onPick: (recipeId: string) => void
  slotLabel: string
}) {
  const [query, setQuery] = useState('')
  const { data: recipes, isLoading } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  })

  const filtered = useMemo(() => {
    if (!recipes) return []
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      r =>
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.tags?.some(t => t.name?.toLowerCase().includes(q)),
    )
  }, [recipes, query])

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Add to ${slotLabel}`} maxWidth={520}>
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search
          size={15}
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', pointerEvents: 'none' }}
        />
        <input
          type="search"
          placeholder="Search recipes..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          style={{ ...fieldStyle, paddingLeft: '36px' }}
        />
      </div>

      {isLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>Loading recipes…</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>
          {query.trim() ? `No recipes match “${query.trim()}”.` : 'No recipes yet — add some from the home page first.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-sunken)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
            >
              {r.cover_image ? (
                <img
                  src={mediaUrl(r.cover_image)}
                  alt=""
                  style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-brand-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Flame size={16} strokeWidth={1.5} style={{ color: 'var(--color-brand)', opacity: 0.7 }} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </div>
                {r.tags?.length ? (
                  <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                    {r.tags.slice(0, 3).map(t => t.name).join(' · ')}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  )
}
