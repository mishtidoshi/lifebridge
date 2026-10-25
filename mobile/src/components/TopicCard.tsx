// One topic on the home screen: a photo, the topic's name and summary. Opens the topic's page.

import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/Photo';
import { colors, font, fonts, radius, shadow, space, themed } from '@/lib/theme';
import type { Topic } from '@/lib/topics';

export function TopicCard({ topic, title, summary, hasPlan }: { topic: Topic; title: string; summary: string; hasPlan: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(`/${topic.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${summary}${hasPlan ? ' You have a saved plan.' : ''}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Photo source={topic.image} ratio={1} style={styles.photo} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <topic.icon size={18} color={colors.primary} strokeWidth={2.25} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.summary} numberOfLines={3}>
          {summary}
        </Text>
        {hasPlan && <Text style={styles.saved}>You have a saved plan</Text>}
      </View>
      <ChevronRight size={22} color={colors.muted} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    ...shadow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.sm,
    paddingRight: space.md,
  },
  pressed: { opacity: 0.85 },
  photo: { width: 96, borderRadius: radius.md },
  text: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontFamily: fonts.heading, fontSize: font.large, color: colors.text },
  summary: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  saved: { fontFamily: fonts.semibold, fontSize: 13, color: colors.goodText },
}));
