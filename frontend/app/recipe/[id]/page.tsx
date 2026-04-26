'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { getRecipe, addRecipeAnnotation, updateRecipeAnnotation, deleteRecipeAnnotation } from '@/lib/api'
import { MessageSquarePlus, Image as ImageIcon, X, Loader2, PenLine, Edit, Trash2 } from 'lucide-react'
import EditRecipeModal from '@/components/EditRecipeModal'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const FAMILY_MEMBERS: Record<string, {name: string, color: string}> = {
  '1': { name: 'Mom', color: 'bg-red-100 text-red-700' },
  '2': { name: 'Dad', color: 'bg-blue-100 text-blue-700' },
  '3': { name: 'Kids', color: 'bg-green-100 text-green-700' },
}

interface Ingredient {
  qty: number
  unit: string
  item: string
  note?: string
}

interface Instruction {
  step_number: number
  text: string
  image_path?: string
}

interface Annotation {
  id: string
  recipe_id: string
  user_id?: string
  step_index?: number
  content: string
  image_path?: string
  created_at: string
}

interface Recipe {
  id: string
  title: string
  description?: string
  cover_image?: string
  original_yield?: number
  prep_time?: number
  cook_time?: number
  source_url?: string
  ingredients: Ingredient[]
  instructions: Instruction[]
  tags: { id: string; name: string }[]
  annotations: Annotation[]
}

