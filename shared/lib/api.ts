export type ApiConfig = {
  baseUrl: string;
  devMode?: boolean;
};

let _config: ApiConfig = { baseUrl: 'http://127.0.0.1:8000' };

export function configureApi(config: ApiConfig) {
  _config = config;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${_config.baseUrl}${path}`;
  console.log(`[api] ${options.method ?? 'GET'} ${url}`);
  const res = await fetch(url, {
    credentials: 'include',
    ...(_config.devMode ? { cache: 'no-store' } : {}),
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    console.error(`[api] ${res.status} ${url}`, err);
    throw Object.assign(new Error(err.detail || 'Request failed'), { response: { data: err } });
  }
  console.log(`[api] ${res.status} ${url}`);
  return res.json();
}

export const getRecipes = () => apiFetch('/recipes/');

export const getRecipe = (id: string) => apiFetch(`/recipes/${id}`);

export const searchRecipes = (q: string) =>
  apiFetch(`/recipes/search/fts?q=${encodeURIComponent(q)}`);

export const createRecipe = (recipe: object) =>
  apiFetch('/recipes/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });

export const updateRecipe = (id: string, recipe: object) =>
  apiFetch(`/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });

export const scrapeRecipePreview = (url: string) =>
  apiFetch('/recipes/scrape/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `url=${encodeURIComponent(url)}`,
  });

export const addRecipeAnnotation = (recipeId: string, formData: FormData) =>
  apiFetch(`/recipes/${recipeId}/annotations`, { method: 'POST', body: formData });

export const updateRecipeAnnotation = (annotationId: string, formData: FormData) =>
  apiFetch(`/recipes/annotations/${annotationId}`, { method: 'PUT', body: formData });

export const deleteRecipeAnnotation = (annotationId: string) =>
  apiFetch(`/recipes/annotations/${annotationId}`, { method: 'DELETE' });
