import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'hestia_session_token';
const USER_KEY = 'hestia_user_json';
const WORDS_KEY = 'hestia_key_words';

import type { User } from '@hestia/shared/types';

// Module-level cache so the API client's synchronous getAuthToken() can answer
// without awaiting SecureStore on every request.
let cachedToken: string | null = null;

export async function hydrateAuthCache(): Promise<void> {
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
}

export function getCachedToken(): string | null {
  return cachedToken;
}

export async function saveSession(token: string, user: User): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearSession(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(WORDS_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}

export async function saveKeyWords(words: string[]): Promise<void> {
  await SecureStore.setItemAsync(WORDS_KEY, JSON.stringify(words));
}

export async function getKeyWords(): Promise<string[] | null> {
  const raw = await SecureStore.getItemAsync(WORDS_KEY);
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 12) return null;
    return arr.map(String);
  } catch { return null; }
}
