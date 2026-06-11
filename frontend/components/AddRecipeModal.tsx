import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Trash2, Clock, Users, BookOpen, Link2, PenLine, Loader2, AlertCircle, Image as ImageIcon, Camera, Upload } from 'lucide-react';
import { createRecipe, scrapeRecipePreview, uploadRecipeImage, visionRecipePreview } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import TagInput from '@/components/TagInput';

interface AddRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

interface RawIngredient { qty?: number; unit?: string; item?: string; note?: string }
interface RawInstruction { text?: string }
interface ApiError { response?: { data?: { detail?: string } } }

type TabMode = 'manual' | 'url' | 'photo';
type UrlStep = 'input' | 'loading' | 'error' | 'editing';
type PhotoStep = 'upload' | 'loading' | 'error' | 'editing';

export default function AddRecipeModal({ isOpen, onClose }: AddRecipeModalProps) {
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // Tab mode
  const [tabMode, setTabMode] = useState<TabMode>('manual');

  // URL import state
  const [urlInput, setUrlInput] = useState('');
  const [urlStep, setUrlStep] = useState<UrlStep>('input');
  const [urlError, setUrlError] = useState('');
  const [importedUrl, setImportedUrl] = useState('');

  // Photo import state
  const [photoStep, setPhotoStep] = useState<PhotoStep>('upload');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [yieldAmount, setYieldAmount] = useState<number | ''>(1);
  const [prepTime, setPrepTime] = useState<number | ''>('');
  const [cookTime, setCookTime] = useState<number | ''>('');
  const [tags, setTags] = useState<string[]>([]);

  // Dynamic Lists State
  const [ingredients, setIngredients] = useState<ParsedIngredient[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  
  const [instructions, setInstructions] = useState<InstructionStep[]>([]);
  const [instructionInput, setInstructionInput] = useState('');
  const [instructionImage, setInstructionImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing render state with animation timing
      setIsRendered(true);
      const t = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: createRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      resetForm();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create recipe', error);
      alert('Failed to save the recipe. Warming the hearth too fast?');
    }
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setYieldAmount(1);
    setPrepTime('');
    setCookTime('');
    setIngredients([]);
    setIngredientInput('');
    setInstructions([]);
    setInstructionInput('');
    setInstructionImage(null);
    setTags([]);
    setTabMode('manual');
    setUrlInput('');
    setUrlStep('input');
    setUrlError('');
    setImportedUrl('');
    setPhotoStep('upload');
    setPhotoFile(null);
    setPhotoError('');
    setPhotoPreviewUrl('');
    setIsDragging(false);
  };

  const handlePhotoSelect = useCallback((file: File) => {
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoError('');
  }, []);

  const handlePhotoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handlePhotoSelect(file);
    }
  }, [handlePhotoSelect]);

  const handlePhotoScan = async () => {
    if (!photoFile) return;
    setPhotoStep('loading');
    setPhotoError('');
    try {
      const data = await visionRecipePreview(photoFile);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setYieldAmount(data.original_yield || 1);
      setPrepTime(data.prep_time || '');
      setCookTime(data.cook_time || '');
      setImportedUrl('');
      setTags(data.tags || []);
      const ingList: ParsedIngredient[] = (data.ingredients || []).map((ing: RawIngredient) => ({
        raw: `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
        qty: ing.qty ?? 1,
        unit: ing.unit ?? '',
        item: ing.item ?? '',
        note: ing.note ?? '',
      }));
      setIngredients(ingList);
      const stepList: InstructionStep[] = (data.instructions || []).map((inst: RawInstruction) => ({ text: inst.text || '' }));
      setInstructions(stepList);
      setPhotoStep('editing');
    } catch (err) {
      const msg = (err as ApiError)?.response?.data?.detail || 'Could not extract a recipe from that photo. Try a clearer image.';
      setPhotoError(msg);
      setPhotoStep('error');
    }
  };

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

  const addIngredient = () => {
    if (!ingredientInput.trim()) return;
    const regex = /^([\d\.\/]+(?: \d+\/\d+)?)\s*(?:(cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|oz|ounce|ounces|g|gram|grams|mg|kg|ml|l|lb|lbs|pound|pounds|pinch|dash|pt|qt|gallon|gallons|stick|sticks|can|cans|box|boxes)\b)?\s*(.*?)(?:,\s*(.*))?$/i;
    const match = ingredientInput.trim().match(regex);
    let qtyStr = '1';
    let unit = '';
    let item = ingredientInput.trim();
    let note = '';
    if (match) {
      qtyStr = match[1] || '1';
      unit = match[2]?.toLowerCase() || '';
      item = match[3] || '';
      note = match[4] || '';
    }
    if (!match) {
      item = ingredientInput.trim();
      qtyStr = '0';
    }
    const qty = parseFraction(qtyStr);
    setIngredients([...ingredients, { raw: ingredientInput, qty, unit, item, note }]);
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

  // -- URL Import --
  const handleScrape = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlStep('loading');
    setUrlError('');
    try {
      const data = await scrapeRecipePreview(url);
      // Populate form fields from scraped data
      setTitle(data.title || '');
      setDescription(data.description || '');
      setYieldAmount(data.original_yield || 1);
      setPrepTime(data.prep_time || '');
      setCookTime(data.cook_time || '');
      setImportedUrl(url);
      setTags(data.tags || []);

      // Map scraped ingredients — they come back as { qty, unit, item, note }
      const ingList: ParsedIngredient[] = (data.ingredients || []).map((ing: RawIngredient) => ({
        raw: `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
        qty: ing.qty ?? 1,
        unit: ing.unit ?? '',
        item: ing.item ?? '',
        note: ing.note ?? '',
      }));
      setIngredients(ingList);

      // Map scraped instructions
      const stepList: InstructionStep[] = (data.instructions || []).map((inst: RawInstruction) => ({ text: inst.text || '' }));
      setInstructions(stepList);

      setUrlStep('editing');
    } catch (err) {
      const msg = (err as ApiError)?.response?.data?.detail || 'Could not parse a recipe from that URL. Try a different link.';
      setUrlError(msg);
      setUrlStep('error');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title for your recipe.');
      return;
    }

    setIsUploading(true);
    const finalInstructions = [];
    try {
      for (let i = 0; i < instructions.length; i++) {
        const step = instructions[i];
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
      source_url: importedUrl || null,
      tags,
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

  const isEditingPhase = tabMode === 'manual' || urlStep === 'editing' || photoStep === 'editing';

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Slide-over Panel */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-3/4 lg:w-1/2 xl:w-[600px] bg-[#FDFBF7] shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="sticky top-0 bg-[#FDFBF7]/95 backdrop-blur-md px-6 py-5 border-b border-gray-200/60 z-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-serif text-[#CC5500]">Add to Hearth</h2>
              <button onClick={onClose} className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            {/* Tab Switcher */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => { setTabMode('manual'); setUrlStep('input'); setUrlError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  tabMode === 'manual'
                    ? 'bg-white text-[#CC5500] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <PenLine className="w-4 h-4" />
                Manual
              </button>
              <button
                onClick={() => setTabMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  tabMode === 'url'
                    ? 'bg-white text-[#CC5500] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Link2 className="w-4 h-4" />
                From URL
              </button>
              <button
                onClick={() => setTabMode('photo')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  tabMode === 'photo'
                    ? 'bg-white text-[#CC5500] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Camera className="w-4 h-4" />
                Scan Photo
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 space-y-8">

            {/* ── URL Import Panel ── */}
            {tabMode === 'url' && urlStep !== 'editing' && (
              <section className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-[#CC5500]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-7 h-7 text-[#CC5500]" />
                  </div>
                  <h3 className="text-lg font-serif font-medium text-gray-800 mb-1">Import a Recipe</h3>
                  <p className="text-sm text-gray-500">
                    Paste a link from sites like{' '}
                    <span className="font-medium text-gray-700">minimalistbaker.com</span> or{' '}
                    <span className="font-medium text-gray-700">pipingpotcurry.com</span>
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
                      placeholder="https://minimalistbaker.com/..."
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#CC5500]/40 focus:border-[#CC5500] shadow-sm outline-none transition-colors"
                      disabled={urlStep === 'loading'}
                    />
                    <button
                      onClick={handleScrape}
                      disabled={!urlInput.trim() || urlStep === 'loading'}
                      className="px-5 py-3 bg-[#CC5500] hover:bg-[#aa4700] text-white font-medium rounded-xl shadow-md shadow-[#CC5500]/20 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                    >
                      {urlStep === 'loading' ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                      ) : (
                        'Import'
                      )}
                    </button>
                  </div>

                  {urlStep === 'error' && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{urlError}</span>
                    </div>
                  )}
                </div>

                {/* Supported sites hint */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {[
                    { name: 'Minimalist Baker', domain: 'minimalistbaker.com' },
                    { name: 'Piping Pot Curry', domain: 'pipingpotcurry.com' },
                    { name: 'Smitten Kitchen', domain: 'smittenkitchen.com' },
                    { name: 'AllRecipes', domain: 'allrecipes.com' },
                  ].map(site => (
                    <div key={site.domain} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-[#8A9A5B]" />
                      <span className="text-xs text-gray-600">{site.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Scraped banner (once editing) ── */}
            {tabMode === 'url' && urlStep === 'editing' && (
              <div className="flex items-center gap-3 bg-[#8A9A5B]/10 border border-[#8A9A5B]/25 rounded-xl px-4 py-3">
                <Link2 className="w-4 h-4 text-[#8A9A5B] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#8A9A5B]">Imported from URL</p>
                  <p className="text-xs text-gray-500 truncate">{importedUrl}</p>
                </div>
                <button
                  onClick={() => { setUrlStep('input'); setUrlInput(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap ml-2"
                >
                  Change
                </button>
              </div>
            )}

            {/* ── Photo Scan Panel ── */}
            {tabMode === 'photo' && photoStep !== 'editing' && (
              <section className="space-y-5">
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-[#CC5500]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Camera className="w-7 h-7 text-[#CC5500]" />
                  </div>
                  <h3 className="text-lg font-serif font-medium text-gray-800 mb-1">Scan a Recipe</h3>
                  <p className="text-sm text-gray-500">Upload a photo of a handwritten or printed recipe card</p>
                </div>

                {/* Drag and drop zone */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
                />
                <div
                  onClick={() => photoStep !== 'loading' && photoInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handlePhotoDrop}
                  className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                    photoStep === 'loading'
                      ? 'cursor-default border-gray-200 bg-gray-50'
                      : isDragging
                      ? 'border-[#CC5500] bg-[#CC5500]/5 scale-[1.01]'
                      : photoPreviewUrl
                      ? 'border-[#8A9A5B]/50 bg-[#8A9A5B]/5 hover:border-[#8A9A5B]'
                      : 'border-gray-200 bg-white hover:border-[#CC5500]/50 hover:bg-[#CC5500]/3'
                  }`}
                >
                  {photoStep === 'loading' ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-[#CC5500]/20 border-t-[#CC5500] animate-spin" />
                        <Camera className="w-6 h-6 text-[#CC5500] absolute inset-0 m-auto" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">Analysing your recipe...</p>
                        <p className="text-xs text-gray-400 mt-1">Gemini is reading the text</p>
                      </div>
                    </div>
                  ) : photoPreviewUrl ? (
                    <div className="relative">
                      <img
                        src={photoPreviewUrl}
                        alt="Recipe photo preview"
                        className="w-full max-h-64 object-contain rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                        <div className="bg-white/90 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" /> Change photo
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                        isDragging ? 'bg-[#CC5500]/20' : 'bg-gray-100'
                      }`}>
                        <Upload className={`w-5 h-5 transition-colors ${isDragging ? 'text-[#CC5500]' : 'text-gray-400'}`} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">
                          {isDragging ? 'Drop it here!' : 'Drop a photo here'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">or click to browse from your device</p>
                      </div>
                      <p className="text-xs text-gray-300">JPG, PNG, HEIC, WEBP</p>
                    </div>
                  )}
                </div>

                {photoStep === 'error' && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{photoError}</span>
                  </div>
                )}

                <button
                  onClick={handlePhotoScan}
                  disabled={!photoFile || photoStep === 'loading'}
                  className="w-full py-3 bg-[#CC5500] hover:bg-[#aa4700] text-white font-medium rounded-xl shadow-md shadow-[#CC5500]/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {photoStep === 'loading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                  ) : (
                    <><Camera className="w-4 h-4" /> Extract Recipe</>
                  )}
                </button>
              </section>
            )}

            {/* ── Photo extracted banner (once editing) ── */}
            {tabMode === 'photo' && photoStep === 'editing' && (
              <div className="flex items-center gap-3 bg-[#8A9A5B]/10 border border-[#8A9A5B]/25 rounded-xl px-4 py-3">
                <Camera className="w-4 h-4 text-[#8A9A5B] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#8A9A5B]">Extracted from photo</p>
                  <p className="text-xs text-gray-500 truncate">{photoFile?.name}</p>
                </div>
                <button
                  onClick={() => { setPhotoStep('upload'); setPhotoFile(null); setPhotoPreviewUrl(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap ml-2"
                >
                  Change
                </button>
              </div>
            )}

            {/* ── Recipe Form (always shown in manual mode; shown after scrape in url mode) ── */}
            {isEditingPhase && (
              <>
                {/* Story / About */}
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

                {/* Tags */}
                <TagInput value={tags} onChange={setTags} />

                {/* Ingredients */}
                <section className="space-y-4">
                  <h3 className="text-lg font-serif font-medium text-gray-800 flex items-center">
                    <BookOpen className="w-4 h-4 mr-2 text-[#8A9A5B]" /> Ingredients
                  </h3>
                  
                  {ingredients.length > 0 && (
                    <ul className="space-y-2 mb-4">
                      {ingredients.map((ing, idx) => (
                        <li key={idx} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-xl shadow-sm group">
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
                          <button 
                            onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

                {/* Instructions */}
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
                          <div className="flex-1">
                            <p className="text-gray-700 text-sm leading-relaxed mt-1">
                              {step.text}
                            </p>
                            {step.imagePreviewUrl && (
                              <img src={step.imagePreviewUrl} alt={`Step ${idx + 1}`} className="mt-2 max-h-40 w-auto rounded-md border border-gray-200 object-cover" />
                            )}
                          </div>
                          <button 
                            onClick={() => setInstructions(instructions.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity self-start"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
              </>
            )}
          </div>

          {/* Footer Actions */}
          {isEditingPhase && (
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
                {mutation.isPending || isUploading ? 'Saving...' : 'Add Recipe'}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
