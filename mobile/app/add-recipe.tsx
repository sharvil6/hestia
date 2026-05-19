import { useState, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {
  createRecipe, scrapeRecipePreview,
  uploadRecipeImage, visionRecipePreview,
} from '../lib/api';
import type { Ingredient, Instruction, RecipeCreate } from '@hestia/shared/types';

type InstructionDraft = Instruction & { localImageUri?: string };

type TabMode = 'manual' | 'url' | 'photo';

const emptyIngredient = (): Ingredient => ({ qty: 0, unit: '', item: '', note: '' });
const emptyInstruction = (): InstructionDraft => ({ step_number: 1, text: '' });

export default function AddRecipe() {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabMode>('manual');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} className="ml-1">
          <Text className="text-ember text-base">Cancel</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  // URL tab state
  const [urlInput, setUrlInput] = useState('');
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [yieldAmt, setYieldAmt] = useState('1');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [tags, setTags] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [instructions, setInstructions] = useState<InstructionDraft[]>([emptyInstruction()]);

  const [photoLoading, setPhotoLoading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (payload: RecipeCreate) => createRecipe(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      router.back();
    },
    onError: () => Alert.alert('Error', 'Failed to save recipe. Please try again.'),
  });

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please add a recipe title.');
      return;
    }

    const resolvedInstructions: Instruction[] = await Promise.all(
      instructions
        .filter((s) => s.text.trim())
        .map(async (inst, i) => {
          let image_path = inst.image_path;
          if (inst.localImageUri) {
            try {
              const res = await uploadRecipeImage(inst.localImageUri);
              image_path = res.url;
            } catch {
              // proceed without image if upload fails
            }
          }
          return { step_number: i + 1, text: inst.text, image_path };
        })
    );

    saveMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      cover_image: coverImage || undefined,
      original_yield: yieldAmt ? parseInt(yieldAmt) || 1 : 1,
      prep_time: prepTime ? parseInt(prepTime) || undefined : undefined,
      cook_time: cookTime ? parseInt(cookTime) || undefined : undefined,
      ingredients: ingredients.filter((i) => i.item.trim()),
      instructions: resolvedInstructions,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  const handleScrape = async () => {
    if (!urlInput.trim()) return;
    setScrapeLoading(true);
    setScrapeError('');
    try {
      const data = await scrapeRecipePreview(urlInput.trim());
      applyScrapedData(data);
      setTab('manual');
    } catch (err: any) {
      const msg = err?.message || String(err);
      setScrapeError(`Import failed: ${msg}`);
    } finally {
      setScrapeLoading(false);
    }
  };

  const applyScrapedData = (data: any) => {
    if (data.title) setTitle(data.title);
    if (data.description) setDescription(data.description);
    if (data.cover_image) setCoverImage(data.cover_image);
    if (data.original_yield) setYieldAmt(String(data.original_yield));
    if (data.prep_time) setPrepTime(String(data.prep_time));
    if (data.cook_time) setCookTime(String(data.cook_time));
    if (data.ingredients?.length) setIngredients(data.ingredients);
    if (data.instructions?.length) setInstructions(data.instructions);
    if (data.tags?.length) setTags(data.tags.join(', '));
  };

  const handlePhotoImport = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;
    setPhotoLoading(true);
    try {
      const data = await visionRecipePreview(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      applyScrapedData(data);
      setTab('manual');
    } catch {
      Alert.alert('Error', 'Could not read recipe from photo. Try entering manually.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    try {
      const { url } = await uploadRecipeImage(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg');
      setCoverImage(url);
    } catch {
      Alert.alert('Error', 'Failed to upload image.');
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  };

  const addIngredient = () => setIngredients((prev) => [...prev, emptyIngredient()]);
  const removeIngredient = (i: number) => setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateInstruction = (index: number, text: string) => {
    setInstructions((prev) => prev.map((inst, i) => (i === index ? { ...inst, text } : inst)));
  };

  const pickInstructionImage = async (index: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) {
      setInstructions((prev) =>
        prev.map((inst, i) => (i === index ? { ...inst, localImageUri: result.assets[0].uri } : inst))
      );
    }
  };

  const removeInstructionImage = (index: number) => {
    setInstructions((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, localImageUri: undefined, image_path: undefined } : inst))
    );
  };

  const addInstruction = () =>
    setInstructions((prev) => [...prev, { step_number: prev.length + 1, text: '' }]);
  const removeInstruction = (i: number) =>
    setInstructions((prev) =>
      prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 }))
    );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Tab bar */}
      <View className="flex-row border-b border-gray-200 bg-white">
        {(['manual', 'url', 'photo'] as TabMode[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 py-3 items-center border-b-2 ${tab === t ? 'border-ember' : 'border-transparent'}`}
          >
            <Text className={`text-sm font-medium capitalize ${tab === t ? 'text-ember' : 'text-gray-400'}`}>
              {t === 'manual' ? 'Manual' : t === 'url' ? 'From URL' : 'From Photo'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* URL tab */}
        {tab === 'url' && (
          <View className="p-5 gap-4">
            <Text className="text-sm text-gray-500">Paste a recipe URL to auto-fill the form.</Text>
            <TextInput
              placeholder="https://..."
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              keyboardType="url"
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
              placeholderTextColor="#9ca3af"
            />
            {scrapeError ? <Text className="text-red-500 text-sm">{scrapeError}</Text> : null}
            <TouchableOpacity
              onPress={handleScrape}
              disabled={scrapeLoading || !urlInput.trim()}
              className="bg-ember rounded-xl py-3 items-center disabled:opacity-50"
            >
              {scrapeLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">Import Recipe</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Photo tab */}
        {tab === 'photo' && (
          <View className="p-5 gap-4 items-center">
            <Text className="text-sm text-gray-500 text-center">
              Take a photo of a handwritten recipe card or printed recipe.
            </Text>
            <TouchableOpacity
              onPress={handlePhotoImport}
              disabled={photoLoading}
              className="bg-ember rounded-xl py-4 px-8 items-center disabled:opacity-50"
            >
              {photoLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">Choose Photo</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Manual form */}
        {tab === 'manual' && (
          <View className="p-5 gap-5">
            {/* Title */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Title *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Recipe name"
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* Description */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description..."
                multiline
                numberOfLines={3}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                placeholderTextColor="#9ca3af"
                textAlignVertical="top"
              />
            </View>

            {/* Meta row */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Yields</Text>
                <TextInput
                  value={yieldAmt}
                  onChangeText={setYieldAmt}
                  keyboardType="numeric"
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Prep (min)</Text>
                <TextInput
                  value={prepTime}
                  onChangeText={setPrepTime}
                  keyboardType="numeric"
                  placeholder="0"
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Cook (min)</Text>
                <TextInput
                  value={cookTime}
                  onChangeText={setCookTime}
                  keyboardType="numeric"
                  placeholder="0"
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            {/* Tags */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tags (comma separated)</Text>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="dinner, quick, vegetarian"
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-charcoal"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* Cover image */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Cover Image</Text>
              <TouchableOpacity
                onPress={pickCoverImage}
                className="bg-white border border-dashed border-gray-300 rounded-xl py-4 items-center"
              >
                <Text className="text-gray-400 text-sm">{coverImage ? '✓ Image selected' : '+ Upload image'}</Text>
              </TouchableOpacity>
            </View>

            {/* Ingredients */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ingredients</Text>
              {ingredients.map((ing, i) => (
                <View key={i} className="flex-row gap-2 mb-2 items-center">
                  <TextInput
                    value={String(ing.qty || '')}
                    onChangeText={(v) => updateIngredient(i, 'qty', parseFloat(v) || 0)}
                    placeholder="Qty"
                    keyboardType="numeric"
                    className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-charcoal text-center"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    value={ing.unit}
                    onChangeText={(v) => updateIngredient(i, 'unit', v)}
                    placeholder="Unit"
                    className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-charcoal"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    value={ing.item}
                    onChangeText={(v) => updateIngredient(i, 'item', v)}
                    placeholder="Ingredient"
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-charcoal"
                    placeholderTextColor="#9ca3af"
                  />
                  {ingredients.length > 1 && (
                    <TouchableOpacity onPress={() => removeIngredient(i)}>
                      <Text className="text-red-400 text-lg px-1">×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity onPress={addIngredient} className="mt-1">
                <Text className="text-ember text-sm font-medium">+ Add ingredient</Text>
              </TouchableOpacity>
            </View>

            {/* Instructions */}
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Instructions</Text>
              {instructions.map((inst, i) => (
                <View key={i} className="mb-4">
                  <View className="flex-row gap-2 items-start">
                    <View className="w-7 h-7 bg-ember/10 rounded-full items-center justify-center flex-shrink-0 border border-ember/20 mt-2">
                      <Text className="text-xs font-bold text-ember">{i + 1}</Text>
                    </View>
                    <TextInput
                      value={inst.text}
                      onChangeText={(v) => updateInstruction(i, v)}
                      placeholder={`Step ${i + 1}...`}
                      multiline
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-charcoal min-h-[60px]"
                      placeholderTextColor="#9ca3af"
                      textAlignVertical="top"
                    />
                    {instructions.length > 1 && (
                      <TouchableOpacity onPress={() => removeInstruction(i)} className="mt-2">
                        <Text className="text-red-400 text-lg px-1">×</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Step image */}
                  <View className="ml-9 mt-2">
                    {inst.localImageUri ? (
                      <View className="flex-row items-center gap-3">
                        <Image
                          source={{ uri: inst.localImageUri }}
                          className="w-20 h-20 rounded-lg"
                          resizeMode="cover"
                        />
                        <TouchableOpacity onPress={() => removeInstructionImage(i)}>
                          <Text className="text-red-400 text-sm">Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => pickInstructionImage(i)}
                        className="self-start"
                      >
                        <Text className="text-gray-400 text-sm">+ Add photo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addInstruction} className="mt-1">
                <Text className="text-ember text-sm font-medium">+ Add step</Text>
              </TouchableOpacity>
            </View>

            {/* Save button */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saveMutation.isPending}
              className="bg-ember rounded-xl py-4 items-center mt-2 disabled:opacity-50"
              style={{ elevation: 3, shadowColor: '#CC5500', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Save Recipe</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
