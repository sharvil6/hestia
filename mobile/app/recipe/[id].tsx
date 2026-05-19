import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {
  getRecipe,
  deleteRecipeAnnotation,
  addRecipeAnnotationWithImage,
} from '../../lib/api';
import { API_BASE_URL } from '../../lib/api';
import { getUserId } from '../../lib/user';
import type { Recipe, Annotation } from '@hestia/shared/types';

const FAMILY_MEMBERS: Record<string, { name: string }> = {
  '1': { name: 'Mom' },
  '2': { name: 'Dad' },
  '3': { name: 'Kids' },
};

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteImageUri, setNoteImageUri] = useState<string | null>(null);

  useEffect(() => {
    getUserId().then(setCurrentUserId);
  }, []);

  const { data: recipe, isLoading, error } = useQuery<Recipe>({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id),
  });

  useLayoutEffect(() => {
    if (recipe) {
      navigation.setOptions({ title: recipe.title });
    }
  }, [recipe, navigation]);

  const addNoteMutation = useMutation({
    mutationFn: ({ stepIndex }: { stepIndex: number }) =>
      addRecipeAnnotationWithImage(id, noteContent, stepIndex, currentUserId, noteImageUri ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', id] });
      setActiveStep(null);
      setNoteContent('');
      setNoteImageUri(null);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: deleteRecipeAnnotation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe', id] }),
  });

  const pickNoteImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setNoteImageUri(result.assets[0].uri);
  };

  const annotationsByStep = recipe?.annotations?.reduce<Record<number, Annotation[]>>((acc, ann) => {
    if (ann.step_index != null) {
      (acc[ann.step_index] ??= []).push(ann);
    }
    return acc;
  }, {}) ?? {};

  if (isLoading) {
    return (
      <View className="flex-1 bg-cream items-center justify-center">
        <ActivityIndicator color="#CC5500" size="large" />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View className="flex-1 bg-cream p-6">
        <Text className="text-red-500">Recipe not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-ember">← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageUrl = recipe.cover_image
    ? recipe.cover_image.startsWith('http')
      ? recipe.cover_image
      : `${API_BASE_URL}${recipe.cover_image}`
    : null;

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ paddingBottom: 48 }}>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} className="w-full h-56" resizeMode="cover" />
      )}

      <View className="px-5 pt-6">
        <Text className="text-3xl text-ember mb-2" style={{ fontFamily: 'serif' }}>
          {recipe.title}
        </Text>

        {recipe.description && (
          <Text className="text-base text-gray-600 mb-5 leading-relaxed">{recipe.description}</Text>
        )}

        {/* Meta row */}
        {(recipe.original_yield || recipe.prep_time || recipe.cook_time) && (
          <View className="flex-row gap-4 bg-white p-4 rounded-xl border border-gray-100 mb-5 flex-wrap">
            {recipe.original_yield != null && (
              <Text className="text-sm text-gray-600">
                <Text className="text-gray-400">Yields </Text>
                <Text className="font-semibold">{recipe.original_yield}</Text>
              </Text>
            )}
            {recipe.prep_time != null && (
              <Text className="text-sm text-gray-600">
                <Text className="text-gray-400">Prep </Text>
                <Text className="font-semibold">{recipe.prep_time}m</Text>
              </Text>
            )}
            {recipe.cook_time != null && (
              <Text className="text-sm text-gray-600">
                <Text className="text-gray-400">Cook </Text>
                <Text className="font-semibold">{recipe.cook_time}m</Text>
              </Text>
            )}
          </View>
        )}

        {/* Tags */}
        {recipe.tags?.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mb-6">
            {recipe.tags.map((tag) => (
              <Text key={tag.id} className="text-sm text-sage bg-sage/10 px-3 py-1 rounded-full">
                {tag.name}
              </Text>
            ))}
          </View>
        )}

        {/* Ingredients */}
        {recipe.ingredients?.length > 0 && (
          <View className="bg-white p-5 rounded-2xl border border-sage/10 mb-6">
            <Text className="text-xl text-sage mb-4" style={{ fontFamily: 'serif' }}>Ingredients</Text>
            {recipe.ingredients.map((ing, i) => (
              <View key={i} className="flex-row gap-3 py-2 border-b border-gray-50">
                <View className="w-4 h-4 rounded border-2 border-sage/40 mt-0.5 flex-shrink-0" />
                <Text className="text-base text-gray-800 flex-1">
                  <Text className="font-semibold">{ing.qty} {ing.unit}</Text>{' '}
                  {ing.item}
                  {ing.note ? <Text className="text-gray-400 italic"> ({ing.note})</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Instructions */}
        {recipe.instructions?.length > 0 && (
          <View className="mb-6">
            <Text className="text-xl text-ember mb-5" style={{ fontFamily: 'serif' }}>Instructions</Text>
            {recipe.instructions.map((inst) => {
              const stepAnns = annotationsByStep[inst.step_number] ?? [];
              const isAddingNote = activeStep === inst.step_number;
              const instImageUrl = inst.image_path ? `${API_BASE_URL}${inst.image_path}` : null;

              return (
                <View key={inst.step_number} className="mb-5">
                  <View className="bg-white p-4 rounded-2xl border border-orange-50">
                    <View className="flex-row gap-3">
                      <View className="w-7 h-7 bg-ember/10 rounded-full items-center justify-center flex-shrink-0 border border-ember/20">
                        <Text className="text-xs font-bold text-ember">{inst.step_number}</Text>
                      </View>
                      <Text className="text-base text-gray-800 flex-1 leading-relaxed pt-0.5">
                        {inst.text}
                      </Text>
                    </View>
                    {instImageUrl && (
                      <Image
                        source={{ uri: instImageUrl }}
                        className="mt-3 w-full h-44 rounded-xl"
                        resizeMode="cover"
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setActiveStep(inst.step_number);
                        setNoteContent('');
                        setNoteImageUri(null);
                      }}
                      className="mt-3 self-end flex-row items-center gap-1"
                    >
                      <Text className="text-xs text-gray-400">+ Add note</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Annotations for this step */}
                  {stepAnns.map((ann) => {
                    const user = ann.user_id ? FAMILY_MEMBERS[ann.user_id] : null;
                    const annImageUrl = ann.image_path ? `${API_BASE_URL}${ann.image_path}` : null;
                    const isOwner = currentUserId === ann.user_id;

                    return (
                      <View key={ann.id} className="ml-10 mt-2 bg-cream p-3 rounded-xl border border-ember/10">
                        {user && (
                          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                            {user.name}
                          </Text>
                        )}
                        {ann.content ? (
                          <Text className="text-gray-700 text-sm leading-relaxed">{ann.content}</Text>
                        ) : null}
                        {annImageUrl && (
                          <Image
                            source={{ uri: annImageUrl }}
                            className="mt-2 w-full h-36 rounded-lg"
                            resizeMode="cover"
                          />
                        )}
                        {isOwner && (
                          <TouchableOpacity
                            onPress={() =>
                              Alert.alert('Delete note', 'Are you sure?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => deleteNoteMutation.mutate(ann.id),
                                },
                              ])
                            }
                            className="mt-2 self-end"
                          >
                            <Text className="text-xs text-red-400">Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}

                  {/* Add note form */}
                  {isAddingNote && (
                    <View className="ml-10 mt-2 bg-white rounded-xl border border-ember/20 overflow-hidden">
                      <View className="px-4 py-2 border-b border-ember/10 flex-row justify-between items-center bg-ember/5">
                        <Text className="text-sm font-medium text-ember">
                          Note for step {inst.step_number}
                        </Text>
                        <TouchableOpacity onPress={() => setActiveStep(null)}>
                          <Text className="text-gray-400 text-lg">×</Text>
                        </TouchableOpacity>
                      </View>
                      <View className="p-4 gap-3">
                        <TextInput
                          multiline
                          autoFocus
                          placeholder="Share a tip, what went well..."
                          value={noteContent}
                          onChangeText={setNoteContent}
                          className="text-sm text-gray-700 min-h-[60px]"
                          placeholderTextColor="#9ca3af"
                          textAlignVertical="top"
                        />
                        {noteImageUri && (
                          <View className="flex-row items-center gap-2">
                            <Image
                              source={{ uri: noteImageUri }}
                              className="w-16 h-16 rounded-lg"
                              resizeMode="cover"
                            />
                            <TouchableOpacity onPress={() => setNoteImageUri(null)}>
                              <Text className="text-red-400 text-xs">Remove</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        <View className="flex-row justify-between items-center pt-2 border-t border-gray-100">
                          <TouchableOpacity onPress={pickNoteImage}>
                            <Text className="text-sm text-gray-400">+ Photo</Text>
                          </TouchableOpacity>
                          <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => setActiveStep(null)}>
                              <Text className="text-sm text-gray-500">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => addNoteMutation.mutate({ stepIndex: inst.step_number })}
                              disabled={addNoteMutation.isPending || (!noteContent.trim() && !noteImageUri)}
                              className="bg-ember px-4 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              {addNoteMutation.isPending ? (
                                <ActivityIndicator color="white" size="small" />
                              ) : (
                                <Text className="text-white text-sm font-medium">Save</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Source link */}
        {recipe.source_url && (
          <TouchableOpacity
            onPress={() => Linking.openURL(recipe.source_url!)}
            className="border border-sage/20 rounded-xl py-3 px-6 items-center mt-4"
          >
            <Text className="text-sage font-medium">View Original Source</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}
