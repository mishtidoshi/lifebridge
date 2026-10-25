// Settings for this device (not synced to an account):
//   smartReading       read "What's happening?" with LifeBridge's own reader and topic model. Off = the
//                      question form only, so nothing typed is read. The plan is the same either way,
//                      because rules build it from the confirmed answers.
//   rememberSensitive  save answers to sensitive questions (like immigration status) on this device and
//                      in the account. Off (the default) = they're kept only until the app is closed.
//   appearance         'light' (the default), 'dark', or 'system' (match the phone's setting).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

export interface Settings {
  smartReading: boolean;
  rememberSensitive: boolean;
  appearance: Appearance;
}

export const DEFAULT_SETTINGS: Settings = { smartReading: true, rememberSensitive: false, appearance: 'light' };
const KEY = 'lifebridge:settings';

interface SettingsContextValue extends Settings {
  loaded: boolean;
  update: (change: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      } catch {
        // storage unavailable: use the defaults
      }
      setLoaded(true);
    })();
  }, []);

  const update = useCallback((change: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...change };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...settings, loaded, update }), [settings, loaded, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
