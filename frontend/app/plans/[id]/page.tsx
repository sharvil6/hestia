'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, Crown, ShoppingBasket, Trash2, UserPlus, X } from 'lucide-react'
import { addPlanEntry, deletePlan, deletePlanEntry, getPlan, updatePlanEntry } from '@/lib/api'
import { useCurrentUser } from '@/lib/currentUser'
import { formatWeekRange, isCurrentWeek, DAY_ABBREV } from '@/lib/planDates'
import type { MealPlanDetail, MealSlot } from '@hestia/shared/types'
import AppNav from '@/components/AppNav'
import WeekGrid, { SLOTS } from '@/components/plans/WeekGrid'
import RecipeScaleList from '@/components/plans/RecipeScaleList'
import GroceryList from '@/components/plans/GroceryList'
import RecipePickerModal from '@/components/plans/RecipePickerModal'
import MembersModal from '@/components/plans/MembersModal'
import { MemberAvatar } from '@/components/plans/MemberPicker'

type Tab = 'week' | 'grocery'

export default function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()

  const [tab, setTab] = useState<Tab>('week')
  const [pickerTarget, setPickerTarget] = useState<{ day: number; slot: MealSlot } | null>(null)
  const [isMembersOpen, setIsMembersOpen] = useState(false)
  // Inline feedback instead of alert(); cleared on the next successful change.
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Two-tap plan delete: first tap arms the button, second tap deletes.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  const { data: plan, isLoading, error } = useQuery<MealPlanDetail>({
    queryKey: ['plan', id],
    queryFn: () => getPlan(id),
    retry: false,
  })

  const refresh = (updated: MealPlanDetail) => {
    queryClient.setQueryData(['plan', id], updated)
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    setErrorMsg(null)
  }

  const fail = (message: string) => {
    setErrorMsg(message)
    queryClient.invalidateQueries({ queryKey: ['plan', id] })
  }

  const addEntryMutation = useMutation({
    mutationFn: ({ day, slot, recipeId }: { day: number; slot: MealSlot; recipeId: string }) =>
      addPlanEntry(id, { day, slot, recipe_id: recipeId }) as Promise<MealPlanDetail>,
    onSuccess: refresh,
    onError: () => fail("Couldn't add that recipe. Give it another try."),
  })

  // The panel scales/removes per recipe, which can span several entries; apply
  // sequentially and keep the last response (each returns the full plan).
  const scaleEntriesMutation = useMutation({
    mutationFn: async ({ entryIds, scale }: { recipeId: string; entryIds: string[]; scale: number }) => {
      let latest: MealPlanDetail | undefined
      for (const entryId of entryIds) {
        latest = (await updatePlanEntry(id, entryId, { scale })) as MealPlanDetail
      }
      return latest!
    },
    onSuccess: refresh,
    onError: () => fail("Couldn't change the batch size. Give it another try."),
  })

  const removeEntriesMutation = useMutation({
    mutationFn: async ({ entryIds }: { recipeId: string; entryIds: string[] }) => {
      let latest: MealPlanDetail | undefined
      for (const entryId of entryIds) {
        latest = (await deletePlanEntry(id, entryId)) as MealPlanDetail
      }
      return latest!
    },
    onSuccess: refresh,
    onError: () => fail("Couldn't remove that recipe. Give it another try."),
  })

  const removeEntryMutation = useMutation({
    mutationFn: (entryId: string) => deletePlanEntry(id, entryId) as Promise<MealPlanDetail>,
    onSuccess: refresh,
    onError: () => fail("Couldn't remove that recipe. Give it another try."),
  })

  const deletePlanMutation = useMutation({
    mutationFn: () => deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      router.push('/plans')
    },
    onError: () => {
      setConfirmingDelete(false)
      fail("Couldn't delete the plan. Give it another try.")
    },
  })

  const armDelete = () => {
    if (confirmingDelete) {
      deletePlanMutation.mutate()
      return
    }
    setConfirmingDelete(true)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 4000)
  }

  if (isLoading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px' }}>
          <AppNav />
          <div className="skeleton" style={{ height: '32px', width: '240px', borderRadius: 'var(--radius-md)', marginBottom: '12px' }} />
          <div className="skeleton" style={{ height: '16px', width: '140px', borderRadius: 'var(--radius-md)', marginBottom: '28px' }} />
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <div className="skeleton" style={{ height: '34px', width: '90px', borderRadius: 'var(--radius-pill)' }} />
            <div className="skeleton" style={{ height: '34px', width: '130px', borderRadius: 'var(--radius-pill)' }} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '52px', width: '100%', borderRadius: 'var(--radius-lg)', marginBottom: '10px' }} />
          ))}
        </div>
      </main>
    )
  }

  if (error || !plan) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--color-ink)' }}>
            Plan not found
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-ink-secondary)', marginTop: '8px' }}>
            It may have been deleted, or you may not have access to it.
          </p>
          <Link href="/plans" style={{ display: 'inline-block', marginTop: '16px', fontSize: '14px', color: 'var(--color-brand)' }}>
            Back to meal plans
          </Link>
        </div>
      </main>
    )
  }

  const isOwner = plan.created_by === currentUser?.id
  const people = [plan.owner, ...plan.members]
  const uncheckedCount = plan.grocery_items.filter(g => !g.checked).length
  const title = plan.name || `Week of ${formatWeekRange(plan.week_start)}`

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 96px' }}>

        <AppNav />

        {/* Plan header */}
        <header style={{ paddingBlock: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <Link
              href="/plans"
              aria-label="Back to meal plans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                marginTop: '2px',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--color-ink-secondary)',
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'background var(--duration-fast) var(--ease-standard)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <ChevronLeft size={18} />
            </Link>

            {/* minWidth keeps the title readable; controls wrap below when tight. */}
            <div style={{ flexGrow: 1, minWidth: 'min(200px, 60%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1.5rem, 3.5vw, 2rem)',
                    fontWeight: 600,
                    color: 'var(--color-ink)',
                    letterSpacing: 'var(--tracking-tight)',
                    margin: 0,
                    lineHeight: 1.15,
                  }}
                >
                  {title}
                </h1>
                {isCurrentWeek(plan.week_start) && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--color-brand-text)',
                      background: 'var(--color-brand-muted)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 9px',
                      letterSpacing: 'var(--tracking-label)',
                      textTransform: 'uppercase',
                    }}
                  >
                    This week
                  </span>
                )}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--color-ink-secondary)', margin: '6px 0 0' }}>
                {formatWeekRange(plan.week_start)}
                {!isOwner && ` · shared by ${plan.owner.display_name}`}
              </p>
            </div>

            {/* Wraps to its own right-aligned line on phones. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              {/* Member avatars */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                {people.slice(0, 5).map(p => (
                  <span key={p.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    <MemberAvatar name={p.display_name} size={26} />
                    {p.id === plan.created_by && (
                      <Crown
                        size={10}
                        style={{ position: 'absolute', top: '-5px', right: '-2px', color: 'var(--color-brand)' }}
                        aria-label="Plan owner"
                      />
                    )}
                  </span>
                ))}
              </div>

              {isOwner && (
                <>
                  <button
                    onClick={() => setIsMembersOpen(true)}
                    title="Share this plan"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-sage-text)',
                      background: 'var(--color-sage-muted)',
                      border: 'none',
                      borderRadius: 'var(--radius-pill)',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      transition: 'filter var(--duration-fast) var(--ease-standard)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.96)' }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
                  >
                    <UserPlus size={14} />
                    Share
                  </button>
                  <button
                    onClick={armDelete}
                    disabled={deletePlanMutation.isPending}
                    aria-label={confirmingDelete ? 'Confirm: delete this plan and its grocery list' : 'Delete plan'}
                    title={confirmingDelete ? 'This also deletes the grocery list' : 'Delete plan'}
                    style={{
                      height: '34px',
                      minWidth: '34px',
                      padding: confirmingDelete ? '0 12px' : 0,
                      borderRadius: 'var(--radius-pill)',
                      background: confirmingDelete ? 'var(--color-error-muted)' : 'none',
                      border: `1px solid ${confirmingDelete ? 'var(--color-error)' : 'var(--color-border)'}`,
                      color: confirmingDelete ? 'var(--color-error)' : 'var(--color-ink-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      transition: 'color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)',
                    }}
                    onMouseEnter={e => { if (!confirmingDelete) { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.borderColor = 'var(--color-error)' } }}
                    onMouseLeave={e => { if (!confirmingDelete) { e.currentTarget.style.color = 'var(--color-ink-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' } }}
                  >
                    <Trash2 size={15} />
                    {confirmingDelete && 'Delete plan?'}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {([
            { key: 'week' as Tab, label: 'Week', icon: CalendarDays, badge: null },
            { key: 'grocery' as Tab, label: 'Grocery list', icon: ShoppingBasket, badge: uncheckedCount > 0 ? uncheckedCount : null },
          ]).map(({ key, label, icon: Icon, badge }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={active}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 500,
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-brand)' : 'var(--color-surface-raised)',
                  color: active ? 'white' : 'var(--color-ink-secondary)',
                  transition: `background var(--duration-fast) var(--ease-standard),
                               color var(--duration-fast) var(--ease-standard),
                               border-color var(--duration-fast) var(--ease-standard)`,
                }}
              >
                <Icon size={14} />
                {label}
                {badge != null && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      background: active ? 'oklch(100% 0 0 / 0.25)' : 'var(--color-brand-muted)',
                      color: active ? 'white' : 'var(--color-brand-text)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '1px 7px',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'var(--color-error-muted)',
              color: 'var(--color-error)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 14px',
              marginBottom: '20px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <span style={{ flexGrow: 1 }}>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              aria-label="Dismiss"
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '2px',
                opacity: 0.7,
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {tab === 'week' ? (
          /* Grid + batch column side by side on desktop; stacked on mobile,
             where the grid keeps its own horizontal scroll. */
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <WeekGrid
              plan={plan}
              onAdd={(day, slot) => setPickerTarget({ day, slot })}
              onRemoveEntry={entryId => removeEntryMutation.mutate(entryId)}
            />
            <div className="lg:sticky lg:top-6">
              <RecipeScaleList
                plan={plan}
                onSetScale={(entryIds, scale) => {
                  const recipeId = plan.entries.find(e => e.id === entryIds[0])?.recipe.id ?? ''
                  scaleEntriesMutation.mutate({ recipeId, entryIds, scale })
                }}
                onRemove={entryIds => {
                  const recipeId = plan.entries.find(e => e.id === entryIds[0])?.recipe.id ?? ''
                  removeEntriesMutation.mutate({ recipeId, entryIds })
                }}
                pendingRecipeId={
                  (scaleEntriesMutation.isPending ? scaleEntriesMutation.variables?.recipeId : null) ??
                  (removeEntriesMutation.isPending ? removeEntriesMutation.variables?.recipeId : null)
                }
              />
            </div>
          </div>
        ) : (
          <GroceryList plan={plan} />
        )}
      </div>

      <RecipePickerModal
        isOpen={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        slotLabel={
          pickerTarget
            ? `${DAY_ABBREV[pickerTarget.day]} ${SLOTS.find(s => s.key === pickerTarget.slot)?.label.toLowerCase()}`
            : ''
        }
        onPick={recipeId => {
          if (pickerTarget) {
            addEntryMutation.mutate({ day: pickerTarget.day, slot: pickerTarget.slot, recipeId })
          }
          setPickerTarget(null)
        }}
      />

      <MembersModal isOpen={isMembersOpen} onClose={() => setIsMembersOpen(false)} plan={plan} />
    </main>
  )
}
