'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { createPlan } from '@/lib/api'
import { mondayOf, toISODate, formatWeekRange } from '@/lib/planDates'
import type { MealPlanDetail } from '@hestia/shared/types'
import ModalShell, { fieldStyle, labelStyle, PrimaryButton } from './ModalShell'
import MemberPicker from './MemberPicker'

export default function CreatePlanModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (plan: MealPlanDetail) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [weekDate, setWeekDate] = useState(() => toISODate(new Date()))
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createPlan({ name: name.trim() || null, week_start: weekDate, member_ids: memberIds }) as Promise<MealPlanDetail>,
    onSuccess: plan => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setName('')
      setWeekDate(toISODate(new Date()))
      setMemberIds([])
      setErrorMsg(null)
      onCreated(plan)
    },
    onError: () => setErrorMsg("Couldn't create the plan. Give it another try."),
  })

  const toggleMember = (id: string) =>
    setMemberIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const weekMonday = toISODate(mondayOf(new Date(weekDate + 'T00:00:00')))

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="New meal plan">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <label style={labelStyle} htmlFor="plan-name">Name (optional)</label>
          <input
            id="plan-name"
            type="text"
            placeholder="e.g. Family dinners"
            value={name}
            onChange={e => setName(e.target.value)}
            style={fieldStyle}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="plan-week">Week</label>
          <input
            id="plan-week"
            type="date"
            value={weekDate}
            onChange={e => e.target.value && setWeekDate(e.target.value)}
            style={fieldStyle}
          />
          <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', margin: '6px 0 0' }}>
            Pick any day — the plan covers its whole week ({formatWeekRange(weekMonday)}).
          </p>
        </div>

        <div>
          <span style={labelStyle}>Share with</span>
          <MemberPicker selectedIds={memberIds} onToggle={toggleMember} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
          {errorMsg && (
            <span role="alert" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-error)' }}>
              {errorMsg}
            </span>
          )}
          <PrimaryButton onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create plan
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  )
}
