'use client'

import { useSyncExternalStore } from 'react'

const COOKIE_NAME = 'hestia_user'

export function setCurrentUserCookie(id: string) {
  document.cookie = `${COOKIE_NAME}=${id}; path=/; max-age=31536000`
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find(r => r.startsWith(`${COOKIE_NAME}=`))
  return match ? match.split('=')[1] : null
}

const subscribe = () => () => {}
const getServerSnapshot = () => null

export function useCurrentUserId(): string | null {
  return useSyncExternalStore(subscribe, readCookie, getServerSnapshot)
}
