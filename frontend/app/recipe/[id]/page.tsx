'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useRef } from 'react'
import { getRecipe, addRecipeAnnotation, updateRecipeAnnotation, deleteRecipeAnnotation } from '@/lib/api'
import { useCurrentUserId } from '@/lib/currentUser'
import {
  ChevronLeft,
  Image as ImageIcon,
  X,
  Loader2,
  PenLine,
  Edit,
  Trash2,
  Users,
  Clock,
  Flame,
  Check,
  NotebookPen,
  ExternalLink,
} from 'lucide-react'
import EditRecipeModal from '@/components/EditRecipeModal'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  '1': { bg: 'oklch(92% 0.035 34)',  text: 'oklch(40% 0.14 34)' },
  '2': { bg: 'oklch(91% 0.025 220)', text: 'oklch(38% 0.10 220)' },
  '3': { bg: 'oklch(93% 0.040 128)', text: 'oklch(42% 0.075 128)' },
}
const FAMILY_NAMES: Record<string, string> = {
  '1': 'Mom', '2': 'Dad', '3': 'Kids',
}

interface Ingredient { qty: number; unit: string; item: string; note?: string }
interface Instruction  { step_number: number; text: string; image_path?: string }
interface Annotation {
  id: string; recipe_id: string; user_id?: string
  step_index?: number; content: string; image_path?: string; created_at: string
}
interface Recipe {
  id: string; title: string; description?: string; cover_image?: string
  original_yield?: number; prep_time?: number; cook_time?: number; source_url?: string
  ingredients: Ingredient[]; instructions: Instruction[]
  tags: { id: string; name: string }[]; annotations: Annotation[]
}

/* ── Skeleton ──────────────────────────────────────────────── */
function RecipeSkeleton() {
  return (
    <div style={{ maxWidth: '768px', margin: '0 auto', padding: '0 24px 96px' }}>
      <div style={{ paddingBlock: '32px', display: 'flex', justifyContent: 'space-between' }}>
        <div className="skeleton" style={{ height: '16px', width: '60px' }} />
        <div className="skeleton" style={{ height: '32px', width: '100px' }} />
      </div>
      <div className="skeleton" style={{ height: '280px', width: '100%', borderRadius: 'var(--radius-xl)', marginBottom: '32px' }} />
      <div className="skeleton" style={{ height: '36px', width: '55%', marginBottom: '10px' }} />
      <div className="skeleton" style={{ height: '17px', width: '90%', marginBottom: '6px' }} />
      <div className="skeleton" style={{ height: '17px', width: '75%', marginBottom: '28px' }} />
      <div className="skeleton" style={{ height: '72px', width: '100%', borderRadius: 'var(--radius-lg)', marginBottom: '24px' }} />
      {[80, 70, 85, 65].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: '42px', width: `${w}%`, marginBottom: '8px', borderRadius: 'var(--radius-md)' }} />
      ))}
      <div className="skeleton" style={{ height: '24px', width: '120px', marginTop: '32px', marginBottom: '16px' }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton" style={{ height: '80px', width: '100%', borderRadius: 'var(--radius-xl)', marginBottom: '12px' }} />
      ))}
    </div>
  )
}

