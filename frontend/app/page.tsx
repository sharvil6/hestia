'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { getRecipes } from '@/lib/api'
import { mediaUrl } from '@/lib/media'
import { useCurrentUser } from '@/lib/currentUser'
import type { Recipe } from '@hestia/shared/types'
import Link from 'next/link'
import AddRecipeModal from '@/components/AddRecipeModal'
import {
  Flame,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  Plus,
  BookOpen,
  Shuffle,
  Zap,
  Heart,
  Sparkles,
  Tag as TagIcon,
  X,
  type LucideIcon,
} from 'lucide-react'

function initialFor(name: string | undefined): string {
  if (!name) return '?'
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function firstNameOf(name: string | undefined): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0] ?? ''
}

function greetingFor(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function totalTime(r: Recipe): number {
  return (r.prep_time || 0) + (r.cook_time || 0)
}

/** Small, dependency-free relative time for the greeting glance line. */
function relativeTime(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const now = Date.now()
  const day = 86_400_000
  if (new Date(then).toDateString() === new Date(now).toDateString()) return 'today'
  const days = Math.floor((now - then) / day)
  if (days <= 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 60) return 'last month'
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  const years = Math.floor(days / 365)
  return years === 1 ? 'a year ago' : `${years} years ago`
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

/** One metadata line shared by rail + grid cards (time / yield / first tag). */
function CardMeta({ recipe }: { recipe: Recipe }) {
  const time = totalTime(recipe)
  const tag = recipe.tags?.[0]
  if (!time && !recipe.original_yield && !tag) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        marginTop: '10px',
      }}
    >
      {time > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
          <Clock size={12} />
          {time} min
        </span>
      )}
      {recipe.original_yield ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--color-ink-muted)' }}>
          <Users size={12} style={{ color: 'var(--color-sage)' }} />
          {recipe.original_yield}
        </span>
      ) : null}
      {tag && (
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
          {tag.name}
        </span>
      )}
    </div>
  )
}

/** Tinted fallback used when a recipe has no cover image. */
function CoverPlaceholder({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        width: '100%',
        background: 'var(--color-brand-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Flame size={28} strokeWidth={1.5} style={{ color: 'var(--color-brand)', opacity: 0.7 }} />
    </div>
  )
}

const cardHoverIn = (e: React.MouseEvent<HTMLDivElement>) => {
  const el = e.currentTarget
  el.style.boxShadow = 'var(--shadow-md)'
  el.style.borderColor = 'var(--color-border)'
  el.style.transform = 'translateY(-2px)'
}
const cardHoverOut = (e: React.MouseEvent<HTMLDivElement>) => {
  const el = e.currentTarget
  el.style.boxShadow = 'var(--shadow-sm)'
  el.style.borderColor = 'var(--color-border-subtle)'
  el.style.transform = 'translateY(0)'
}

