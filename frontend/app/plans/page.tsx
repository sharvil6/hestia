'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Crown, Plus } from 'lucide-react'
import AppNav from '@/components/AppNav'
import { getPlans } from '@/lib/api'
import { useCurrentUser } from '@/lib/currentUser'
import { formatWeekRange, isCurrentWeek } from '@/lib/planDates'
import type { MealPlanSummary } from '@hestia/shared/types'
import CreatePlanModal from '@/components/plans/CreatePlanModal'
import { MemberAvatar } from '@/components/plans/MemberPicker'

function PlanCard({ plan, currentUserId }: { plan: MealPlanSummary; currentUserId?: string }) {
  const isOwner = plan.created_by === currentUserId
  const thisWeek = isCurrentWeek(plan.week_start)
  const people = [plan.owner, ...plan.members]

  return (
    <Link href={`/plans/${plan.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          transition: `box-shadow var(--duration-base) var(--ease-standard),
                       border-color var(--duration-base) var(--ease-standard),
                       transform var(--duration-base) var(--ease-standard)`,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
          e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
            {plan.name || `Week of ${formatWeekRange(plan.week_start)}`}
          </h2>
          {thisWeek && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--color-brand-text)',
                background: 'var(--color-brand-muted)',
                borderRadius: 'var(--radius-pill)',
                padding: '2px 8px',
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
              }}
            >
              This week
            </span>
          )}
        </div>

        <p style={{ fontSize: '13px', color: 'var(--color-ink-secondary)', margin: '6px 0 14px' }}>
          {formatWeekRange(plan.week_start)}
          {!isOwner && ` · shared by ${plan.owner.display_name}`}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {people.slice(0, 6).map(p => (
            <span key={p.id} style={{ position: 'relative', display: 'inline-flex' }}>
              <MemberAvatar name={p.display_name} size={24} />
              {p.id === plan.created_by && (
                <Crown
                  size={9}
                  style={{ position: 'absolute', top: '-4px', right: '-2px', color: 'var(--color-brand)' }}
                  aria-label="Plan owner"
                />
              )}
            </span>
          ))}
          {people.length > 6 && (
            <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginLeft: '4px' }}>
              +{people.length - 6}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PlansPage() {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const { data: currentUser } = useCurrentUser()

  const { data: plans, isLoading } = useQuery<MealPlanSummary[]>({
    queryKey: ['plans'],
    queryFn: getPlans,
  })

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 24px 96px' }}>

        <AppNav />

        {/* Page title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--color-ink)',
              letterSpacing: 'var(--tracking-tight)',
              margin: 0,
              lineHeight: 1,
            }}
          >
            Meal plans
          </h1>

          <button
            onClick={() => setIsCreateOpen(true)}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 500,
              color: 'white',
              background: 'var(--color-brand)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              padding: '9px 16px',
              cursor: 'pointer',
              transition: 'background var(--duration-fast) var(--ease-standard)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-brand)' }}
          >
            <Plus size={14} />
            New plan
          </button>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <div className="skeleton" style={{ height: '20px', width: '60%', marginBottom: '10px' }} />
                <div className="skeleton" style={{ height: '13px', width: '40%', marginBottom: '18px' }} />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div className="skeleton" style={{ height: '24px', width: '24px', borderRadius: 'var(--radius-pill)' }} />
                  <div className="skeleton" style={{ height: '24px', width: '24px', borderRadius: 'var(--radius-pill)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : !plans || plans.length === 0 ? (
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
              <CalendarDays size={32} style={{ color: 'var(--color-brand)' }} strokeWidth={1.5} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-ink)', marginBottom: '8px' }}>
              Plan the week's meals
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--color-ink-secondary)', maxWidth: '360px', lineHeight: 1.6, marginBottom: '20px' }}>
              Lay out breakfasts, lunches, and dinners for the week, share the plan with the family, and get a grocery list built for you.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
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
                transition: 'background var(--duration-fast) var(--ease-standard)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-muted)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <Plus size={16} /> Create your first plan
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {plans.map(p => (
              <PlanCard key={p.id} plan={p} currentUserId={currentUser?.id} />
            ))}
          </div>
        )}
      </div>

      <CreatePlanModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={plan => {
          setIsCreateOpen(false)
          router.push(`/plans/${plan.id}`)
        }}
      />
    </main>
  )
}
