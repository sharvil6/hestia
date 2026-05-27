import { configureApi, apiFetch } from '@hestia/shared/lib/api';

// In dev we keep the API and the page on the same host so the session cookie
// (SameSite=Lax) survives. If NEXT_PUBLIC_API_URL is set, use that; otherwise
// derive from window.location at runtime — localhost <-> 127.0.0.1 are treated
// as different sites by the browser even though both point at this machine.
function defaultBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return 'http://127.0.0.1:8000';
}

configureApi({
  baseUrl: defaultBaseUrl(),
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
