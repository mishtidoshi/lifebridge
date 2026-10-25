import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { AuthProvider } from '@/lib/auth';
import { FlowProvider } from '@/lib/flow';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { colors, currentScheme, fonts, setScheme, type Scheme } from '@/lib/theme';

// Web-only setup when the app opens in a browser:
//  - The tab icon (and "Add to Home Screen"): a new file name (public/lifebridge-icon-192.png) makes browsers
//    load it instead of a saved copy of an older icon.
//  - Phones: `viewport-fit=cover` lets the page know the iPhone's safe areas (the home bar), so the bottom
//    tab bar leaves room for them, and `100dvh` sizes the app to the visible screen, not the area behind
//    Safari's toolbar. Without these, the bottom tab bar gets cut off on iPhones.
const WEB_ICON = '/lifebridge-icon-192.png';

function useWebSetup() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && !viewport.getAttribute('content')?.includes('viewport-fit')) {
      viewport.setAttribute('content', `${viewport.getAttribute('content')}, viewport-fit=cover`);
    }
    if (!document.getElementById('lifebridge-fit')) {
      const style = document.createElement('style');
      style.id = 'lifebridge-fit';
      style.textContent = 'html, body, #root { height: 100%; height: 100dvh; }';
      document.head.appendChild(style);
    }
    for (const rel of ['icon', 'apple-touch-icon']) {
      document.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove());
      const link = document.createElement('link');
      link.rel = rel;
      link.type = 'image/png';
      link.href = WEB_ICON;
      document.head.appendChild(link);
    }
  }, []);
}

export default function RootLayout() {
  useWebSetup();
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Caveat_700Bold,
  });

  
  if (!fontsLoaded && !fontError) return null;

  return (
    <SettingsProvider>
      <AuthProvider>
        <FlowProvider>
          <ThemedScreens />
        </FlowProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

/**
 * The screens, in the chosen light or dark theme. Changing the theme redraws the screens (key={scheme})
 * so every color updates; answers, plans, and sign-in live in the providers above, so nothing is lost.
 */
function ThemedScreens() {
  const settings = useSettings();
  const phone = useColorScheme();
  const scheme: Scheme =
    settings.appearance === 'system' ? (phone === 'dark' ? 'dark' : 'light') : settings.appearance;
  if (currentScheme() !== scheme) setScheme(scheme);
  if (!settings.loaded) return null; 

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        key={scheme}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontFamily: fonts.heading },
          headerShadowVisible: false,
          headerLeft: () => <BackButton />,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="[packId]/index" options={{ title: 'Topic' }} />
        <Stack.Screen name="[packId]/questions" options={{ title: 'Questions' }} />
        <Stack.Screen name="[packId]/confirm" options={{ title: 'Check your answers' }} />
        <Stack.Screen name="[packId]/plan" options={{ title: 'Your plan' }} />
        <Stack.Screen name="[packId]/step/[stepId]" options={{ title: 'Step' }} />
        <Stack.Screen name="legal" options={{ title: 'Terms & Privacy' }} />
      </Stack>
    </>
  );
}
