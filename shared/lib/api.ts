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
    // `status` lets callers distinguish "gone" (404) from "broken" without
    // string-matching the detail message.
    throw Object.assign(new Error(err.detail || 'Request failed'), { response: { status: res.status, data: err } });
  }
  console.log(`[api] ${res.status} ${url}`);
  return res.json();
}

export const getRecipes = () => apiFetch('/recipes/');

export const getRecipe = (id: string) => apiFetch(`/recipes/${id}`);

export const searchRecipes = (q: string) =>
  apiFetch(`/recipes/search/fts?q=${encodeURIComponent(q)}`);

export const getTags = () => apiFetch('/tags/');

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

// ----- Recipe drafts ---------------------------------------------------------
// Autosaved, in-progress recipes. Private to the signed-in user and invisible
// to the shared cookbook until they're published as a real recipe.

export const getRecipeDrafts = () => apiFetch('/recipes/drafts/');

export const getRecipeDraft = (id: string) =>
  apiFetch(`/recipes/drafts/${encodeURIComponent(id)}`);

export const createRecipeDraft = (draft: { title?: string | null; payload: object }) =>
  apiFetch('/recipes/drafts/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });

export const updateRecipeDraft = (id: string, draft: { title?: string | null; payload: object }) =>
  apiFetch(`/recipes/drafts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });

export const deleteRecipeDraft = (id: string) =>
  apiFetch(`/recipes/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ----- Public sharing --------------------------------------------------------

// Enable sharing (idempotent) — returns { share_token }.
export const shareRecipe = (recipeId: string) =>
  apiFetch(`/recipes/${recipeId}/share`, { method: 'POST' });

// Revoke the public link — returns { share_token: null }.
export const unshareRecipe = (recipeId: string) =>
  apiFetch(`/recipes/${recipeId}/share`, { method: 'DELETE' });

// Unauthenticated read of a shared recipe by its token (read-only, no private comments).
export const getPublicRecipe = (shareToken: string) =>
  apiFetch(`/recipes/public/${encodeURIComponent(shareToken)}`);

// ----- Meal plans ------------------------------------------------------------

const jsonHeaders = { 'Content-Type': 'application/json' };

export const getPlans = () => apiFetch('/plans/');

export const getPlan = (id: string) => apiFetch(`/plans/${encodeURIComponent(id)}`);

export const createPlan = (plan: { name?: string | null; week_start: string; member_ids: string[] }) =>
  apiFetch('/plans/', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(plan) });

export const updatePlan = (id: string, changes: { name?: string | null; week_start?: string }) =>
  apiFetch(`/plans/${encodeURIComponent(id)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(changes) });

export const deletePlan = (id: string) =>
  apiFetch(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Owner-only, replace-all membership (the owner is implicit and never listed).
export const setPlanMembers = (id: string, user_ids: string[]) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/members`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ user_ids }) });

export const addPlanEntry = (id: string, entry: { day: number; slot: string; recipe_id: string; scale?: number }) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/entries`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(entry) });

// Change an entry's batch scale (2 = double, 3 = triple); grocery list re-syncs.
export const updatePlanEntry = (id: string, entryId: string, changes: { scale: number }) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/entries/${encodeURIComponent(entryId)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(changes) });

export const deletePlanEntry = (id: string, entryId: string) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' });

export const addGroceryItem = (id: string, item: { item: string; qty?: number | null; unit?: string }) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/grocery`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(item) });

export const updateGroceryItem = (
  id: string,
  itemId: string,
  changes: { checked?: boolean; item?: string; qty?: number | null; unit?: string },
) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/grocery/${encodeURIComponent(itemId)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(changes) });

export const deleteGroceryItem = (id: string, itemId: string) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/grocery/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

export const regenerateGrocery = (id: string) =>
  apiFetch(`/plans/${encodeURIComponent(id)}/grocery/regenerate`, { method: 'POST' });

// Minimal user directory for the member picker (any authenticated user).
export const listUsersBasic = () => apiFetch('/auth/users/basic');

// ----- Auth ------------------------------------------------------------------

export const authMe = () => apiFetch('/auth/me');

export const authLogout = () =>
  apiFetch('/auth/logout', { method: 'POST' });

// One-click sign-in for the public demo deployment. The backend only honours
// this when HESTIA_DEMO_MODE is set (404 otherwise).
export const authDemoLogin = () =>
  apiFetch('/auth/demo-login', { method: 'POST' });

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

// API tokens (read-only agent access)
export const apiTokensList = () => apiFetch('/auth/api-tokens');

export const apiTokenCreate = (name: string) =>
  apiFetch('/auth/api-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

export const apiTokenRevoke = (id: string) =>
  apiFetch(`/auth/api-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });

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

// Admin — audit / activity
export const adminUserActivity = () => apiFetch('/admin/activity');

export const adminAuthEvents = (params?: { limit?: number; event_type?: string; user_id?: string }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.user_id) qs.set('user_id', params.user_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch(`/admin/auth-events${suffix}`);
};

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
