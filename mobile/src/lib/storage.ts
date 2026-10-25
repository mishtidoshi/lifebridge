// Progress is saved on this device (AsyncStorage → localStorage on the web), one copy per owner:
// each signed-in account has its own copy, and "guest" is the copy for using LifeBridge without
// an account. So one person's plan never shows up for another, or after their account is deleted.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Facts, TrackerState } from './types';

export interface Progress {
  facts: Facts | null;
  tracker: Record<string, TrackerState>; // step id → state the user picked
  documents: Record<string, boolean>; // document id → gathered
  dates: Record<string, string>; // deadline id → date the user typed (YYYY-MM-DD)
}

export const EMPTY_PROGRESS: Progress = { facts: null, tracker: {}, documents: {}, dates: {} };
export const GUEST = 'guest';

const key = (owner: string, packId: string) => `lifebridge:progress:${owner}:${packId}`;
// Before plans had owners they were saved under this key. Nobody owns those copies, so they're deleted.
const OLD_KEY = (packId: string) => `lifebridge:progress:${packId}`;

export async function loadProgress(owner: string, packId: string): Promise<Progress> {
  try {
    await AsyncStorage.removeItem(OLD_KEY(packId));
    const raw = await AsyncStorage.getItem(key(owner, packId));
    return raw ? { ...EMPTY_PROGRESS, ...JSON.parse(raw) } : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS; // private browsing or cleared storage: start fresh
  }
}

export async function saveProgress(owner: string, packId: string, progress: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(key(owner, packId), JSON.stringify(progress));
  } catch {
    // storage unavailable; progress lasts only this session
  }
}

export async function clearProgress(owner: string, packId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(owner, packId));
  } catch {
    // nothing to clear
  }
}