/** Compact landscape card for the horizontal discover rails. */
function RailCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipe/${recipe.id}`} style={{ textDecoration: 'none', display: 'block', scrollSnapAlign: 'start' }}>
      <div
        style={{
          width: '244px',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          transition: `box-shadow var(--duration-base) var(--ease-standard),
                       border-color var(--duration-base) var(--ease-standard),
                       transform var(--duration-base) var(--ease-standard)`,
        }}
        onMouseEnter={cardHoverIn}
        onMouseLeave={cardHoverOut}
      >
        {recipe.cover_image ? (
          <img
            src={mediaUrl(recipe.cover_image)}
            alt={recipe.title}
            style={{ display: 'block', width: '100%', height: '140px', objectFit: 'cover' }}
          />
        ) : (
          <CoverPlaceholder height={140} />
        )}
        <div style={{ padding: '14px 16px 16px' }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '17px',
              fontWeight: 600,
              color: 'var(--color-ink)',
              letterSpacing: 'var(--tracking-snug)',
              lineHeight: 1.3,
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {recipe.title}
          </h3>
          <CardMeta recipe={recipe} />
        </div>
      </div>
    </Link>
  )
}

/** Full card for the filtered masonry grid. */
function GridCard({ recipe }: { recipe: Recipe }) {
  const titleSize = recipe.title?.length <= 30 ? '20px' : '18px'
  return (
    <Link href={`/recipe/${recipe.id}`} style={{ textDecoration: 'none', display: 'block' }}>
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
        onMouseEnter={cardHoverIn}
        onMouseLeave={cardHoverOut}
      >
        {recipe.cover_image && (
          <img
            src={mediaUrl(recipe.cover_image)}
            alt={recipe.title}
            style={{ display: 'block', width: '100%', height: '160px', objectFit: 'cover' }}
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
          <CardMeta recipe={recipe} />
        </div>
      </div>
    </Link>
  )
}

/** A titled horizontal scroll-snap rail with desktop chevron controls. */
function Rail({
  title,
  icon: Icon,
  accent = 'brand',
  items,
  onSeeAll,
}: {
  title: string
  icon: LucideIcon
  accent?: 'brand' | 'sage'
  items: Recipe[]
  onSeeAll?: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  const scrollBy = (dir: -1 | 1) => {
    trackRef.current?.scrollBy({ left: dir * 264, behavior: 'smooth' })
  }

  const iconBg = accent === 'sage' ? 'var(--color-sage-muted)' : 'var(--color-brand-muted)'
  const iconColor = accent === 'sage' ? 'var(--color-sage-text)' : 'var(--color-brand-text)'

  return (
    <section style={{ marginBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span
          style={{
            width: '30px',
            height: '30px',
            borderRadius: 'var(--radius-md)',
            background: iconBg,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={16} strokeWidth={1.75} style={{ color: iconColor }} />
        </span>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--color-ink)',
            letterSpacing: 'var(--tracking-tight)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onSeeAll && (
            <button
              onClick={onSeeAll}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-ink-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 'var(--radius-md)',
                transition: `color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)`,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand)'; e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-secondary)'; e.currentTarget.style.background = 'none' }}
            >
              See all
            </button>
          )}
          <RailChevron dir={-1} onClick={() => scrollBy(-1)} />
          <RailChevron dir={1} onClick={() => scrollBy(1)} />
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBottom: '4px',
          scrollPaddingLeft: '2px',
        }}
      >
        {items.map(r => (
          <RailCard key={r.id} recipe={r} />
        ))}
      </div>
    </section>
  )
}

function RailChevron({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      aria-label={dir === -1 ? 'Scroll left' : 'Scroll right'}
      style={{
        width: '30px',
        height: '30px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-ink-secondary)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-xs)',
        transition: `background var(--duration-fast) var(--ease-standard),
                     color var(--duration-fast) var(--ease-standard),
                     border-color var(--duration-fast) var(--ease-standard)`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--color-surface-sunken)'
        e.currentTarget.style.color = 'var(--color-ink)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--color-surface-raised)'
        e.currentTarget.style.color = 'var(--color-ink-secondary)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <Icon size={16} />
    </button>
  )
}

function CollectionChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        flexShrink: 0,
        scrollSnapAlign: 'start',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        padding: '7px 14px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-brand)' : 'var(--color-surface-raised)',
        color: active ? 'white' : 'var(--color-ink-secondary)',
        transition: `background var(--duration-fast) var(--ease-standard),
                     color var(--duration-fast) var(--ease-standard),
                     border-color var(--duration-fast) var(--ease-standard)`,
      }}
      onMouseEnter={e => {
        if (active) return
        e.currentTarget.style.background = 'var(--color-surface-sunken)'
        e.currentTarget.style.color = 'var(--color-ink)'
      }}
      onMouseLeave={e => {
        if (active) return
        e.currentTarget.style.background = 'var(--color-surface-raised)'
        e.currentTarget.style.color = 'var(--color-ink-secondary)'
      }}
    >
      {label}
    </button>
  )
}

const RAIL_LIMIT = 12

export default function Home() {
  const router = useRouter()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string>('all')
  const { data: currentUser } = useCurrentUser()

  const { data: recipes, isLoading } = useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  })

  // Top tags by frequency → drives the chip row and the per-collection rails.
  const topTags = useMemo(() => {
    if (!recipes) return [] as string[]
    const counts = new Map<string, number>()
    for (const r of recipes) {
      for (const t of r.tags ?? []) {
        if (!t.name) continue
        counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  }, [recipes])

  const distinctTagCount = topTags.length

  const isFiltering = query.trim() !== '' || activeTag !== 'all'

  // Grid mode: apply both the search predicate and the active collection.
  const gridRecipes = useMemo(() => {
    if (!recipes) return [] as Recipe[]
    const q = query.trim().toLowerCase()
    return recipes.filter(r => {
      if (activeTag !== 'all' && !r.tags?.some(t => t.name === activeTag)) return false
      if (!q) return true
      if (r.title?.toLowerCase().includes(q)) return true
      if (r.description?.toLowerCase().includes(q)) return true
      if (r.tags?.some(t => t.name?.toLowerCase().includes(q))) return true
      return false
    })
  }, [recipes, query, activeTag])

  // Discover mode: the set of rails to render.
  const rails = useMemo(() => {
    if (!recipes || recipes.length < 2) return [] as Array<{
      key: string; title: string; icon: LucideIcon; accent: 'brand' | 'sage'; items: Recipe[]; tag?: string
    }>
    const out: Array<{ key: string; title: string; icon: LucideIcon; accent: 'brand' | 'sage'; items: Recipe[]; tag?: string }> = []

    const fresh = [...recipes]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, RAIL_LIMIT)
    if (fresh.length >= 2) out.push({ key: 'fresh', title: 'Fresh from the kitchen', icon: Sparkles, accent: 'brand', items: fresh })

    const quick = recipes
      .filter(r => { const t = totalTime(r); return t > 0 && t <= 30 })
      .sort((a, b) => totalTime(a) - totalTime(b))
      .slice(0, RAIL_LIMIT)
    if (quick.length >= 2) out.push({ key: 'quick', title: 'Quick tonight', icon: Zap, accent: 'brand', items: quick })

    const favorites = recipes
      .filter(r => (r.annotations?.length ?? 0) > 0)
      .sort((a, b) => (b.annotations?.length ?? 0) - (a.annotations?.length ?? 0))
      .slice(0, RAIL_LIMIT)
    if (favorites.length >= 2) out.push({ key: 'favorites', title: 'Family favorites', icon: Heart, accent: 'sage', items: favorites })

    // Up to 5 collection rails, only tags with enough recipes to be worth a row.
    for (const tag of topTags) {
      if (out.filter(r => r.tag).length >= 5) break
      const items = recipes.filter(r => r.tags?.some(t => t.name === tag)).slice(0, RAIL_LIMIT)
      if (items.length >= 2) out.push({ key: `tag:${tag}`, title: tag, icon: TagIcon, accent: 'sage', items, tag })
    }

    return out
  }, [recipes, topTags])

  const lastAdded = useMemo(() => {
    if (!recipes || recipes.length === 0) return ''
    const newest = recipes.reduce((acc, r) =>
      new Date(r.created_at).getTime() > new Date(acc.created_at).getTime() ? r : acc
    )
    return relativeTime(newest.created_at)
  }, [recipes])

  const surpriseMe = () => {
    if (!recipes || recipes.length === 0) return
    const pick = recipes[Math.floor(Math.random() * recipes.length)]
    router.push(`/recipe/${pick.id}`)
  }

  const clearFilters = () => {
    setQuery('')
    setActiveTag('all')
  }

  // Signed in → click avatar to manage account. Signed out → go log in.
  const avatarHref = currentUser ? '/settings/security' : '/login'
  const avatarLabel = currentUser
    ? `Account settings for ${currentUser.display_name}`
    : 'Sign in'

  const recipeCount = recipes?.length ?? 0
  const firstName = firstNameOf(currentUser?.display_name)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBlock: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={20} strokeWidth={1.75} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
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
            <ChevronDown size={12} style={{ color: 'var(--color-ink-muted)' }} />
          </Link>
        </header>

        {/* Greeting */}
        {recipeCount > 0 && (
          <section style={{ marginBottom: '28px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
                  fontWeight: 600,
                  color: 'var(--color-ink)',
                  letterSpacing: 'var(--tracking-tight)',
                  lineHeight: 1.1,
                  margin: 0,
                }}
              >
                {greetingFor(new Date())}{firstName ? `, ${firstName}` : ''}.
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--color-ink-secondary)', marginTop: '8px' }}>
                {recipeCount} {recipeCount === 1 ? 'recipe' : 'recipes'} on the shelf
                {distinctTagCount > 0 && ` · ${distinctTagCount} ${distinctTagCount === 1 ? 'collection' : 'collections'}`}
                {lastAdded && ` · last added ${lastAdded}`}
              </p>
            </div>

            <button
              onClick={surpriseMe}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-brand-text)',
                background: 'var(--color-brand-muted)',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-pill)',
                padding: '9px 16px',
                cursor: 'pointer',
                transition: `background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand)'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-brand-muted)'; e.currentTarget.style.color = 'var(--color-brand-text)' }}
            >
              <Shuffle size={14} />
              Surprise me
            </button>
          </section>
        )}

        {/* Search */}
        <section style={{ marginBottom: '16px', position: 'relative' }}>
          <Search
            size={18}
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', pointerEvents: 'none' }}
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

        {/* Collection chips */}
        {topTags.length > 0 && (
          <section
            className="no-scrollbar"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              scrollSnapType: 'x proximity',
              marginBottom: '32px',
              paddingBottom: '2px',
            }}
          >
            <CollectionChip label="All" active={activeTag === 'all'} onClick={() => setActiveTag('all')} />
            {topTags.map(tag => (
              <CollectionChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
            ))}
          </section>
        )}

        {/* Body */}
        {isLoading ? (
          <div style={{ columns: '1', gap: '20px' }} className="sm:columns-2 lg:columns-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !recipes || recipes.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', textAlign: 'center' }}>
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
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '8px' }}>
              Your hearth is waiting
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--color-ink-secondary)', maxWidth: '320px', lineHeight: 1.6, marginBottom: '20px' }}>
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
        ) : isFiltering || rails.length === 0 ? (
          /* Grid mode (search / collection filter, or too few recipes for rails) */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>
                {gridRecipes.length} {gridRecipes.length === 1 ? 'recipe' : 'recipes'}
                {activeTag !== 'all' && ` in ${activeTag}`}
                {query.trim() && ` matching “${query.trim()}”`}
              </p>
              {isFiltering && (
                <button
                  onClick={clearFilters}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--color-ink-secondary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-md)',
                    transition: `color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand)'; e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-secondary)'; e.currentTarget.style.background = 'none' }}
                >
                  <X size={13} /> Clear
                </button>
              )}
            </div>

            {gridRecipes.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '8px' }}>
                  Nothing here yet
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--color-ink-secondary)', maxWidth: '340px', lineHeight: 1.6 }}>
                  {query.trim()
                    ? `No recipes match “${query.trim()}”${activeTag !== 'all' ? ` in ${activeTag}` : ''}.`
                    : `No recipes in ${activeTag} yet.`}{' '}
                  Try a different word, or clear the filters to see everything.
                </p>
              </div>
            ) : (
              <div style={{ columns: '1', gap: '20px' }} className="sm:columns-2 lg:columns-3">
                {gridRecipes.map(r => (
                  <GridCard key={r.id} recipe={r} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Discover mode (default browse) */
          <div>
            {rails.map(rail => (
              <Rail
                key={rail.key}
                title={rail.title}
                icon={rail.icon}
                accent={rail.accent}
                items={rail.items}
                onSeeAll={rail.tag ? () => setActiveTag(rail.tag!) : undefined}
              />
            ))}
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

      <AddRecipeModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </main>
  )
}
