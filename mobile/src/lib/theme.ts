import { StyleSheet } from 'react-native';

// Blue-teal and orange-yellow: calm and trustworthy, with a warm accent, and clearly not a government site.
// Each status color has one meaning: orange-yellow = "check this", green = done, red = urgent deadline.
// Every text color here has at least 4.5:1 contrast on its background (WCAG AA), in both themes.
export type Palette = typeof LIGHT;
export type Scheme = 'light' | 'dark';

const LIGHT = {
  bg: '#F5F8FA',
  surface: '#FFFFFF',
  text: '#1C2B36',
  muted: '#55636E',
  border: '#DDE6EB',
  primary: '#1B6E8C', // blue-teal
  primaryText: '#FFFFFF',
  primarySoft: '#E3F1F6',
  neutralSoft: '#ECF1F4', // tab track, neutral pills
  maySoft: '#FFF0D1', // orange-yellow
  mayBorder: '#F7C46C',
  mayText: '#8A4A00',
  goodSoft: '#DCFCE7',
  goodText: '#166534',
  warnSoft: '#FEE2E2',
  warnText: '#B91C1C',
};

const DARK: Palette = {
  bg: '#0E171C',
  surface: '#16232A',
  text: '#E6EEF2',
  muted: '#A3B3BC',
  border: '#2B3B44',
  primary: '#6CC1DC', // lighter blue-teal, so it reads on dark
  primaryText: '#06222C', // dark text on light-teal buttons
  primarySoft: '#173C4A',
  neutralSoft: '#1F2E36',
  maySoft: '#3B2C12',
  mayBorder: '#8C6A24',
  mayText: '#F6CF8A',
  goodSoft: '#123423',
  goodText: '#86D9A8',
  warnSoft: '#3D1C1C',
  warnText: '#FFA39B',
};

/**
 * The current colors. Screens read `colors.primary` etc.; setScheme() swaps the values in place,
 * and the app redraws (src/app/_layout.tsx), so every screen picks up the new theme.
 */
export const colors: Palette = { ...LIGHT };
let current: Scheme = 'light';

export function setScheme(scheme: Scheme) {
  current = scheme;
  Object.assign(colors, scheme === 'dark' ? DARK : LIGHT);
}

export function currentScheme(): Scheme {
  return current;
}

/**
 * Styles that follow the theme. Use like StyleSheet.create, but pass a function:
 *     const styles = themed(() => StyleSheet.create({ card: { backgroundColor: colors.surface } }));
 * The styles are built once per theme, the first time they're used.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(build: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get(_target, key) {
      cache[current] ??= build();
      return (cache[current] as Record<string | symbol, unknown>)[key];
    },
  });
}

// Custom fonts need one family name per weight (fontWeight alone doesn't switch files on Android).
// Loaded in src/app/_layout.tsx.
//   Fraunces: soft, friendly serif for headings
//   Nunito:   rounded, easy-to-read sans for everything else
//   Caveat:   handwritten, for short decorative notes only (never for important text)
export const fonts = {
  regular: 'Nunito_400Regular',
  medium: 'Nunito_600SemiBold',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  heading: 'Fraunces_600SemiBold',
  headingHeavy: 'Fraunces_700Bold',
  hand: 'Caveat_700Bold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = { small: 14, body: 16, large: 18, title: 22, hero: 28 };
export const TAP = 44; // minimum tap target (pt)
export const MAX_WIDTH = 720; // keeps lines readable on Mac/PC

// Soft card shadow (iOS/web use shadow*, Android uses elevation).
export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};
