// A big, labeled back button for the header: easier to see and tap than an arrow alone.
// If there's nothing to go back to (the page was opened from a link or reloaded), it goes home.

import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius, space, themed } from '@/lib/theme';

export function BackButton() {
  const canGoBack = router.canGoBack();
  const label = canGoBack ? 'Back' : 'Home';
  return (
    <Pressable
      onPress={() => (canGoBack ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel={canGoBack ? 'Go back' : 'Go to the home screen'}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <ChevronLeft size={22} color={colors.primary} strokeWidth={2.5} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingLeft: space.sm,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    marginRight: space.sm,
  },
  pressed: { opacity: 0.7 },
  label: { fontFamily: fonts.semibold, fontSize: 17, color: colors.primary },
}));
