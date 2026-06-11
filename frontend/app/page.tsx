'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecipes } from '@/lib/api'
import { useCurrentUser } from '@/lib/currentUser'
import type { Recipe } from '@hestia/shared/types'
import Link from 'next/link'
import AddRecipeModal from '@/components/AddRecipeModal'
import {
  Flame,
  Search,
  ChevronDown,
  Users,
  Clock,
  Plus,
  BookOpen,
} from 'lucide-react'

function initialFor(name: string | undefined): string {
  if (!name) return '?'
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: '20px',
        boxShadow: 'var(--shadow-xs)',
        marginBottom: '16px',
        breakInside: 'avoid',
      }}
    >
      <div className="skeleton" style={{ height: '120px', width: '100%', marginBottom: '16px', borderRadius: 'var(--radius-lg)' }} />
      <div className="skeleton" style={{ height: '20px', width: '65%', marginBottom: '8px' }} />
      <div className="skeleton" style={{ height: '14px', width: '90%', marginBottom: '6px' }} />
      <div className="skeleton" style={{ height: '14px', width: '70%', marginBottom: '12px' }} />
      <div className="skeleton" style={{ height: '12px', width: '40%' }} />
    </div>
  )
}

export default function Home() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: currentUser } = useCurrentUser()

  const { data: recipes, isLoading } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  })

  const filteredRecipes = useMemo(() => {
    if (!recipes) return recipes
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(r => {
      if (r.title?.toLowerCase().includes(q)) return true
      if (r.description?.toLowerCase().includes(q)) return true
      if (r.tags?.some(t => t.name?.toLowerCase().includes(q))) return true
      return false
    })
  }, [recipes, query])

  // Signed in → click avatar to manage account. Signed out → go log in.
  const avatarHref = currentUser ? '/settings/security' : '/login'
  const avatarLabel = currentUser
    ? `Account settings for ${currentUser.display_name}`
    : 'Sign in'

  return (
    <main
      style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBlock: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame
              size={20}
              strokeWidth={1.75}
              style={{ color: 'var(--color-brand)', flexShrink: 0 }}
            />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '28px',
                fontWeight: 600,
                color: 'var(--color-brand)',
                letterSpacing: 'var(--tracking-tight)',
                lineHeight: 1,
              }}
            >
              Hestia
            </span>
          </div>

          <Link
            href={avatarHref}
            aria-label={avatarLabel}
            title={avatarLabel}
            style={{
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
              }}
            >
              {initialFor(currentUser?.display_name)}
            </div>
            <ChevronDown
              size={12}
              style={{ color: 'var(--color-ink-muted)' }}
            />
          </Link>
        </header>

        {/* Search */}
        <section style={{ marginBottom: '28px', position: 'relative' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-ink-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            placeholder="Search family recipes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px 14px 44px',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              fontSize: '15px',
              color: 'var(--color-ink)',
              outline: 'none',
              boxSizing: 'border-box',
              transition: `border-color var(--duration-fast) var(--ease-standard),
                           box-shadow var(--duration-fast) var(--ease-standard)`,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--color-brand)'
              e.currentTarget.style.boxShadow = '0 0 0 3px oklch(55% 0.16 34 / 0.15)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </section>

        {/* Recipe list */}
        {isLoading ? (
          <div style={{ columns: '1', gap: '20px' }} className="sm:columns-2 lg:columns-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !recipes || recipes.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '64px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-brand-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <BookOpen size={32} style={{ color: 'var(--color-brand)' }} strokeWidth={1.5} />
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '22px',
                fontWeight: 600,
                color: 'var(--color-ink)',
                marginBottom: '8px',
              }}
            >
              Your hearth is waiting
            </h2>
            <p
              style={{
                fontSize: '15px',
                color: 'var(--color-ink-secondary)',
                maxWidth: '320px',
                lineHeight: 1.6,
                marginBottom: '20px',
              }}
            >
              Add your first recipe — by hand, from a URL, or by scanning a recipe card.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--color-brand)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                transition: `background var(--duration-fast) var(--ease-standard)`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-muted)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <Plus size={16} /> Add your first recipe
            </button>
          </div>
        ) : !filteredRecipes || filteredRecipes.length === 0 ? (
          /* No-match state */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '64px 24px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-ink)',
                marginBottom: '8px',
              }}
            >
              No recipes match “{query.trim()}”
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-ink-secondary)',
                maxWidth: '320px',
                lineHeight: 1.6,
              }}
            >
              Try a different word, or clear the search to see everything.
            </p>
          </div>
        ) : (
          /* Masonry columns */
          <div style={{ columns: '1', gap: '20px' }} className="sm:columns-2 lg:columns-3">
            {filteredRecipes.map((recipe) => {
              const titleSize = recipe.title?.length <= 30 ? '20px' : '18px'
              const totalTime =
                (recipe.prep_time || 0) + (recipe.cook_time || 0)

              return (
                <Link
                  key={recipe.id}
                  href={`/recipe/${recipe.id}`}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-xl)',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-sm)',
                      marginBottom: '16px',
                      breakInside: 'avoid',
                      cursor: 'pointer',
                      transition: `box-shadow var(--duration-base) var(--ease-standard),
                                   border-color var(--duration-base) var(--ease-standard),
                                   transform var(--duration-base) var(--ease-standard)`,
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget
                      el.style.boxShadow = 'var(--shadow-md)'
                      el.style.borderColor = 'var(--color-border)'
                      el.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget
                      el.style.boxShadow = 'var(--shadow-sm)'
                      el.style.borderColor = 'var(--color-border-subtle)'
                      el.style.transform = 'translateY(0)'
                    }}
                  >
                    {recipe.cover_image && (
                      <img
                        src={recipe.cover_image}
                        alt={recipe.title}
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '160px',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <div style={{ padding: '20px 20px 16px' }}>
                      <h2
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: titleSize,
                          fontWeight: 600,
                          color: 'var(--color-ink)',
                          letterSpacing: 'var(--tracking-snug)',
                          lineHeight: 1.3,
                          margin: 0,
                        }}
                      >
                        {recipe.title}
                      </h2>

                      {recipe.description && (
                        <p
                          style={{
                            fontSize: '14px',
                            color: 'var(--color-ink-secondary)',
                            marginTop: '6px',
                            lineHeight: 1.55,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }}
                        >
                          {recipe.description}
                        </p>
                      )}

                      {/* Footer row */}
                      {(recipe.original_yield || totalTime > 0 || recipe.tags?.length > 0) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                            marginTop: '12px',
                          }}
                        >
                          {recipe.original_yield && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                color: 'var(--color-ink-muted)',
                              }}
                            >
                              <Users size={12} style={{ color: 'var(--color-sage)' }} />
                              {recipe.original_yield}
                            </span>
                          )}
                          {totalTime > 0 && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px',
                                color: 'var(--color-ink-muted)',
                              }}
                            >
                              <Clock size={12} />
                              {totalTime} min
                            </span>
                          )}
                          {recipe.tags?.[0] && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 500,
                                color: 'var(--color-sage-text)',
                                background: 'var(--color-sage-muted)',
                                borderRadius: 'var(--radius-pill)',
                                padding: '2px 8px',
                                letterSpacing: 'var(--tracking-label)',
                                textTransform: 'uppercase',
                              }}
                            >
                              {recipe.tags[0].name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 30,
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-brand)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-brand)',
          transition: `background var(--duration-fast) var(--ease-spring),
                       box-shadow var(--duration-fast) var(--ease-spring),
                       transform var(--duration-fast) var(--ease-spring)`,
          outline: 'none',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--color-brand-hover)'
          e.currentTarget.style.boxShadow = '0 6px 24px oklch(55% 0.16 34 / 0.35)'
          e.currentTarget.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--color-brand)'
          e.currentTarget.style.boxShadow = 'var(--shadow-brand)'
          e.currentTarget.style.transform = 'scale(1)'
        }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
        aria-label="Add recipe"
      >
        <Plus size={24} strokeWidth={2} />
      </button>

      <AddRecipeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </main>
  )
}
