'use client'

import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import type { MealPlanDetail, MealPlanEntry, MealSlot } from '@hestia/shared/types'
import { DAY_ABBREV, DAY_NAMES, dayDateLabel } from '@/lib/planDates'

export const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
]

function formatScale(scale: number): string {
  return `×${Math.round(scale * 100) / 100}`
}

/** Dashed "Add" affordance shared by the desktop grid cells and the phone day list. */
function AddSlotButton({
  onClick,
  label,
  pushDown = false,
}: {
  onClick: () => void
  label: string
  pushDown?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        alignSelf: 'flex-start',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--color-ink-muted)',
        background: 'none',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        padding: '3px 10px',
        cursor: 'pointer',
        marginTop: pushDown ? 'auto' : undefined,
        transition: 'color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--color-brand)'
        e.currentTarget.style.borderColor = 'var(--color-brand)'
        e.currentTarget.style.background = 'var(--color-brand-muted)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--color-ink-muted)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = 'none'
      }}
    >
      <Plus size={11} />
      Add
    </button>
  )
}

function EntryChip({ entry, onRemove }: { entry: MealPlanEntry; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '100%',
        background: 'var(--color-brand-muted)',
        borderRadius: 'var(--radius-pill)',
        padding: '3px 4px 3px 10px',
      }}
    >
      <Link
        href={`/recipe/${entry.recipe.id}`}
        title={entry.recipe.title}
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--color-brand-text)',
          textDecoration: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.recipe.title}
      </Link>
      {entry.scale !== 1 && (
        <span
          title={`Batch size ${formatScale(entry.scale)} — change it under “Recipes this week”`}
          style={{
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            lineHeight: 1,
            padding: '3px 6px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-brand)',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {formatScale(entry.scale)}
        </span>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove ${entry.recipe.title}`}
        style={{
          width: '18px',
          height: '18px',
          borderRadius: 'var(--radius-pill)',
          background: 'none',
          border: 'none',
          color: 'var(--color-brand-text)',
          opacity: 0.6,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'opacity var(--duration-fast) var(--ease-standard)',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
      >
        <X size={11} />
      </button>
    </span>
  )
}

/**
 * The Mon–Sun × breakfast/lunch/dinner grid. Days are rows; each cell holds
 * any number of recipe chips plus an add button.
 */
export default function WeekGrid({
  plan,
  onAdd,
  onRemoveEntry,
}: {
  plan: MealPlanDetail
  onAdd: (day: number, slot: MealSlot) => void
  onRemoveEntry: (entryId: string) => void
}) {
  const entriesFor = (day: number, slot: MealSlot) =>
    plan.entries.filter(e => e.day === day && e.slot === slot)

  return (
    <div style={{ minWidth: 0 }}>
      {/* Phones: day-by-day list — no sideways scrolling on a 7×3 table. */}
      <div className="sm:hidden">
        {DAY_NAMES.map((dayName, day) => (
          <section
            key={day}
            style={{ padding: '12px 0', borderTop: day > 0 ? '1px solid var(--color-border-subtle)' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>
                {dayName}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>
                {dayDateLabel(plan.week_start, day)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SLOTS.map(s => {
                const entries = entriesFor(day, s.key)
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span
                      style={{
                        width: '70px',
                        flexShrink: 0,
                        paddingTop: '5px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'var(--color-ink-muted)',
                        letterSpacing: 'var(--tracking-label)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {s.label}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: 0, flexGrow: 1 }}>
                      {entries.map(e => (
                        <EntryChip key={e.id} entry={e} onRemove={() => onRemoveEntry(e.id)} />
                      ))}
                      <AddSlotButton
                        onClick={() => onAdd(day, s.key)}
                        label={`Add recipe to ${dayName} ${s.label.toLowerCase()}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ≥sm: the week-at-a-glance grid. */}
      <div className="hidden sm:block" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '520px' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
          <span />
          {SLOTS.map(s => (
            <span
              key={s.key}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-ink-muted)',
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
                paddingLeft: '8px',
              }}
            >
              {s.label}
            </span>
          ))}
        </div>

        {DAY_NAMES.map((dayName, day) => (
          <div
            key={day}
            style={{
              display: 'grid',
              gridTemplateColumns: '52px repeat(3, minmax(0, 1fr))',
              gap: '6px',
              marginBottom: '6px',
              alignItems: 'stretch',
            }}
          >
            <div style={{ paddingTop: '8px' }} title={dayName}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                {DAY_ABBREV[day]}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                {dayDateLabel(plan.week_start, day)}
              </div>
            </div>

            {SLOTS.map(s => {
              const entries = entriesFor(day, s.key)
              return (
                <div
                  key={s.key}
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minHeight: '44px',
                    minWidth: 0,
                  }}
                >
                  {entries.map(e => (
                    <EntryChip key={e.id} entry={e} onRemove={() => onRemoveEntry(e.id)} />
                  ))}
                  <AddSlotButton
                    onClick={() => onAdd(day, s.key)}
                    label={`Add recipe to ${dayName} ${s.label.toLowerCase()}`}
                    pushDown
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
