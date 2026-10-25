// Keeps the unlocked data key on this device after sign-in, so the app doesn't ask for the
// password on every visit. Phones: the system's secure storage (Keychain / Keystore).
// Web: the browser's storage, next to the sign-in session. Removed on sign-out.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { keyFromText, keyToText } from './crypto';

const name = (userId: string) => `lifebridge_key_${userId.replace(/[^a-zA-Z0-9]/g, '')}`;

export async function rememberKey(userId: string, key: Uint8Array): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.setItem(name(userId), keyToText(key));
  else await SecureStore.setItemAsync(name(userId), keyToText(key));
}

export async function recallKey(userId: string): Promise<Uint8Array | null> {
  try {
    const text = Platform.OS === 'web' ? await AsyncStorage.getItem(name(userId)) : await SecureStore.getItemAsync(name(userId));
    return text ? keyFromText(text) : null;
  } catch {
    return null;
  }
}

export async function forgetKey(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') await AsyncStorage.removeItem(name(userId));
    else await SecureStore.deleteItemAsync(name(userId));
  } catch {
    // already gone
  }
}
