'use client'

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'
import {
  passkeyLoginBegin,
  passkeyLoginComplete,
  passkeyRegisterBegin,
  passkeyRegisterComplete,
} from '@/lib/api'
import type { User } from '@hestia/shared/types'

export const passkeysSupported = () =>
  typeof window !== 'undefined' && browserSupportsWebAuthn()

/** Run the full register ceremony. Call only when already signed in. */
export async function enrollPasskey(): Promise<void> {
  const options = await passkeyRegisterBegin()
  const attestation = await startRegistration({ optionsJSON: options })
  await passkeyRegisterComplete(attestation)
}

/** Run the full login ceremony. Returns the signed-in user. */
export async function signInWithPasskey(): Promise<User> {
  const options = await passkeyLoginBegin()
  const assertion = await startAuthentication({ optionsJSON: options })
  return passkeyLoginComplete(assertion)
}
