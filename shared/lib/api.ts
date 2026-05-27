export type ApiConfig = {
  baseUrl: string;
  devMode?: boolean;
  /**
   * Native clients (React Native / Expo) supply a callback that returns the
   * raw session token; we send it as `Authorization: Bearer ...` because
   * cross-origin cookies in RN aren't reliable. Web leaves this unset and
   * uses the cookie set by the response.
   */
  getAuthToken?: () => string | null | undefined;
};

let _config: ApiConfig = { baseUrl: 'http://127.0.0.1:8000' };

export function configureApi(config: ApiConfig) {
  _config = config;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${_config.baseUrl}${path}`;
  console.log(`[api] ${options.method ?? 'GET'} ${url}`);
  const headers = new Headers(options.headers as HeadersInit | undefined);
  const token = _config.getAuthToken?.();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, {
    credentials: 'include',
    ...(_config.devMode ? { cache: 'no-store' } : {}),
    ...options,
    headers,
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

// ----- Auth ------------------------------------------------------------------

export const authMe = () => apiFetch('/auth/me');

export const authLogout = () =>
  apiFetch('/auth/logout', { method: 'POST' });

export const authLoginWithWords = (words: string[]) =>
  apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  });

export const authLoginWithQr = (qr_payload: string) =>
  apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_payload }),
  });

export const authEnroll = (code: string) =>
  apiFetch('/auth/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

export const authInviteInfo = (code: string) =>
  apiFetch(`/auth/invites/${encodeURIComponent(code)}`);

export const authRotateKey = () =>
  apiFetch('/auth/rotate-key', { method: 'POST' });

export const authListSessions = () => apiFetch('/auth/sessions');

export const authRevokeSession = (idPrefix: string) =>
  apiFetch(`/auth/sessions/${encodeURIComponent(idPrefix)}`, { method: 'DELETE' });

// Admin
export const authCreateInvite = (display_name: string) =>
  apiFetch('/auth/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name }),
  });

export const authListUsers = () => apiFetch('/auth/users');

export const authAdminRevokeUser = (userId: string) =>
  apiFetch(`/auth/users/${encodeURIComponent(userId)}/revoke-key`, { method: 'POST' });

// Passkeys
export const passkeysList = () => apiFetch('/auth/passkeys');

export const passkeyRename = (id: string, nickname: string) =>
  apiFetch(`/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });

export const passkeyRevoke = (id: string) =>
  apiFetch(`/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const passkeyRegisterBegin = () =>
  apiFetch('/auth/passkeys/register/begin', { method: 'POST' });

export const passkeyRegisterComplete = (credential: unknown) =>
  apiFetch('/auth/passkeys/register/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });

export const passkeyLoginBegin = () =>
  apiFetch('/auth/passkeys/login/begin', { method: 'POST' });

export const passkeyLoginComplete = (credential: unknown) =>
  apiFetch('/auth/passkeys/login/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });
