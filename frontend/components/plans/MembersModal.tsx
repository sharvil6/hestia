'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { setPlanMembers } from '@/lib/api'
import type { MealPlanDetail } from '@hestia/shared/types'
import ModalShell, { labelStyle, PrimaryButton } from './ModalShell'
import MemberPicker from './MemberPicker'

/** Owner-only: replace the plan's member list. */
export default function MembersModal({
  isOpen,
  onClose,
  plan,
}: {
  isOpen: boolean
  onClose: () => void
  plan: MealPlanDetail
}) {
  const queryClient = useQueryClient()
  const [memberIds, setMemberIds] = useState<string[]>(plan.members.map(m => m.id))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Re-seed the selection each time the modal opens (or the plan changes).
  useEffect(() => {
    if (isOpen) setMemberIds(plan.members.map(m => m.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, plan.id])

  const mutation = useMutation({
    mutationFn: () => setPlanMembers(plan.id, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', plan.id] })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setErrorMsg(null)
      onClose()
    },
    onError: () => setErrorMsg("Couldn't update the members. Give it another try."),
  })

  const toggleMember = (id: string) =>
    setMemberIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Share this plan">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <span style={labelStyle}>Members</span>
          <p style={{ fontSize: '13px', color: 'var(--color-ink-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Members can add and remove meals and use the grocery list. Only you can change who&apos;s on the plan.
          </p>
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
            Save members
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  )
}
