'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { getPublicRecipe } from '@/lib/api'
import { mediaUrl } from '@/lib/media'
import type { PublicRecipe, PublicAnnotation } from '@hestia/shared/types'
import { Users, Clock, Flame } from 'lucide-react'

// Deterministic avatar tint per author name (no user ids on the public page).
const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: 'oklch(92% 0.035 34)',  text: 'oklch(40% 0.14 34)' },
  { bg: 'oklch(91% 0.025 220)', text: 'oklch(38% 0.10 220)' },
  { bg: 'oklch(93% 0.040 128)', text: 'oklch(42% 0.075 128)' },
  { bg: 'oklch(92% 0.035 300)', text: 'oklch(40% 0.12 300)' },
  { bg: 'oklch(93% 0.045 70)',  text: 'oklch(42% 0.11 70)' },
]
function avatarStyleFor(name?: string) {
  if (!name) return { bg: 'var(--color-surface-sunken)', text: 'var(--color-ink-muted)' }
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

/* ── A single read-only comment ─────────────────────────────── */
function Comment({ ann }: { ann: PublicAnnotation }) {
  const avatar = avatarStyleFor(ann.author_name)
  return (
    <div
      style={{
        background: 'var(--color-canvas)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        marginBottom: '8px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '30px', height: '30px', borderRadius: 'var(--radius-pill)',
          background: avatar.bg, color: avatar.text,
          fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {ann.author_name ? ann.author_name.charAt(0).toUpperCase() : '?'}
      </div>
      <div style={{ flex: 1 }}>
        {ann.author_name && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
            {ann.author_name}
          </span>
        )}
        {ann.content && (
          <p style={{ fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.6, margin: ann.author_name ? '4px 0 0' : 0, whiteSpace: 'pre-wrap' }}>
            {ann.content}
          </p>
        )}
        {ann.image_path && (
          <img
            src={mediaUrl(ann.image_path)}
            alt="Comment attachment"
            style={{ borderRadius: 'var(--radius-md)', maxHeight: '200px', width: 'auto', marginTop: '8px', border: '1px solid var(--color-border-subtle)' }}
          />
        )}
      </div>
    </div>
  )
}

export default function PublicRecipePage() {
  const params = useParams()
  const token = params.token as string

  const { data: recipe, isLoading, error } = useQuery<PublicRecipe>({
    queryKey: ['public-recipe', token],
    queryFn: () => getPublicRecipe(token),
    retry: false,
  })

  if (isLoading) return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '48px 24px' }}>
        <div className="skeleton" style={{ height: '280px', width: '100%', borderRadius: 'var(--radius-xl)', marginBottom: '32px' }} />
        <div className="skeleton" style={{ height: '36px', width: '55%', marginBottom: '12px' }} />
        <div className="skeleton" style={{ height: '17px', width: '85%', marginBottom: '28px' }} />
        {[80, 70, 85, 65].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: '42px', width: `${w}%`, marginBottom: '8px', borderRadius: 'var(--radius-md)' }} />
        ))}
      </div>
    </main>
  )

  if (error || !recipe) return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '8px' }}>
          Recipe not available
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--color-ink-secondary)' }}>
          This share link is invalid or has been turned off.
        </p>
      </div>
    </main>
  )

  // Comments attached to a specific step, keyed by step number.
  const byStep = recipe.annotations.reduce((acc, ann) => {
    if (ann.step_index !== undefined && ann.step_index !== null) {
      ;(acc[ann.step_index] ||= []).push(ann)
    }
    return acc
  }, {} as Record<number, PublicAnnotation[]>)
  // Recipe-level comments (no step).
  const general = recipe.annotations.filter(a => a.step_index === undefined || a.step_index === null)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Wordmark header — no links, no navigation */}
        <div style={{ paddingBlock: '28px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--color-ink-muted)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>
            Hestia
          </span>
        </div>

        {/* Cover image */}
        {recipe.cover_image && (
          <img
            src={mediaUrl(recipe.cover_image)}
            alt={recipe.title}
            style={{ display: 'block', width: '100%', height: '280px', objectFit: 'cover', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', marginBottom: '32px' }}
          />
        )}

        {/* Title */}
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', lineHeight: 1.15, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: 'var(--tracking-tight)', marginBottom: '10px' }}>
          {recipe.title}
        </h1>

        {/* Description */}
        {recipe.description && (
          <p style={{ fontSize: '1.0625rem', lineHeight: 1.7, color: 'var(--color-ink-secondary)', marginBottom: '28px' }}>
            {recipe.description}
          </p>
        )}

        {/* Metadata row */}
        {(recipe.original_yield || recipe.prep_time || recipe.cook_time) && (
          <div style={{ background: 'var(--color-brand-muted)', border: '1px solid oklch(87% 0.040 34)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
            {recipe.original_yield ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Yield</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>
                  <Users size={16} style={{ color: 'var(--color-brand)' }} /> {recipe.original_yield}
                </span>
              </div>
            ) : null}
            {recipe.prep_time ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Prep</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>
                  <Clock size={16} style={{ color: 'var(--color-brand)' }} /> {recipe.prep_time}m
                </span>
              </div>
            ) : null}
            {recipe.cook_time ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Cook</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>
                  <Flame size={16} style={{ color: 'var(--color-brand)' }} /> {recipe.cook_time}m
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '40px' }}>
            {recipe.tags.map(tag => (
              <span key={tag.id} style={{ background: 'var(--color-sage-muted)', color: 'var(--color-sage-text)', border: '1px solid oklch(85% 0.040 128)', borderRadius: 'var(--radius-pill)', padding: '5px 12px', fontSize: '12px', fontWeight: 500, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-sage-text)', borderLeft: '3px solid var(--color-sage)', paddingLeft: '12px', marginBottom: '20px', lineHeight: 1.3 }}>
              Ingredients
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {recipe.ingredients.map((ing, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '8px 12px', fontSize: '15px', color: 'var(--color-ink)' }}>
                  <span style={{ color: 'var(--color-sage)', marginTop: '2px', flexShrink: 0 }}>•</span>
                  <span>
                    <strong style={{ fontWeight: 600 }}>{ing.qty} {ing.unit}</strong> {ing.item}
                    {ing.note && <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-ink-muted)', marginLeft: '6px' }}>({ing.note})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions && recipe.instructions.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-brand-text)', borderLeft: '3px solid var(--color-brand)', paddingLeft: '12px', marginBottom: '24px', lineHeight: 1.3 }}>
              Instructions
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {recipe.instructions.map(inst => {
                const stepComments = byStep[inst.step_number] || []
                return (
                  <div key={inst.step_number} style={{ marginBottom: '16px' }}>
                    <li style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-xs)', display: 'flex', gap: '16px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-pill)', background: 'var(--color-brand-muted)', color: 'var(--color-brand)', fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {inst.step_number}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '1.0625rem', lineHeight: 1.7, color: 'var(--color-ink)', margin: 0, paddingTop: '4px' }}>{inst.text}</p>
                        {inst.image_path && (
                          <img src={mediaUrl(inst.image_path)} alt={`Step ${inst.step_number}`} style={{ marginTop: '16px', maxHeight: '240px', width: 'auto', borderRadius: 'var(--radius-lg)', objectFit: 'cover', boxShadow: 'var(--shadow-sm)' }} />
                        )}
                      </div>
                    </li>
                    {stepComments.length > 0 && (
                      <div style={{ marginLeft: '44px', borderLeft: '2px solid var(--color-border)', paddingLeft: '16px', marginTop: '8px' }}>
                        {stepComments.map(ann => <Comment key={ann.id} ann={ann} />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </ol>
          </section>
        )}

        {/* Recipe-level comments */}
        {general.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-ink-secondary)', borderLeft: '3px solid var(--color-border)', paddingLeft: '12px', marginBottom: '20px', lineHeight: 1.3 }}>
              Notes
            </h2>
            {general.map(ann => <Comment key={ann.id} ann={ann} />)}
          </section>
        )}

        {/* Source attribution — plain text, deliberately not a link */}
        {recipe.source_url && (
          <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', textAlign: 'center', marginTop: '40px', wordBreak: 'break-all' }}>
            Source: {recipe.source_url}
          </p>
        )}

        {/* Footer — read-only badge, dead end (no navigation) */}
        <p style={{ fontSize: '12px', color: 'var(--color-ink-disabled)', textAlign: 'center', marginTop: '24px', letterSpacing: 'var(--tracking-label)' }}>
          Shared from Hestia · read-only
        </p>
      </div>
    </main>
  )
}
