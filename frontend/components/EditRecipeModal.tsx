import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Clock, Users, BookOpen, PenLine, Loader2, Image as ImageIcon } from 'lucide-react';
import { updateRecipe, uploadRecipeImage } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ParsedIngredient {
  raw: string;
  qty: number;
  unit: string;
  item: string;
  note: string;
}

interface InstructionStep {
  text: string;
  image?: File | null;
  imagePreviewUrl?: string;
  image_path?: string;
}

interface EditRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: any;
}

export default function EditRecipeModal({ isOpen, onClose, recipe }: EditRecipeModalProps) {
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [yieldAmount, setYieldAmount] = useState<number | ''>(1);
  const [prepTime, setPrepTime] = useState<number | ''>('');
  const [cookTime, setCookTime] = useState<number | ''>('');
  
  // Dynamic Lists State
  const [ingredients, setIngredients] = useState<ParsedIngredient[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  
  const [instructions, setInstructions] = useState<InstructionStep[]>([]);
  const [instructionInput, setInstructionInput] = useState('');
  const [instructionImage, setInstructionImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingIngredientIdx, setEditingIngredientIdx] = useState<number | null>(null);
  const [editingIngredientValue, setEditingIngredientValue] = useState('');
  
  const [editingInstructionIdx, setEditingInstructionIdx] = useState<number | null>(null);
  const [editingInstructionValue, setEditingInstructionValue] = useState('');

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title || '');
      setDescription(recipe.description || '');
      setYieldAmount(recipe.original_yield || '');
      setPrepTime(recipe.prep_time || '');
      setCookTime(recipe.cook_time || '');
      
      const initialIngredients = recipe.ingredients?.map((ing: any) => ({
        raw: `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
        qty: ing.qty || 0,
        unit: ing.unit || '',
        item: ing.item || '',
        note: ing.note || ''
      })) || [];
      setIngredients(initialIngredients);

      const initialInstructions = recipe.instructions?.map((inst: any) => ({
        text: inst.text || '',
        image_path: inst.image_path,
        imagePreviewUrl: inst.image_path ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${inst.image_path}` : undefined
      })) || [];
      setInstructions(initialInstructions);
    }
  }, [recipe]);

  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (data: any) => updateRecipe(recipe.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipe.id] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      onClose();
    },
    onError: (error) => {
      console.error('Failed to update recipe', error);
      alert('Failed to save the recipe.');
    }
  });

  const parseFraction = (fracStr: string): number => {
    try {
      if (fracStr.includes('/')) {
        const parts = fracStr.split(' ');
        if (parts.length === 2) {
          const whole = parseFloat(parts[0]);
          const frac = parts[1].split('/');
          return whole + (parseFloat(frac[0]) / parseFloat(frac[1]));
        } else {
          const frac = parts[0].split('/');
          return parseFloat(frac[0]) / parseFloat(frac[1]);
        }
      }
      return parseFloat(fracStr) || 0;
    } catch {
      return 0;
    }
  };

  const parseIngredientString = (str: string): ParsedIngredient => {
    const regex = /^([\d\.\/]+(?: \d+\/\d+)?)\s*(?:(cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|oz|ounce|ounces|g|gram|grams|mg|kg|ml|l|lb|lbs|pound|pounds|pinch|dash|pt|qt|gallon|gallons|stick|sticks|can|cans|box|boxes)\b)?\s*(.*?)(?:,\s*(.*))?$/i;
    const match = str.trim().match(regex);
    let qtyStr = '1';
    let unit = '';
    let item = str.trim();
    let note = '';
    if (match) {
      qtyStr = match[1] || '1';
      unit = match[2]?.toLowerCase() || '';
      item = match[3] || '';
      note = match[4] || '';
    }
    if (!match) {
      item = str.trim();
      qtyStr = '0';
    }
    const qty = parseFraction(qtyStr);
    return { raw: str, qty, unit, item, note };
  };

  const addIngredient = () => {
    if (!ingredientInput.trim()) return;
    setIngredients([...ingredients, parseIngredientString(ingredientInput)]);
    setIngredientInput('');
  };

  const addInstruction = () => {
    if (!instructionInput.trim() && !instructionImage) return;
    setInstructions([...instructions, {
      text: instructionInput.trim(),
      image: instructionImage,
      imagePreviewUrl: instructionImage ? URL.createObjectURL(instructionImage) : undefined
    }]);
    setInstructionInput('');
    setInstructionImage(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title for your recipe.');
      return;
    }

    setIsUploading(true);
    let finalInstructions = [];
    try {
      for (let i = 0; i < instructions.length; i++) {
        let step = instructions[i];
        let image_path = step.image_path;
        if (step.image) {
          const res = await uploadRecipeImage(step.image);
          image_path = res.url;
        }
        finalInstructions.push({ step_number: i + 1, text: step.text, image_path: image_path });
      }
    } catch (err) {
      console.error('Failed to upload image', err);
      alert('Failed to upload step photo.');
      setIsUploading(false);
      return;
    }
    setIsUploading(false);

    const recipeData = {
      title,
      description: description || null,
      original_yield: yieldAmount || null,
      prep_time: prepTime || null,
      cook_time: cookTime || null,
      source_url: recipe?.source_url || null,
      cover_image: recipe?.cover_image || null,
      tags: recipe?.tags?.map((t: any) => t.name) || [],
      ingredients: ingredients.map(ing => ({
        qty: ing.qty,
        unit: ing.unit,
        item: ing.item,
        note: ing.note
      })),
      instructions: finalInstructions
    };
    mutation.mutate(recipeData);
  };

  if (!isRendered) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-3/4 lg:w-1/2 xl:w-[600px] bg-[#FDFBF7] shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          <div className="sticky top-0 bg-[#FDFBF7]/95 backdrop-blur-md px-6 py-5 border-b border-gray-200/60 z-10 flex justify-between items-center">
            <h2 className="text-2xl font-serif text-[#CC5500] flex items-center gap-2">
              <PenLine className="w-6 h-6" /> Edit Recipe
            </h2>
            <button onClick={onClose} className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 p-6 space-y-8">
            <section className="space-y-4">
              <div className="space-y-1">
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Recipe Title" 
                  className="w-full text-3xl font-serif bg-transparent border-0 border-b-2 border-transparent hover:border-gray-200 focus:border-[#8A9A5B] focus:ring-0 px-0 py-2 placeholder-gray-300 transition-colors outline-none"
                />
              </div>
              
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A family story, a note, or a brief description..." 
                className="w-full h-24 bg-white border border-gray-200 rounded-xl p-4 text-gray-700 outline-none focus:ring-2 focus:ring-[#8A9A5B]/50 focus:border-[#8A9A5B] resize-none shadow-sm"
              />
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center space-x-3 shadow-sm">
                  <div className="bg-[#8A9A5B]/10 p-2 rounded-lg text-[#8A9A5B]">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 font-medium uppercase tracking-wider block">Yield</label>
                    <input 
                      type="number" min="1"
                      value={yieldAmount}
                      onChange={(e) => setYieldAmount(e.target.value ? Number(e.target.value) : '')}
                      className="w-full text-sm font-medium bg-transparent outline-none" placeholder="e.g. 4" />
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center space-x-3 shadow-sm">
                  <div className="bg-yellow-500/10 p-2 rounded-lg text-yellow-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 font-medium uppercase tracking-wider block">Prep</label>
                    <div className="flex items-baseline space-x-1">
                      <input 
                        type="number" min="1"
                        value={prepTime}
                        onChange={(e) => setPrepTime(e.target.value ? Number(e.target.value) : '')}
                        className="w-full text-sm font-medium bg-transparent outline-none" placeholder="0" />
                      <span className="text-xs text-gray-400 font-medium">m</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center space-x-3 shadow-sm">
                  <div className="bg-red-500/10 p-2 rounded-lg text-red-500">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 font-medium uppercase tracking-wider block">Cook</label>
                    <div className="flex items-baseline space-x-1">
                      <input 
                        type="number" min="1"
                        value={cookTime}
                        onChange={(e) => setCookTime(e.target.value ? Number(e.target.value) : '')}
                        className="w-full text-sm font-medium bg-transparent outline-none" placeholder="0" />
                      <span className="text-xs text-gray-400 font-medium">m</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-serif font-medium text-gray-800 flex items-center">
                <BookOpen className="w-4 h-4 mr-2 text-[#8A9A5B]" /> Ingredients
              </h3>
              
              {ingredients.length > 0 && (
                <ul className="space-y-2 mb-4">
                  {ingredients.map((ing, idx) => (
                    <li key={idx} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-xl shadow-sm group">
                      {editingIngredientIdx === idx ? (
                        <div className="flex-1 flex items-center gap-2 mr-2">
                          <input
                            autoFocus
                            type="text"
                            value={editingIngredientValue}
                            onChange={(e) => setEditingIngredientValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newIngs = [...ingredients];
                                newIngs[idx] = parseIngredientString(editingIngredientValue);
                                setIngredients(newIngs);
                                setEditingIngredientIdx(null);
                              } else if (e.key === 'Escape') {
                                setEditingIngredientIdx(null);
                              }
                            }}
                            className="w-full border border-[#8A9A5B] rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                          />
                          <button 
                            onClick={() => {
                              const newIngs = [...ingredients];
                              newIngs[idx] = parseIngredientString(editingIngredientValue);
                              setIngredients(newIngs);
                              setEditingIngredientIdx(null);
                            }}
                            className="text-xs bg-[#8A9A5B] text-white px-2 py-1 rounded hover:bg-[#72804b]"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-[#8A9A5B]/40" />
                            <div>
                               <span className="font-semibold text-gray-700">
                                 {ing.qty > 0 ? ing.qty : ''} {ing.unit}
                               </span>{' '}
                               <span className="text-gray-600">{ing.item}</span>
                               {ing.note && <span className="text-gray-400 ml-1 italic text-sm">, {ing.note}</span>}
                            </div>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingIngredientIdx(idx);
                                setEditingIngredientValue(ing.raw);
                              }}
                              className="text-gray-300 hover:text-blue-500 mr-3"
                            >
                              <PenLine className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end space-x-2">
                <div className="flex-1">
                  <input 
                    type="text" 
                    value={ingredientInput}
                    onChange={(e) => setIngredientInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
                    placeholder="e.g., 1 1/2 cups flour, sifted" 
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#8A9A5B]/50 focus:border-[#8A9A5B] shadow-sm outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1.5 ml-2">Type amount, item, and notes (optional)</p>
                </div>
                <button 
                  onClick={addIngredient}
                  className="mb-6 bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-serif font-medium text-gray-800 flex items-center">
                <BookOpen className="w-4 h-4 mr-2 text-[#CC5500]" /> Steps
              </h3>

              {instructions.length > 0 && (
                <ul className="space-y-3 mb-4">
                  {instructions.map((step, idx) => (
                    <li key={idx} className="flex gap-4 bg-white border border-gray-100 p-4 rounded-xl shadow-sm group">
                      <div className="w-8 h-8 shrink-0 bg-[#CC5500]/10 text-[#CC5500] font-semibold rounded-full flex items-center justify-center text-sm">
                        {idx + 1}
                      </div>
                      {editingInstructionIdx === idx ? (
                        <div className="flex-1 flex flex-col gap-2 mr-2">
                          <textarea
                            autoFocus
                            value={editingInstructionValue}
                            onChange={(e) => setEditingInstructionValue(e.target.value)}
                            className="w-full border border-[#CC5500] rounded-lg p-3 text-sm focus:outline-none min-h-[5rem]"
                          />
                          <div className="flex justify-end gap-2 mt-1">
                            <button
                              onClick={() => setEditingInstructionIdx(null)}
                              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                const newInst = [...instructions];
                                newInst[idx].text = editingInstructionValue;
                                setInstructions(newInst);
                                setEditingInstructionIdx(null);
                              }}
                              className="text-sm bg-[#CC5500] text-white px-3 py-1 rounded-md hover:bg-[#aa4700]"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <p className="text-gray-700 text-sm leading-relaxed mt-1">
                              {step.text}
                            </p>
                            {step.imagePreviewUrl && (
                              <img src={step.imagePreviewUrl} alt={`Step ${idx + 1}`} className="mt-2 max-h-40 w-auto rounded-md border border-gray-200 object-cover" />
                            )}
                          </div>
                          <div className="flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity self-start gap-3">
                            <button 
                              onClick={() => {
                                setEditingInstructionIdx(idx);
                                setEditingInstructionValue(step.text);
                              }}
                              className="text-gray-300 hover:text-blue-500"
                            >
                              <PenLine className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setInstructions(instructions.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-start space-x-2">
                <div className="flex-1 flex flex-col gap-2">
                  <textarea 
                    value={instructionInput}
                    onChange={(e) => setInstructionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        addInstruction();
                      }
                    }}
                    placeholder="Enter the next step of the recipe..." 
                    className="w-full min-h-[5rem] bg-white border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#8A9A5B]/50 focus:border-[#8A9A5B] shadow-sm outline-none resize-none"
                  />
                  <div className="flex items-center justify-between ml-2">
                    <div className="flex items-center gap-3">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={(e) => setInstructionImage(e.target.files?.[0] || null)}
                      />
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-gray-400 hover:text-[#8A9A5B] transition flex items-center gap-1.5 text-sm font-medium hover:bg-gray-50 px-2 py-1 rounded-md"
                      >
                        <ImageIcon className="w-4 h-4" /> {instructionImage ? 'Change Photo' : 'Add Photo'}
                      </button>
                      
                      {instructionImage && (
                        <div className="relative inline-block">
                          <img src={URL.createObjectURL(instructionImage)} className="h-8 w-8 object-cover rounded shadow-sm border border-gray-200" alt="Preview"/>
                          <button 
                            type="button" 
                            onClick={() => setInstructionImage(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Press Enter to add step</p>
                  </div>
                </div>
                <button 
                  onClick={addInstruction}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-xl transition-colors shadow-sm self-stretch flex items-center justify-center"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 bg-[#FDFBF7]/95 backdrop-blur-md px-6 py-4 border-t border-gray-200/60 flex space-x-3">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={mutation.isPending || isUploading}
              className="flex-1 px-6 py-3 bg-[#CC5500] hover:bg-[#aa4700] text-white font-medium rounded-xl shadow-lg shadow-[#CC5500]/20 transition-all active:scale-[0.98] disabled:opacity-70 flex justify-center items-center"
            >
              {mutation.isPending || isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Recipe'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