export default function RecipeDetail() {
  const params = useParams()
  const recipeId = params.id as string
  const queryClient = useQueryClient()

  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteImage, setNoteImage] = useState<File | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    const userCookie = document.cookie.split('; ').find(row => row.startsWith('hestia_user='))
    if (userCookie) {
      setCurrentUserId(userCookie.split('=')[1])
    }
  }, [])

  const [editingAnnId, setEditingAnnId] = useState<string | null>(null)
  const [editNoteContent, setEditNoteContent] = useState('')
  const [editNoteImage, setEditNoteImage] = useState<File | null>(null)

  const { data: recipe, isLoading, error } = useQuery<Recipe>({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId),
  })

  const addNoteMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return addRecipeAnnotation(recipeId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      setActiveStep(null)
      setNoteContent('')
      setNoteImage(null)
    },
  })

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      return updateRecipeAnnotation(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      setEditingAnnId(null)
      setEditNoteContent('')
      setEditNoteImage(null)
    },
  })

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteRecipeAnnotation(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
    },
  })

  // Group annotations by step index
  const annotationsByStep = recipe?.annotations?.reduce((acc, ann) => {
    if (ann.step_index !== undefined && ann.step_index !== null) {
      if (!acc[ann.step_index]) acc[ann.step_index] = []
      acc[ann.step_index].push(ann)
    }
    return acc
  }, {} as Record<number, Annotation[]>) || {}

  const handleAddNote = (stepIndex: number) => {
    setActiveStep(stepIndex)
    setNoteContent('')
    setNoteImage(null)
  }

  const handleSubmitNote = (e: React.FormEvent, stepIndex: number) => {
    e.preventDefault()
    if (!noteContent.trim() && !noteImage) return
    
    const formData = new FormData()
    formData.append('content', noteContent)
    formData.append('step_index', stepIndex.toString())
    if (noteImage) {
      formData.append('image', noteImage)
    }

    const userCookie = document.cookie.split('; ').find(row => row.startsWith('hestia_user='))
    const userId = userCookie ? userCookie.split('=')[1] : null
    if (userId) {
      formData.append('user_id', userId)
    }
    
    addNoteMutation.mutate(formData)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (isLoading) {
    return (
      <main className="min-h-screen p-6 bg-[#FDFBF7] text-[#2D2A26] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#CC5500]" />
      </main>
    )
  }

  if (error || !recipe) {
    return (
      <main className="min-h-screen p-6 bg-[#FDFBF7] text-[#2D2A26]">
        <div className="max-w-3xl mx-auto">
          <p className="text-red-500">Recipe not found.</p>
          <Link href="/" className="text-[#CC5500] underline mt-4 inline-block">
            ← Back to hearth
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 bg-[#FDFBF7] text-[#2D2A26]">
      <div className="max-w-3xl mx-auto pb-24">
        <div className="flex justify-between items-center mb-8">
          <Link href="/" className="text-sm text-[#8A9A5B] hover:underline inline-flex items-center gap-2 transition-colors">
            ← Back to hearth
          </Link>
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#CC5500] transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm hover:border-[#CC5500]/30"
          >
            <PenLine className="w-4 h-4" /> Edit Recipe
          </button>
        </div>

        {recipe.cover_image && (
          <img
            src={recipe.cover_image}
            alt={recipe.title}
            className="w-full h-72 object-cover rounded-2xl mb-8 shadow-sm"
          />
        )}

        <h1 className="text-4xl font-serif text-[#CC5500] mb-3 tracking-tight">{recipe.title}</h1>
        {recipe.description && (
          <p className="text-lg text-gray-600 mb-6 leading-relaxed bg-white/50 p-4 rounded-xl border border-orange-50">{recipe.description}</p>
        )}

        <div className="flex gap-4 text-sm text-gray-500 mb-8 flex-wrap items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          {recipe.original_yield && <span className="flex items-center gap-1.5"><span className="text-gray-400">Yields:</span> <span className="font-medium text-gray-700">{recipe.original_yield}</span></span>}
          {recipe.original_yield && <span className="text-gray-300">•</span>}
          {recipe.prep_time && <span className="flex items-center gap-1.5"><span className="text-gray-400">Prep:</span> <span className="font-medium text-gray-700">{recipe.prep_time}m</span></span>}
          {recipe.prep_time && <span className="text-gray-300">•</span>}
          {recipe.cook_time && <span className="flex items-center gap-1.5"><span className="text-gray-400">Cook:</span> <span className="font-medium text-gray-700">{recipe.cook_time}m</span></span>}
        </div>

        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex gap-2 mb-10 flex-wrap">
            {recipe.tags.map(tag => (
              <span key={tag.id} className="px-3.5 py-1.5 bg-[#8A9A5B]/10 text-[#8A9A5B] text-sm rounded-full font-medium">
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <section className="mb-12 bg-white p-6 rounded-2xl shadow-sm border border-[#8A9A5B]/10">
            <h2 className="text-2xl font-serif mb-5 text-[#8A9A5B]">Ingredients</h2>
            <ul className="space-y-3">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-4 p-2 rounded-xl hover:bg-[#FDFBF7] transition group">
                  <span className="w-5 h-5 rounded border-2 border-[#8A9A5B]/40 flex-shrink-0 mt-0.5 group-hover:border-[#8A9A5B] transition-colors" />
                  <span className="text-[1.05rem] text-gray-800">
                    <span className="font-semibold text-gray-700">{ing.qty} {ing.unit}</span> {ing.item}
                    {ing.note && <span className="text-gray-400 italic ml-1.5">({ing.note})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.instructions && recipe.instructions.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-serif mb-6 text-[#CC5500]">Instructions</h2>
            <ol className="space-y-6">
              {recipe.instructions.map((inst) => {
                const stepAnns = annotationsByStep[inst.step_number] || []
                const isAddingNote = activeStep === inst.step_number

                return (
                  <div key={inst.step_number} className="group relative">
                    <li className="flex gap-4 p-5 bg-white rounded-2xl shadow-sm border border-orange-50 hover:shadow-md transition-shadow relative">
                      <span className="w-8 h-8 bg-[#CC5500]/10 text-[#CC5500] rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm border border-[#CC5500]/20">
                        {inst.step_number}
                      </span>
                      <div className="flex-1">
                        <p className="pt-1 text-lg text-gray-800 leading-relaxed pr-8">{inst.text}</p>
                        {inst.image_path && (
                          <img 
                            src={`${BASE_URL}${inst.image_path}`} 
                            alt={`Step ${inst.step_number}`} 
                            className="mt-4 max-h-60 w-auto rounded-xl object-cover shadow-sm border border-orange-100/50"
                          />
                        )}
                      </div>
                      
                      {/* Hover action to add note */}
                      {!isAddingNote && (
                        <button 
                          onClick={() => handleAddNote(inst.step_number)}
                          className="absolute top-4 right-4 text-gray-300 hover:text-[#CC5500] bg-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-gray-100 hover:border-[#CC5500]/30 z-10"
                          title="Add a note or photo to this step"
                        >
                          <MessageSquarePlus className="w-5 h-5" />
                        </button>
                      )}
                    </li>

                    {/* Render Annotations below this step */}
                    {stepAnns.length > 0 && (
                      <div className="mt-3 ml-12 space-y-3">
                        {stepAnns.map(ann => {
                          const user = ann.user_id ? FAMILY_MEMBERS[ann.user_id] : null;
                          const initial = user ? user.name.charAt(0) : '?';
                          const avatarColor = user ? user.color : 'bg-gray-100 text-gray-500';
                          const isOwner = currentUserId === ann.user_id;
                          const isEditingThis = editingAnnId === ann.id;

                          return (
                            <div key={ann.id} className="relative bg-[#FDFBF7] p-4 rounded-xl border border-[#CC5500]/10 shadow-sm flex gap-3 items-start group">
                              <div className="absolute -left-2 top-6 w-2 h-2 rounded-full bg-[#CC5500]/40"></div>
                              
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium shadow-sm flex-shrink-0 text-sm ${avatarColor}`}>
                                {initial}
                              </div>
                              
                              <div className="flex-1 flex flex-col gap-1.5 pt-1">
                                <div className="flex justify-between items-start">
                                  {user && <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{user.name}</span>}
                                  {isOwner && !isEditingThis && (
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => {
                                          setEditingAnnId(ann.id);
                                          setEditNoteContent(ann.content);
                                          setEditNoteImage(null);
                                        }}
                                        className="text-gray-400 hover:text-[#8A9A5B] transition-colors"
                                        title="Edit comment"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => {
                                          if (confirm('Are you sure you want to delete this comment?')) {
                                            deleteNoteMutation.mutate(ann.id)
                                          }
                                        }}
                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                        title="Delete comment"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                
                                {isEditingThis ? (
                                  <form 
                                    className="flex flex-col gap-3 mt-2"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const formData = new FormData();
                                      if (editNoteContent.trim() !== ann.content) {
                                        formData.append('content', editNoteContent);
                                      }
                                      if (editNoteImage) {
                                        formData.append('image', editNoteImage);
                                      }
                                      if (editNoteContent.trim() !== ann.content || editNoteImage) {
                                          updateNoteMutation.mutate({ id: ann.id, data: formData });
                                      } else {
                                        setEditingAnnId(null);
                                      }
                                    }}
                                  >
                                    <textarea 
                                      autoFocus
                                      className="w-full text-sm resize-none focus:outline-none placeholder-gray-400 text-gray-700 bg-white border border-[#CC5500]/20 rounded-lg p-2 min-h-[60px]"
                                      value={editNoteContent}
                                      onChange={e => setEditNoteContent(e.target.value)}
                                    />
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <input 
                                          type="file" 
                                          accept="image/*" 
                                          className="hidden" 
                                          id={`edit-file-${ann.id}`}
                                          onChange={e => setEditNoteImage(e.target.files?.[0] || null)}
                                        />
                                        <label 
                                          htmlFor={`edit-file-${ann.id}`}
                                          className="text-gray-400 hover:text-[#8A9A5B] transition flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-gray-50 cursor-pointer"
                                        >
                                          <ImageIcon className="w-4 h-4" /> {editNoteImage ? 'Change Photo' : 'Update Photo'}
                                        </label>
                                        {editNoteImage && <span className="text-xs text-gray-500 ml-2">{editNoteImage.name}</span>}
                                      </div>
                                      <div className="flex gap-2">
                                        <button 
                                          type="button" 
                                          onClick={() => setEditingAnnId(null)}
                                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium"
                                        >
                                          Cancel
                                        </button>
                                        <button 
                                          type="submit" 
                                          disabled={updateNoteMutation.isPending}
                                          className="px-3 py-1.5 bg-[#CC5500] text-white text-xs font-medium rounded-lg hover:bg-[#B34A00] transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                        >
                                          {updateNoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    {ann.content && (
                                      <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{ann.content}</p>
                                    )}
                                    {ann.image_path && (
                                      <img 
                                        src={`${BASE_URL}${ann.image_path}`} 
                                        alt="Step annotation" 
                                        className="rounded-lg object-cover max-h-60 w-auto border border-gray-200 mt-1"
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Add Note Form */}
                    {isAddingNote && (
                      <div className="mt-3 ml-12 bg-white rounded-xl shadow-md border border-[#CC5500]/20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="bg-[#CC5500]/5 px-4 py-2 border-b border-[#CC5500]/10 flex justify-between items-center">
                          <span className="text-sm font-medium text-[#CC5500]">Add Note to Step {inst.step_number}</span>
                          <button onClick={() => setActiveStep(null)} className="text-gray-400 hover:text-gray-600 transition">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <form onSubmit={(e) => handleSubmitNote(e, inst.step_number)} className="p-4 flex flex-col gap-3">
                          <textarea 
                            autoFocus
                            placeholder="Share a tip, what went wrong, what went well..."
                            className="w-full text-sm resize-none focus:outline-none placeholder-gray-400 text-gray-700 bg-transparent min-h-[60px]"
                            value={noteContent}
                            onChange={e => setNoteContent(e.target.value)}
                          />
                          
                          {noteImage && (
                            <div className="relative inline-block mt-2">
                              <div className="relative h-20 w-20 rounded-md overflow-hidden border border-gray-200">
                                <img src={URL.createObjectURL(noteImage)} className="h-full w-full object-cover" alt="Preview"/>
                              </div>
                              <button 
                                type="button" 
                                onClick={() => setNoteImage(null)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          
                          <div className="flex justify-between items-center mt-2 pt-3 border-t border-gray-100">
                            <div>
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                ref={fileInputRef}
                                onChange={e => setNoteImage(e.target.files?.[0] || null)}
                              />
                              <button 
                                type="button" 
                                onClick={() => fileInputRef.current?.click()}
                                className="text-gray-400 hover:text-[#8A9A5B] transition flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-gray-50"
                              >
                                <ImageIcon className="w-4 h-4" /> Add Photo
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                type="button" 
                                onClick={() => setActiveStep(null)}
                                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
                              >
                                Cancel
                              </button>
                              <button 
                                type="submit" 
                                disabled={addNoteMutation.isPending || (!noteContent.trim() && !noteImage)}
                                className="px-4 py-1.5 bg-[#CC5500] text-white text-sm font-medium rounded-lg hover:bg-[#B34A00] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                              >
                                {addNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Note'}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )
              })}
            </ol>
          </section>
        )}

        {recipe.source_url && (
          <div className="border-t border-gray-200 pt-8 mt-12 text-center">
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#8A9A5B] font-medium rounded-xl hover:bg-[#8A9A5B]/5 transition shadow-sm border border-[#8A9A5B]/20"
            >
              View Original Source
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
