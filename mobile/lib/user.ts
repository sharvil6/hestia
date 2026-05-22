import * as SecureStore from 'expo-secure-store';

const KEY = 'hestia_user_id';

export async function getUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setUserId(id: string): Promise<void> {
  return SecureStore.setItemAsync(KEY, id);
}

export async function clearUserId(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}
