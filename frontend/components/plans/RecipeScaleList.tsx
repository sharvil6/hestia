'use client'

import Link from 'next/link'
import { Flame, Minus, Plus, X } from 'lucide-react'
import { mediaUrl } from '@/lib/media'
import type { MealPlanDetail, MealPlanEntry } from '@hestia/shared/types'
import { DAY_ABBREV } from '@/lib/planDates'
import { SLOTS } from './WeekGrid'

// Scale moves in half-batch steps within the backend's accepted range.
const SCALE_STEP = 0.5
const SCALE_MIN = 0.5
const SCALE_MAX = 10

export function formatScale(scale: number): string {
  return `×${Math.round(scale * 100) / 100}`
}

function slotLabelFor(entry: MealPlanEntry): string {
  const slot = SLOTS.find(s => s.key === entry.slot)?.label.toLowerCase() ?? entry.slot
  return `${DAY_ABBREV[entry.day]} ${slot}`
}

/** One panel row = one recipe, covering every slot it's planned in. */
interface RecipeGroup {
  recipe: MealPlanEntry['recipe']
  entries: MealPlanEntry[]
  scale: number // shared batch size (entries are kept in lockstep by the stepper)
}

function groupByRecipe(entries: MealPlanEntry[]): RecipeGroup[] {
  const groups = new Map<string, RecipeGroup>()
  for (const entry of entries) {
    const g = groups.get(entry.recipe.id)
    if (g) {
      g.entries.push(entry)
    } else {
      groups.set(entry.recipe.id, { recipe: entry.recipe, entries: [entry], scale: entry.scale })
    }
  }
  // If placements got out of sync (e.g. scaled via the API), show the largest
  // so stepping down still passes through every value.
  for (const g of groups.values()) {
    g.scale = Math.max(...g.entries.map(e => e.scale))
  }
  return [...groups.values()]
}

function StepButton({
  icon: Icon,
  onClick,
  disabled,
  label,
}: {
  icon: typeof Plus
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: '26px',
        height: '26px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        color: disabled ? 'var(--color-ink-muted)' : 'var(--color-ink-secondary)',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--color-surface-sunken)'; e.currentTarget.style.color = 'var(--color-ink)' } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-raised)'; e.currentTarget.style.color = disabled ? 'var(--color-ink-muted)' : 'var(--color-ink-secondary)' }}
    >
      <Icon size={13} />
    </button>
  )
}

/**
 * "Recipes this week" — one row per distinct recipe in the plan, no matter how
 * many slots it appears in. The stepper sets the batch size for every placement
 * of that recipe at once; the grocery list still counts each placement as its
 * own batch. Per-slot removal lives on the grid chips.
 */
export default function RecipeScaleList({
  plan,
  onSetScale,
  onRemove,
  pendingRecipeId,
}: {
  plan: MealPlanDetail
  onSetScale: (entryIds: string[], scale: number) => void
  onRemove: (entryIds: string[]) => void
  pendingRecipeId?: string | null
}) {
  const sorted = [...plan.entries].sort(
    (a, b) =>
      a.day - b.day ||
      SLOTS.findIndex(s => s.key === a.slot) - SLOTS.findIndex(s => s.key === b.slot) ||
      a.position - b.position,
  )
  const groups = groupByRecipe(sorted)

  return (
    <aside
      aria-label="Recipes this week"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xs)',
        padding: '16px',
        minWidth: 0,
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 600,
          color: 'var(--color-ink)',
          letterSpacing: 'var(--tracking-snug)',
          margin: '0 0 2px',
        }}
      >
        Recipes this week
      </h2>
      <p style={{ fontSize: '12px', color: 'var(--color-ink-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Batch size scales the grocery list.
      </p>

      {groups.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0, lineHeight: 1.5 }}>
          Nothing planned yet — use “Add” in the grid to drop recipes into meal slots.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map((group, i) => {
            const { recipe, entries, scale } = group
            const busy = pendingRecipeId === recipe.id
            const entryIds = entries.map(e => e.id)
            const placements = entries.map(slotLabelFor).join(' · ')
            return (
              <div
                key={recipe.id}
                style={{
                  padding: '10px 0',
                  borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                  opacity: busy ? 0.6 : 1,
                  transition: 'opacity var(--duration-fast) var(--ease-standard)',
                }}
              >
                {/* Row 1: thumb + title/placements + remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {recipe.cover_image ? (
                    <img
                      src={mediaUrl(recipe.cover_image)}
                      alt=""
                      style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-brand-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Flame size={13} strokeWidth={1.5} style={{ color: 'var(--color-brand)', opacity: 0.7 }} />
                    </div>
                  )}

                  <div style={{ minWidth: 0, flexGrow: 1 }}>
                    <Link
                      href={`/recipe/${recipe.id}`}
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--color-ink)',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {recipe.title}
                    </Link>
                    <span
                      title={placements}
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        color: 'var(--color-ink-muted)',
                        textTransform: 'capitalize',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entries.length > 1 ? `${entries.length} meals · ${placements}` : placements}
                    </span>
                  </div>

                  <button
                    onClick={() => onRemove(entryIds)}
                    disabled={busy}
                    aria-label={`Remove ${recipe.title} from the whole plan`}
                    title={entries.length > 1 ? `Remove from all ${entries.length} meals` : 'Remove from plan'}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: 'var(--radius-md)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-ink-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'color var(--duration-fast) var(--ease-standard)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Row 2: batch stepper for every placement of this recipe */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', paddingLeft: '42px' }}>
                  <StepButton
                    icon={Minus}
                    label={`Decrease batch size for ${recipe.title}`}
                    disabled={busy || scale <= SCALE_MIN}
                    onClick={() => onSetScale(entryIds, Math.max(SCALE_MIN, Math.round((scale - SCALE_STEP) * 100) / 100))}
                  />
                  <span
                    aria-live="polite"
                    style={{
                      minWidth: '40px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: scale !== 1 ? 'var(--color-brand-text)' : 'var(--color-ink-secondary)',
                      background: scale !== 1 ? 'var(--color-brand-muted)' : 'var(--color-surface-sunken)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 8px',
                    }}
                  >
                    {formatScale(scale)}
                  </span>
                  <StepButton
                    icon={Plus}
                    label={`Increase batch size for ${recipe.title}`}
                    disabled={busy || scale >= SCALE_MAX}
                    onClick={() => onSetScale(entryIds, Math.min(SCALE_MAX, Math.round((scale + SCALE_STEP) * 100) / 100))}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
