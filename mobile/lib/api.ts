import { configureApi, apiFetch } from '@hestia/shared/lib/api';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';

configureApi({
  baseUrl: API_BASE_URL,
  devMode: __DEV__,
});

if (__DEV__) {
  console.log('[api] base URL:', API_BASE_URL);
}

export * from '@hestia/shared/lib/api';

export const uploadRecipeImage = async (uri: string, mimeType = 'image/jpeg') => {
  const form = new FormData();
  form.append('image', { uri, type: mimeType, name: 'image.jpg' } as any);
  return apiFetch('/recipes/upload-image', { method: 'POST', body: form });
};

export const visionRecipePreview = async (uri: string, mimeType = 'image/jpeg') => {
  const form = new FormData();
  form.append('file', { uri, type: mimeType, name: 'image.jpg' } as any);
  return apiFetch('/recipes/vision/preview', { method: 'POST', body: form });
};

export const addRecipeAnnotationWithImage = async (
  recipeId: string,
  content: string,
  stepIndex: number,
  userId: string | null,
  imageUri?: string,
) => {
  const form = new FormData();
  form.append('content', content);
  form.append('step_index', stepIndex.toString());
  if (userId) form.append('user_id', userId);
  if (imageUri) {
    form.append('image', { uri: imageUri, type: 'image/jpeg', name: 'annotation.jpg' } as any);
  }
  return apiFetch(`/recipes/${recipeId}/annotations`, { method: 'POST', body: form });
};
