'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { addGroceryItem, deleteGroceryItem, regenerateGrocery, updateGroceryItem } from '@/lib/api'
import type { GroceryItem, MealPlanDetail } from '@hestia/shared/types'
import { fieldStyle } from './ModalShell'

function formatQty(qty: number | null): string {
  if (qty == null) return ''
  // Trim float noise (2.9999999 → 3, 0.5 stays 0.5)
  const rounded = Math.round(qty * 100) / 100
  return String(rounded)
}

/**
 * The plan's shared, checkable grocery list. Checked state round-trips through
 * the backend so every member sees it; toggles are optimistic for snap.
 */
export default function GroceryList({ plan }: { plan: MealPlanDetail }) {
  const queryClient = useQueryClient()
  const planKey = ['plan', plan.id]
  const [newItem, setNewItem] = useState('')
  // Inline feedback instead of alert(); cleared by the next successful change.
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: planKey })
  const succeed = () => {
    setErrorMsg(null)
    invalidate()
  }

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      updateGroceryItem(plan.id, itemId, { checked }),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: planKey })
      const previous = queryClient.getQueryData<MealPlanDetail>(planKey)
      queryClient.setQueryData<MealPlanDetail>(planKey, old =>
        old
          ? { ...old, grocery_items: old.grocery_items.map(g => (g.id === itemId ? { ...g, checked } : g)) }
          : old,
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(planKey, ctx.previous)
      setErrorMsg("Couldn't save that check. Give it another try.")
    },
    onSettled: invalidate,
  })

  const addMutation = useMutation({
    mutationFn: (label: string) => addGroceryItem(plan.id, { item: label }),
    onSuccess: () => {
      setNewItem('')
      succeed()
    },
    onError: () => setErrorMsg("Couldn't add that item. Give it another try."),
  })

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteGroceryItem(plan.id, itemId),
    onSuccess: succeed,
    onError: () => setErrorMsg("Couldn't remove that item. Give it another try."),
  })

  const refreshMutation = useMutation({
    mutationFn: () => regenerateGrocery(plan.id),
    onSuccess: succeed,
    onError: () => setErrorMsg("Couldn't refresh the list. Give it another try."),
  })

  const items = [...plan.grocery_items].sort((a, b) => a.position - b.position)
  const remaining = items.filter(g => !g.checked).length

  const submitNewItem = () => {
    const label = newItem.trim()
    if (label && !addMutation.isPending) addMutation.mutate(label)
  }

  return (
    <div>
      {errorMsg && (
        <div
          role="alert"
          style={{
            background: 'var(--color-error-muted)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            marginBottom: '14px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {errorMsg}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: 0 }}>
          {items.length === 0
            ? 'Nothing to buy yet — add recipes to the week and their ingredients land here.'
            : remaining === 0
              ? 'All done! Everything is checked off.'
              : `${remaining} of ${items.length} item${items.length === 1 ? '' : 's'} still to get`}
        </p>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title="Re-derive the list from the planned recipes (picks up recipe edits)"
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
            flexShrink: 0,
            transition: 'color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand)'; e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-secondary)'; e.currentTarget.style.background = 'none' }}
        >
          <RefreshCw size={13} className={refreshMutation.isPending ? 'animate-spin' : undefined} />
          Refresh from recipes
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
        {items.map(g => (
          <GroceryRow
            key={g.id}
            item={g}
            onToggle={() => toggleMutation.mutate({ itemId: g.id, checked: !g.checked })}
            onDelete={g.is_manual ? () => deleteMutation.mutate(g.id) : undefined}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          placeholder="Add your own item (e.g. paper towels)"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitNewItem() }}
          style={{ ...fieldStyle, flexGrow: 1 }}
        />
        <button
          onClick={submitNewItem}
          disabled={!newItem.trim() || addMutation.isPending}
          aria-label="Add item"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '14px',
            fontWeight: 500,
            color: newItem.trim() ? 'var(--color-brand)' : 'var(--color-ink-muted)',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0 14px',
            cursor: newItem.trim() ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <Plus size={15} />
          Add
        </button>
      </div>
    </div>
  )
}

function GroceryRow({
  item,
  onToggle,
  onDelete,
}: {
  item: GroceryItem
  onToggle: () => void
  onDelete?: () => void
}) {
  const qtyLabel = [formatQty(item.qty), item.unit].filter(Boolean).join(' ')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        transition: 'background var(--duration-fast) var(--ease-standard)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-sunken)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.item}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: 'var(--radius-sm)',
          border: `1.5px solid ${item.checked ? 'var(--color-sage)' : 'var(--color-border)'}`,
          background: item.checked ? 'var(--color-sage)' : 'var(--color-surface-raised)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          transition: 'background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
        }}
      >
        {item.checked && <Check size={13} strokeWidth={3} style={{ color: 'white' }} />}
      </button>

      <span
        onClick={onToggle}
        style={{
          fontSize: '14px',
          color: item.checked ? 'var(--color-ink-muted)' : 'var(--color-ink)',
          textDecoration: item.checked ? 'line-through' : 'none',
          cursor: 'pointer',
          flexGrow: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.item}
        {qtyLabel && (
          <span style={{ color: 'var(--color-ink-muted)', marginLeft: '8px', fontSize: '13px' }}>{qtyLabel}</span>
        )}
      </span>

      {item.is_manual && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--color-sage-text)',
            background: 'var(--color-sage-muted)',
            borderRadius: 'var(--radius-pill)',
            padding: '2px 7px',
            letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          added
        </span>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Delete ${item.item}`}
          style={{
            width: '26px',
            height: '26px',
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
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}
