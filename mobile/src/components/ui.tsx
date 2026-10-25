import { router } from 'expo-router';
import { CircleAlert, ExternalLink, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, MAX_WIDTH, radius, space, TAP, fonts, shadow, themed } from '@/lib/theme';

/** `noHeader`: the screen hides the navigation bar, so pad for the notch / status bar itself. */
export function Screen({ children, noHeader }: { children: ReactNode; noHeader?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.screenContent,
        { paddingBottom: insets.bottom + space.xl },
        noHeader && { paddingTop: insets.top + space.lg },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        {children}
        <Footer />
      </View>
    </ScrollView>
  );
}

export function Footer() {
  return (
    <View style={styles.footer}>
      {(
        [
          ['Terms & Privacy', '/legal'],
        ] as const
      ).map(([label, href]) => (
        <Pressable
          key={href}
          onPress={() => router.push(href)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.footerItem, pressed && styles.buttonPressed]}
        >
          <Text style={styles.footerLink}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'quiet';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  hint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${kind}`],
        off && styles.buttonOff,
        pressed && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${kind}`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type PillTone = 'neutral' | 'may' | 'good' | 'warn' | 'info';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.h1} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** `big`: a larger section title (used on the home screen). */
export function H2({ children, icon: Icon, big }: { children: ReactNode; icon?: LucideIcon; big?: boolean }) {
  if (!Icon) {
    return (
      <Text style={[styles.h2, big && styles.h2Big]} accessibilityRole="header">
        {children}
      </Text>
    );
  }
  return (
    <View style={styles.h2Row}>
      <View style={styles.h2Icon}>
        <Icon size={20} color={colors.primary} strokeWidth={2.25} />
      </View>
      <Text style={[styles.h2, big && styles.h2Big, styles.h2InRow]} accessibilityRole="header">
        {children}
      </Text>
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'may' }) {
  return (
    <View style={[styles.banner, styles[`banner_${tone}`]]} accessibilityRole="alert">
      <BannerIcon tone={tone} />
      <Text style={[styles.body, styles.bannerBody, styles[`bannerText_${tone}`]]}>{children}</Text>
    </View>
  );
}

function BannerIcon({ tone }: { tone: 'info' | 'warn' | 'may' }) {
  const Icon = { info: Info, warn: TriangleAlert, may: CircleAlert }[tone];
  const color = { info: colors.primary, warn: colors.warnText, may: colors.mayText }[tone];
  return <Icon size={20} color={color} style={styles.bannerIcon} />;
}

export function LinkText({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={`${label} (opens a website)`}
      style={({ pressed }) => [styles.linkRow, pressed && styles.buttonPressed]}
    >
      <Text style={styles.link}>{label}</Text>
      <ExternalLink size={16} color={colors.primary} strokeWidth={2.25} />
    </Pressable>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.body, styles.muted]}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, alignItems: 'center' },
  column: { width: '100%', maxWidth: MAX_WIDTH, gap: space.lg },
  footer: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xl,
  },
  footerItem: { minHeight: TAP, justifyContent: 'center' },
  footerLink: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.muted, textDecorationLine: 'underline' },
  button: {
    minHeight: TAP + 8,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  button_quiet: { backgroundColor: 'transparent', minHeight: TAP },
  buttonOff: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { fontFamily: fonts.semibold, fontSize: font.body, textAlign: 'center' },
  buttonText_primary: { color: colors.primaryText },
  buttonText_secondary: { color: colors.primary },
  buttonText_quiet: { color: colors.primary, textDecorationLine: 'underline' },
  card: {
    ...shadow,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 3 },
  pill_neutral: { backgroundColor: colors.neutralSoft },
  pill_may: { backgroundColor: colors.maySoft },
  pill_good: { backgroundColor: colors.goodSoft },
  pill_warn: { backgroundColor: colors.warnSoft },
  pill_info: { backgroundColor: colors.primarySoft },
  pillText: { fontFamily: fonts.semibold, fontSize: 13 },
  pillText_neutral: { color: colors.muted },
  pillText_may: { color: colors.mayText },
  pillText_good: { color: colors.goodText },
  pillText_warn: { color: colors.warnText },
  pillText_info: { color: colors.primary },
  h1: { fontFamily: fonts.headingHeavy, fontSize: font.hero, color: colors.text, lineHeight: 34 },
  h2: { fontFamily: fonts.heading, fontSize: font.large, color: colors.text, marginTop: space.sm },
  h2Big: { fontSize: 26, lineHeight: 32 },
  h2Row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.sm },
  h2Icon: { marginTop: 3 },
  h2InRow: { marginTop: 0, flexShrink: 1 },
  body: { fontFamily: fonts.regular, fontSize: font.body, color: colors.text, lineHeight: 24 },
  muted: { color: colors.muted },
  banner: { borderRadius: radius.md, padding: space.md, flexDirection: 'row', gap: space.sm },
  bannerIcon: { marginTop: 2 },
  bannerBody: { flex: 1 },
  banner_info: { backgroundColor: colors.primarySoft },
  banner_warn: { backgroundColor: colors.warnSoft },
  banner_may: { backgroundColor: colors.maySoft },
  bannerText_info: { color: colors.primary },
  bannerText_warn: { color: colors.warnText },
  bannerText_may: { color: colors.mayText },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: TAP },
  link: { fontFamily: fonts.semibold, color: colors.primary, fontSize: font.body, paddingVertical: space.xs },
  loading: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
}));
