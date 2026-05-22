import { configureApi, apiFetch } from '@hestia/shared/lib/api';

configureApi({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
  devMode: process.env.NODE_ENV === 'development',
});

export * from '@hestia/shared/lib/api';

export const uploadRecipeImage = async (file: File) => {
  const form = new FormData();
  form.append('image', file);
  return apiFetch('/recipes/upload-image', { method: 'POST', body: form });
};

export const visionRecipePreview = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/recipes/vision/preview', { method: 'POST', body: form });
};
