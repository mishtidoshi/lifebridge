// One topic's own page: what it covers, a "What's happening?" box read for this topic only,
// the question form as the other way in, and tips for this topic.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FolderOpen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DescribeBox } from '@/components/DescribeBox';
import { Photo } from '@/components/Photo';
import { TipList } from '@/components/TipList';
import { Banner, Body, Button, H1, H2, Loading, Screen } from '@/components/ui';
import { useFlow } from '@/lib/flow';
import { colors, font, fonts, radius, space, themed } from '@/lib/theme';
import { topicFor } from '@/lib/topics';
import type { PackDetail } from '@/lib/types';

export default function TopicHome() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const topic = topicFor(packId);
  const flow = useFlow();
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (topic) flow.loadPack(topic.id).then(setPack, (e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  if (!topic) {
    return (
      <Screen>
        <H1>Page not found</H1>
        <Body>LifeBridge doesn't have a topic called "{packId}".</Body>
        <Button label="Go to the home screen" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const saved = flow.progress[topic.id]?.facts;
  const resume = () => {
    if (saved) {
      flow.setFacts(topic.id, saved);
      router.push(`/${topic.id}/plan`);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: topic.short }} />
      <Photo source={topic.image} ratio={3 / 2} alt={topic.alt} style={styles.hero} />
      <View style={styles.intro}>
        <View style={styles.kicker}>
          <topic.icon size={18} color={colors.primary} strokeWidth={2.25} />
          <Text style={styles.kickerText}>{topic.short}</Text>
        </View>
        {pack ? (
          <>
            <H1>{pack.title}</H1>
            <Body muted>{pack.summary}</Body>
          </>
        ) : error ? (
          <Banner tone="warn">{error}</Banner>
        ) : (
          <Loading />
        )}
      </View>

      {saved && (
        <Pressable
          onPress={resume}
          accessibilityRole="button"
          style={({ pressed }) => [styles.savedRow, pressed && styles.pressed]}
        >
          <FolderOpen size={20} color={colors.primary} strokeWidth={2.25} />
          <Text style={styles.savedText}>Open my saved plan</Text>
        </Pressable>
      )}

      <DescribeBox packId={topic.id} examples={pack?.example_inputs.slice(0, 3) ?? []} placeholder={topic.placeholder} />

      <H2 big>Good to know</H2>
      <TipList tips={topic.tips} />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  hero: { borderRadius: radius.lg },
  intro: { gap: space.sm },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.primary },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  savedText: { flex: 1, fontFamily: fonts.semibold, fontSize: font.body, color: colors.primary },
  pressed: { opacity: 0.75 },
}));
