'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authMe } from '@/lib/api'
import type { User } from '@hestia/shared/types'

const KEY_WORDS_STORAGE = 'hestia_key_words'

/**
 * Read the current device's saved 12-word key. Stored client-side so we can
 * render the "show my key" QR / wordlist on demand for cross-device login.
 * Not used by API calls — the session cookie is the auth credential.
 */
export function readSavedKeyWords(): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY_WORDS_STORAGE)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length !== 12) return null
    return arr.map(String)
  } catch {
    return null
  }
}

export function saveKeyWords(words: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY_WORDS_STORAGE, JSON.stringify(words))
}

export function clearSavedKeyWords(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY_WORDS_STORAGE)
}

/**
 * Current user via /auth/me (backed by session cookie). Returns:
 *  - data: User | undefined
 *  - isLoading: true until first response
 *  - error: 401 when not signed in
 */
export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: authMe,
    retry: false,
    staleTime: 30_000,
  })
}

/** Backwards-compat shim for callers that just want the id. */
export function useCurrentUserId(): string | null {
  const { data } = useCurrentUser()
  return data?.id ?? null
}

export function useInvalidateCurrentUser() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['auth', 'me'] })
}
