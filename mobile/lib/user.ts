/**
 * Back-compat shim. The user id now lives inside the auth session.
 * New code should import from ./auth directly.
 */
import { getStoredUser, clearSession } from './auth';

export async function getUserId(): Promise<string | null> {
  const u = await getStoredUser();
  return u?.id ?? null;
}

/** No-op: kept so older imports don't crash. The id is now derived from the session. */
export async function setUserId(_id: string): Promise<void> {
  // intentional no-op
}

export async function clearUserId(): Promise<void> {
  await clearSession();
}
