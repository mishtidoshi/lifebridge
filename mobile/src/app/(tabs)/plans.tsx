// My plans: every topic with a saved plan (and how far along it is), plus the topics not started yet.

import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/Photo';
import { TopicCard } from '@/components/TopicCard';
import { Body, H1, H2, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useFlow } from '@/lib/flow';
import { colors, font, fonts, radius, shadow, space, themed } from '@/lib/theme';
import { TOPICS } from '@/lib/topics';
import type { PackSummary } from '@/lib/types';

export default function MyPlans() {
  const flow = useFlow();
  const [summaries, setSummaries] = useState<Record<string, PackSummary>>({});

  useEffect(() => {
    api.packs().then((list) => setSummaries(Object.fromEntries(list.map((p) => [p.id, p]))), () => {});
  }, []);

  const saved = TOPICS.filter((t) => flow.progress[t.id]?.facts);
  const notStarted = TOPICS.filter((t) => !flow.progress[t.id]?.facts);

  const open = (packId: string) => {
    const facts = flow.progress[packId]?.facts;
    if (facts) {
      flow.setFacts(packId, facts);
      router.push(`/${packId}/plan`);
    }
  };

  return (
    <Screen noHeader>
      <H1>My plans</H1>
      {saved.length === 0 ? (
        <Body muted>You haven't started a plan yet. Pick a topic below, or describe what's happening on the Home tab.</Body>
      ) : (
        <View style={styles.list}>
          {saved.map((t) => {
            const progress = flow.progress[t.id];
            const done = Object.values(progress?.tracker ?? {}).filter((s) => s === 'done').length;
            const title = summaries[t.id]?.title ?? t.short;
            return (
              <Pressable
                key={t.id}
                onPress={() => open(t.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open my plan: ${title}. ${done} steps done.`}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <Photo source={t.image} ratio={1} style={styles.photo} />
                <View style={styles.text}>
                  <View style={styles.titleRow}>
                    <t.icon size={18} color={colors.primary} strokeWidth={2.25} />
                    <Text style={styles.title}>{title}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {done === 0 ? 'Not started yet' : `${done} step${done === 1 ? '' : 's'} done`}
                  </Text>
                </View>
                <ChevronRight size={22} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      )}

      {notStarted.length > 0 && (
        <>
          <H2 big>{saved.length ? 'Start another plan' : 'Topics'}</H2>
          <View style={styles.list}>
            {notStarted.map((t) => (
              <TopicCard
                key={t.id}
                topic={t}
                title={summaries[t.id]?.title ?? t.short}
                summary={summaries[t.id]?.summary ?? ''}
                hasPlan={false}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { gap: space.md },
  card: {
    ...shadow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: space.sm,
    paddingRight: space.md,
  },
  pressed: { opacity: 0.85 },
  photo: { width: 72, borderRadius: radius.md },
  text: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontFamily: fonts.heading, fontSize: font.large, color: colors.text },
  meta: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.muted },
}));