export default function RecipeDetail() {
  const params        = useParams()
  const recipeId      = params.id as string
  const queryClient   = useQueryClient()

  const [activeStep, setActiveStep]       = useState<number | null>(null)
  const [noteContent, setNoteContent]     = useState('')
  const [noteImage, setNoteImage]         = useState<File | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set())
  const currentUserId = useCurrentUserId()
  const [editingAnnId, setEditingAnnId]   = useState<string | null>(null)
  const [editNoteContent, setEditNoteContent] = useState('')
  const [editNoteImage, setEditNoteImage] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: recipe, isLoading, error } = useQuery<Recipe>({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId),
  })

  const addNoteMutation = useMutation({
    mutationFn: (data: FormData) => addRecipeAnnotation(recipeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      setActiveStep(null); setNoteContent(''); setNoteImage(null)
    },
  })
  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) => updateRecipeAnnotation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      setEditingAnnId(null); setEditNoteContent(''); setEditNoteImage(null)
    },
  })
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteRecipeAnnotation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] }),
  })

  const annotationsByStep = recipe?.annotations?.reduce((acc, ann) => {
    if (ann.step_index !== undefined && ann.step_index !== null) {
      if (!acc[ann.step_index]) acc[ann.step_index] = []
      acc[ann.step_index].push(ann)
    }
    return acc
  }, {} as Record<number, Annotation[]>) || {}

  const handleSubmitNote = (e: React.FormEvent, stepIndex: number) => {
    e.preventDefault()
    if (!noteContent.trim() && !noteImage) return
    const fd = new FormData()
    fd.append('content', noteContent)
    fd.append('step_index', stepIndex.toString())
    if (noteImage) fd.append('image', noteImage)
    const cookie = document.cookie.split('; ').find(r => r.startsWith('hestia_user='))
    if (cookie) fd.append('user_id', cookie.split('=')[1])
    addNoteMutation.mutate(fd)
  }

  const toggleIngredient = (i: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  if (isLoading) return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
      <RecipeSkeleton />
    </main>
  )

  if (error || !recipe) return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', padding: '24px' }}>
      <div style={{ maxWidth: '768px', margin: '0 auto' }}>
        <p style={{ color: 'var(--color-error)' }}>Recipe not found.</p>
        <Link href="/" style={{ color: 'var(--color-brand)', textDecoration: 'underline', marginTop: '16px', display: 'inline-block' }}>
          ← Back to hearth
        </Link>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-canvas)', color: 'var(--color-ink)' }}>
      <div style={{ maxWidth: '768px', margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Nav bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBlock: '32px' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '14px', fontWeight: 500, color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              transition: `color var(--duration-fast) var(--ease-standard)`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-ink-secondary)' }}
          >
            <ChevronLeft size={16} /> Back
          </Link>
          <button
            onClick={() => setIsEditModalOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 500, color: 'var(--color-ink-secondary)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)',
              transition: `border-color var(--duration-fast) var(--ease-standard),
                           color var(--duration-fast) var(--ease-standard)`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--color-brand)'
              e.currentTarget.style.color = 'var(--color-brand-text)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-ink-secondary)'
            }}
          >
            <PenLine size={14} /> Edit Recipe
          </button>
        </div>

        {/* Cover image */}
        {recipe.cover_image && (
          <img
            src={recipe.cover_image}
            alt={recipe.title}
            style={{
              display: 'block', width: '100%', height: '280px',
              objectFit: 'cover',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-md)',
              marginBottom: '32px',
            }}
          />
        )}

        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.25rem',
            lineHeight: 1.15,
            fontWeight: 600,
            color: 'var(--color-ink)',
            letterSpacing: 'var(--tracking-tight)',
            marginBottom: '10px',
          }}
        >
          {recipe.title}
        </h1>

        {/* Description */}
        {recipe.description && (
          <p
            style={{
              fontSize: '1.0625rem',
              lineHeight: 1.7,
              color: 'var(--color-ink-secondary)',
              marginBottom: '28px',
            }}
          >
            {recipe.description}
          </p>
        )}

        {/* Metadata row */}
        {(recipe.original_yield || recipe.prep_time || recipe.cook_time) && (
          <div
            style={{
              background: 'var(--color-brand-muted)',
              border: '1px solid oklch(87% 0.040 34)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              display: 'flex',
              gap: '28px',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            {recipe.original_yield && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Yield</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  <Users size={16} style={{ color: 'var(--color-brand)' }} />
                  {recipe.original_yield}
                </span>
              </div>
            )}
            {recipe.original_yield && (recipe.prep_time || recipe.cook_time) && (
              <div style={{ width: '1px', height: '24px', background: 'oklch(84% 0.045 34)', alignSelf: 'center' }} />
            )}
            {recipe.prep_time && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Prep</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  <Clock size={16} style={{ color: 'var(--color-brand)' }} />
                  {recipe.prep_time}m
                </span>
              </div>
            )}
            {recipe.prep_time && recipe.cook_time && (
              <div style={{ width: '1px', height: '24px', background: 'oklch(84% 0.045 34)', alignSelf: 'center' }} />
            )}
            {recipe.cook_time && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-muted)' }}>Cook</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  <Flame size={16} style={{ color: 'var(--color-brand)' }} />
                  {recipe.cook_time}m
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '40px' }}>
            {recipe.tags.map(tag => (
              <span
                key={tag.id}
                style={{
                  background: 'var(--color-sage-muted)',
                  color: 'var(--color-sage-text)',
                  border: '1px solid oklch(85% 0.040 128)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 600,
                color: 'var(--color-sage-text)',
                borderLeft: '3px solid var(--color-sage)',
                paddingLeft: '12px',
                marginBottom: '20px',
                lineHeight: 1.3,
              }}
            >
              Ingredients
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {recipe.ingredients.map((ing, i) => {
                const checked = checkedIngredients.has(i)
                return (
                  <li
                    key={i}
                    onClick={() => toggleIngredient(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      background: checked ? 'var(--color-surface-sunken)' : 'transparent',
                      transition: `background var(--duration-fast) var(--ease-standard)`,
                    }}
                    onMouseEnter={e => {
                      if (!checked) e.currentTarget.style.background = 'var(--color-surface-sunken)'
                    }}
                    onMouseLeave={e => {
                      if (!checked) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: checked ? '2px solid var(--color-sage)' : '2px solid var(--color-border)',
                        background: checked ? 'var(--color-sage-muted)' : 'transparent',
                        flexShrink: 0,
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: `border-color var(--duration-fast), background var(--duration-fast)`,
                      }}
                    >
                      {checked && <Check size={12} style={{ color: 'var(--color-sage)' }} strokeWidth={2.5} />}
                    </div>
                    <span
                      style={{
                        fontSize: '15px',
                        color: checked ? 'var(--color-ink-muted)' : 'var(--color-ink)',
                        textDecoration: checked ? 'line-through' : 'none',
                        transition: 'color var(--duration-fast), text-decoration var(--duration-fast)',
                      }}
                    >
                      <strong style={{ fontWeight: 600, color: checked ? 'var(--color-ink-muted)' : 'var(--color-ink)' }}>
                        {ing.qty} {ing.unit}
                      </strong>{' '}
                      {ing.item}
                      {ing.note && (
                        <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-ink-muted)', marginLeft: '6px' }}>
                          ({ing.note})
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions && recipe.instructions.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 600,
                color: 'var(--color-brand-text)',
                borderLeft: '3px solid var(--color-brand)',
                paddingLeft: '12px',
                marginBottom: '24px',
                lineHeight: 1.3,
              }}
            >
              Instructions
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {recipe.instructions.map(inst => {
                const stepAnns = annotationsByStep[inst.step_number] || []
                const isAddingNote = activeStep === inst.step_number

                return (
                  <div key={inst.step_number} style={{ marginBottom: '16px' }}>
                    {/* Step card */}
                    <li
                      className="group"
                      style={{
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '20px',
                        boxShadow: 'var(--shadow-xs)',
                        display: 'flex',
                        gap: '16px',
                        position: 'relative',
                        transition: `box-shadow var(--duration-base) var(--ease-standard),
                                     border-color var(--duration-base) var(--ease-standard)`,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = 'var(--shadow-xs)'
                        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                      }}
                    >
                      {/* Step number badge */}
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--color-brand-muted)',
                          color: 'var(--color-brand)',
                          fontFamily: 'var(--font-display)',
                          fontSize: '15px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {inst.step_number}
                      </div>

                      <div style={{ flex: 1, paddingRight: '32px' }}>
                        <p style={{ fontSize: '1.0625rem', lineHeight: 1.7, color: 'var(--color-ink)', margin: 0, paddingTop: '4px' }}>
                          {inst.text}
                        </p>
                        {inst.image_path && (
                          <img
                            src={`${BASE_URL}${inst.image_path}`}
                            alt={`Step ${inst.step_number}`}
                            style={{
                              marginTop: '16px',
                              maxHeight: '240px',
                              width: 'auto',
                              borderRadius: 'var(--radius-lg)',
                              objectFit: 'cover',
                              boxShadow: 'var(--shadow-sm)',
                            }}
                          />
                        )}
                      </div>

                      {/* Add note button (hover) */}
                      {!isAddingNote && (
                        <button
                          onClick={() => { setActiveStep(inst.step_number); setNoteContent(''); setNoteImage(null) }}
                          title="Add a note to this step"
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            background: 'var(--color-surface-raised)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--color-ink-muted)',
                            transition: `opacity var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--color-brand)'
                            e.currentTarget.style.color = 'var(--color-brand)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--color-border)'
                            e.currentTarget.style.color = 'var(--color-ink-muted)'
                          }}
                        >
                          <NotebookPen size={18} />
                        </button>
                      )}
                    </li>

                    {/* Annotation thread */}
                    {(stepAnns.length > 0 || isAddingNote) && (
                      <div
                        style={{
                          marginLeft: '44px',
                          borderLeft: '2px solid var(--color-border)',
                          paddingLeft: '16px',
                          marginTop: '8px',
                        }}
                      >
                        {stepAnns.map(ann => {
                          const avatarStyle = ann.user_id ? AVATAR_COLORS[ann.user_id] : { bg: 'var(--color-surface-sunken)', text: 'var(--color-ink-muted)' }
                          const authorName  = ann.user_id ? FAMILY_NAMES[ann.user_id] : null
                          const isOwner     = currentUserId === ann.user_id
                          const isEditing   = editingAnnId === ann.id

                          return (
                            <div
                              key={ann.id}
                              className="group"
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
                              {/* Avatar */}
                              <div
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: 'var(--radius-pill)',
                                  background: avatarStyle.bg,
                                  color: avatarStyle.text,
                                  fontFamily: 'var(--font-display)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {ann.user_id ? FAMILY_NAMES[ann.user_id]?.charAt(0) : '?'}
                              </div>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                  {authorName && (
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
                                      {authorName}
                                    </span>
                                  )}
                                  {isOwner && !isEditing && (
                                    <div style={{ display: 'flex', gap: '8px', transition: 'opacity var(--duration-fast)' }} className="opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                      <button
                                        onClick={() => { setEditingAnnId(ann.id); setEditNoteContent(ann.content); setEditNoteImage(null) }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-disabled)', padding: '2px', display: 'flex' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-sage)' }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-disabled)' }}
                                        title="Edit"
                                      >
                                        <Edit size={13.5} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm('Delete this comment?')) deleteNoteMutation.mutate(ann.id)
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-disabled)', padding: '2px', display: 'flex' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)' }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-disabled)' }}
                                        title="Delete"
                                      >
                                        <Trash2 size={13.5} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {isEditing ? (
                                  <form
                                    onSubmit={e => {
                                      e.preventDefault()
                                      const fd = new FormData()
                                      if (editNoteContent.trim() !== ann.content) fd.append('content', editNoteContent)
                                      if (editNoteImage) fd.append('image', editNoteImage)
                                      if (editNoteContent.trim() !== ann.content || editNoteImage) {
                                        updateNoteMutation.mutate({ id: ann.id, data: fd })
                                      } else {
                                        setEditingAnnId(null)
                                      }
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                                  >
                                    <textarea
                                      autoFocus
                                      value={editNoteContent}
                                      onChange={e => setEditNoteContent(e.target.value)}
                                      style={{
                                        width: '100%', fontSize: '14px', lineHeight: 1.6, resize: 'none',
                                        border: '1px solid oklch(87% 0.040 34)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '8px 10px',
                                        background: 'var(--color-surface-raised)',
                                        color: 'var(--color-ink)',
                                        outline: 'none',
                                        minHeight: '60px',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <input type="file" accept="image/*" className="hidden" id={`edit-file-${ann.id}`} onChange={e => setEditNoteImage(e.target.files?.[0] || null)} />
                                        <label htmlFor={`edit-file-${ann.id}`} style={{ fontSize: '13px', color: 'var(--color-ink-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          <ImageIcon size={14} /> {editNoteImage ? 'Change Photo' : 'Update Photo'}
                                        </label>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button type="button" onClick={() => setEditingAnnId(null)} style={{ fontSize: '13px', color: 'var(--color-ink-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                          Cancel
                                        </button>
                                        <button
                                          type="submit"
                                          disabled={updateNoteMutation.isPending}
                                          style={{
                                            fontSize: '13px', fontWeight: 600, color: 'white',
                                            background: 'var(--color-brand)', border: 'none',
                                            borderRadius: 'var(--radius-md)', padding: '6px 14px',
                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            opacity: updateNoteMutation.isPending ? 0.5 : 1,
                                          }}
                                        >
                                          {updateNoteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    {ann.content && (
                                      <p style={{ fontSize: '14px', color: 'var(--color-ink)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                                        {ann.content}
                                      </p>
                                    )}
                                    {ann.image_path && (
                                      <img
                                        src={`${BASE_URL}${ann.image_path}`}
                                        alt="Annotation"
                                        style={{ borderRadius: 'var(--radius-md)', maxHeight: '200px', width: 'auto', marginTop: '8px', border: '1px solid var(--color-border-subtle)' }}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {/* Add note form */}
                        {isAddingNote && (
                          <div
                            style={{
                              border: '1px solid var(--color-brand)',
                              borderRadius: 'var(--radius-xl)',
                              boxShadow: 'var(--shadow-md)',
                              overflow: 'hidden',
                              marginBottom: '8px',
                            }}
                          >
                            <div
                              style={{
                                background: 'var(--color-brand-muted)',
                                borderBottom: '1px solid oklch(87% 0.040 34)',
                                padding: '10px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-brand-text)' }}>
                                Step {inst.step_number} — add a note
                              </span>
                              <button
                                onClick={() => setActiveStep(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-muted)', display: 'flex' }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <form onSubmit={e => handleSubmitNote(e, inst.step_number)}>
                              <textarea
                                autoFocus
                                placeholder="Share a tip, what went well, what you changed..."
                                value={noteContent}
                                onChange={e => setNoteContent(e.target.value)}
                                style={{
                                  width: '100%', minHeight: '72px', padding: '14px 16px',
                                  fontSize: '14px', lineHeight: 1.6, resize: 'none',
                                  border: 'none', outline: 'none', background: 'transparent',
                                  color: 'var(--color-ink)', boxSizing: 'border-box',
                                }}
                              />
                              {noteImage && (
                                <div style={{ padding: '0 16px 8px', position: 'relative', display: 'inline-block', marginLeft: '16px' }}>
                                  <img src={URL.createObjectURL(noteImage)} style={{ height: '64px', width: '64px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} alt="Preview" />
                                  <button
                                    type="button"
                                    onClick={() => setNoteImage(null)}
                                    style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--color-error)', color: 'white', border: 'none', borderRadius: 'var(--radius-pill)', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              )}
                              <div
                                style={{
                                  padding: '10px 16px',
                                  borderTop: '1px solid var(--color-border-subtle)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={e => setNoteImage(e.target.files?.[0] || null)} />
                                  <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      fontSize: '13px', color: 'var(--color-ink-muted)',
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                      transition: `color var(--duration-fast)`,
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-sage)' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-muted)' }}
                                  >
                                    <ImageIcon size={15} /> Add Photo
                                  </button>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => setActiveStep(null)}
                                    style={{ fontSize: '13px', color: 'var(--color-ink-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={addNoteMutation.isPending || (!noteContent.trim() && !noteImage)}
                                    style={{
                                      fontSize: '13px', fontWeight: 600, color: 'white',
                                      background: 'var(--color-brand)', border: 'none',
                                      borderRadius: 'var(--radius-md)', padding: '7px 16px',
                                      cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                                      boxShadow: 'var(--shadow-xs)',
                                      transition: `background var(--duration-fast)`,
                                      opacity: (addNoteMutation.isPending || (!noteContent.trim() && !noteImage)) ? 0.4 : 1,
                                    }}
                                    onMouseEnter={e => { if (!addNoteMutation.isPending) e.currentTarget.style.background = 'var(--color-brand-hover)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-brand)' }}
                                  >
                                    {addNoteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Save Note'}
                                  </button>
                                </div>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </ol>
          </section>
        )}

        {/* Source URL */}
        {recipe.source_url && (
          <div style={{ marginTop: '48px', textAlign: 'center' }}>
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                color: 'var(--color-sage-text)',
                textDecoration: 'none',
                transition: `color var(--duration-fast)`,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-sage)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-sage-text)' }}
            >
              <ExternalLink size={14} /> Original recipe source
            </a>
          </div>
        )}
      </div>

      <EditRecipeModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        recipe={recipe}
      />
    </main>
  )
}
