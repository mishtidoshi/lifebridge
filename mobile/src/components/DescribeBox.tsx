// "What's happening?": the user describes their situation in their own words.
// On the home screen (no packId) the server works out the topic; if it can't tell,
// the box asks which topic it's about instead of guessing. On a topic's page, the
// text is read for that topic only.

import { router } from 'expo-router';
import { ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Body, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useFlow } from '@/lib/flow';
import { useSettings } from '@/lib/settings';
import { colors, font, fonts, radius, space, themed } from '@/lib/theme';
import { TOPICS } from '@/lib/topics';

const MAX_CHARS = 2000; // same limit as engine/understand.py

export function DescribeBox({
  packId,
  examples,
  placeholder,
}: {
  packId?: string;
  examples: string[];
  placeholder: string;
}) {
  const flow = useFlow();
  const { smartReading } = useSettings();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askTopic, setAskTopic] = useState(false);

  const analyze = async (chosen?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.understand(text, chosen ?? packId);
      if (!result.pack_id) {
        setAskTopic(true);
        return;
      }
      setAskTopic(false);
      const pack = await flow.loadPack(result.pack_id);
      const facts = flow.withShared(pack, result.facts); // the state from another topic, so it isn't asked twice
      flow.setFacts(result.pack_id, facts, result.evidence, { text, routing: result.routing, guessed: result.guessed });
      router.push(`/${result.pack_id}/confirm`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (value: string) => {
    setText(value);
    setAskTopic(false);
  };

  // Smart reading off (Settings): nothing typed is read, so offer the question form instead.
  if (!smartReading) {
    const topics = packId ? TOPICS.filter((t) => t.id === packId) : TOPICS;
    return (
      <Card style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">
          Answer a few questions
        </Text>
        <Body muted>Smart reading is off, so LifeBridge won't read typed text. Your plan comes out the same.</Body>
        {topics.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => router.push(`/${t.id}/questions`)}
            accessibilityRole="button"
            accessibilityLabel={`Answer questions: ${t.short}`}
            style={({ pressed }) => [styles.pickRow, styles.offRow, pressed && styles.pressed]}
          >
            <t.icon size={20} color={colors.primary} strokeWidth={2.25} />
            <Text style={styles.pickText}>{packId ? 'Start the questions' : t.short}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="link" style={styles.altRow}>
          <Text style={styles.altText}>Turn Smart reading on in Settings</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        What's happening?
      </Text>
      <Body muted>Write it like you'd tell a friend: your state, what happened, any letters you got. Whatever you know.</Body>
      <TextInput
        value={text}
        onChangeText={edit}
        multiline
        maxLength={MAX_CHARS}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel="What's happening? Describe your situation"
        style={styles.textbox}
        textAlignVertical="top"
      />

      {examples.length > 0 && (
        <View style={styles.examples}>
          <Text style={styles.examplesLabel}>Or try an example:</Text>
          {examples.map((ex) => (
            <Pressable
              key={ex}
              onPress={() => edit(ex)}
              accessibilityRole="button"
              accessibilityLabel={`Use example: ${ex}`}
              style={({ pressed }) => [styles.exampleChip, pressed && styles.pressed]}
            >
              <Text style={styles.exampleText} numberOfLines={2}>
                {ex}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {askTopic && (
        <View style={styles.pickBox} accessibilityLiveRegion="polite">
          <Text style={styles.pickTitle}>Which of these is it about?</Text>
          <Body muted>I couldn't tell from what you wrote. Pick one and I'll read it again.</Body>
          {TOPICS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => analyze(t.id)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`It's about ${t.short}`}
              style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
            >
              <t.icon size={20} color={colors.primary} strokeWidth={2.25} />
              <Text style={styles.pickText}>{t.short}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Banner tone="warn">{error}</Banner>}
      <Button label="Build my plan" onPress={() => analyze()} busy={busy} disabled={text.trim().length === 0} />
      {packId && (
        <Pressable
          onPress={() => router.push(`/${packId}/questions`)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.altRow, pressed && styles.pressed]}
        >
          <ListChecks size={18} color={colors.primary} />
          <Text style={styles.altText}>Answer questions instead</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { borderColor: colors.primary, borderWidth: 2, gap: space.md },
  title: { fontFamily: fonts.heading, fontSize: font.title, color: colors.text },
  textbox: {
    minHeight: 130,
    fontFamily: fonts.regular,
    fontSize: font.body,
    lineHeight: 22,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.bg,
  },
  examples: { gap: space.sm },
  examplesLabel: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.muted },
  exampleChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  exampleText: { fontFamily: fonts.medium, fontSize: font.small, color: colors.primary, lineHeight: 20 },
  pickBox: { gap: space.sm, backgroundColor: colors.maySoft, borderRadius: radius.md, padding: space.md },
  pickTitle: { fontFamily: fonts.heading, fontSize: font.large, color: colors.text },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  offRow: { borderWidth: 1.5, borderColor: colors.primary },
  pickText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text },
  altRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 44 },
  altText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.primary, textDecorationLine: 'underline' },
  pressed: { opacity: 0.75 },
}));
