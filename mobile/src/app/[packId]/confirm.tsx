// "Here's what I understood": every fact as an editable chip. The plan is built only after the user confirms.
// If the topic was picked from the user's words, the screen says why and lets them choose another topic.

import { router, useLocalSearchParams } from 'expo-router';
import { ChevronUp, Compass, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FactInput } from '@/components/FactInput';
import { Banner, Body, Button, Card, H1, H2, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useFlow, withoutBlanks } from '@/lib/flow';
import { colors, font, radius, space, TAP, fonts, themed } from '@/lib/theme';
import { TOPICS, topicFor } from '@/lib/topics';
import { NOT_SURE, type Fact, type FactValue, type Facts, type PackDetail, type WaveQuestion } from '@/lib/types';

function answerLabel(fact: Fact, value: FactValue): string {
  if (value === NOT_SURE && fact.type !== 'enum') return 'Not sure';
  if (fact.type === 'bool') return value ? 'Yes' : 'No';
  const label = (v: string) => fact.options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.length ? value.map(label).join(', ') : 'None of these';
  return fact.type === 'enum' ? label(value as string) : String(value);
}

export default function Confirm() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const flow = useFlow();
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [facts, setFacts] = useState<Facts>(flow.facts[packId] ?? {});
  const [editing, setEditing] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set()); // facts the user edited here
  const evidence = flow.evidence[packId] ?? {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const described = flow.described[packId];
  const guessed = described?.guessed ?? {};
  const [choosingTopic, setChoosingTopic] = useState(false);
  const [needed, setNeeded] = useState<WaveQuestion[]>([]);

  // Ask the engine which unanswered questions still matter, a moment after each change.
  useEffect(() => {
    if (!pack) return;
    const timer = setTimeout(() => {
      api.questions(packId, withoutBlanks(facts)).then((w) => setNeeded(w.questions), () => setNeeded([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [pack, packId, facts]);

  useEffect(() => {
    flow.loadPack(packId).then(
      (p) => {
        setPack(p);
        setFacts((f) => flow.withShared(p, f)); // ask once: reuse the state from another topic
      },
      (e: Error) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  if (!pack) return <Screen>{error ? <Banner tone="warn">{error}</Banner> : <Loading />}</Screen>;

  const set = (id: string, value: FactValue | undefined) => {
    setChanged((c) => new Set(c).add(id));
    setFacts((f) => {
      const next = { ...f };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const answered = pack.facts.filter((f) => facts[f.id] !== undefined);
  // Only the next few unanswered questions whose answer would change the plan (engine/questions.py).
  const neededFacts = needed.map((q) => pack.facts.find((f) => f.id === q.fact_id)).filter((f): f is Fact => !!f);
  const requiredMissing = pack.facts.filter((f) => f.required && facts[f.id] === undefined);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      await flow.buildPlan(packId, withoutBlanks(facts));
      router.replace(`/${packId}/plan`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Read the same words again for the topic the user picked.
  const switchTopic = async (newId: string) => {
    if (!described) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.understand(described.text, newId);
      flow.setFacts(newId, result.facts, result.evidence, { text: described.text, routing: result.routing, guessed: result.guessed });
      router.replace(`/${newId}/confirm`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // "Same as your answer for College financial aid": a shared question filled from another topic.
  const sharedNote = (fact: Fact, value: FactValue) => {
    if (!fact.shared) return null;
    const found = flow.sharedAnswer(fact.id, packId);
    if (!found || found.value !== value) return null;
    return <Text style={styles.evidence}>Same as your answer for {topicFor(found.packId)?.short ?? 'another topic'}. Tap to change.</Text>;
  };

  const renderFact = (fact: Fact) => {
    const value = facts[fact.id];
    const open = editing === fact.id;
    return (
      <View key={fact.id} style={styles.factRow}>
        <Pressable
          onPress={() => setEditing(open ? null : fact.id)}
          accessibilityRole="button"
          accessibilityLabel={`${fact.question} ${value !== undefined ? answerLabel(fact, value) : 'Not answered'}. Tap to change.`}
          style={({ pressed }) => [styles.chip, value === undefined && styles.chipEmpty, pressed && styles.pressed]}
        >
          <View style={styles.chipText}>
            <Text style={styles.chipQuestion}>{fact.question}</Text>
            <Text style={[styles.chipAnswer, value === undefined && styles.chipAnswerEmpty]}>
              {value !== undefined ? answerLabel(fact, value) : 'Not answered'}
            </Text>
            {value !== undefined && evidence[fact.id] && !changed.has(fact.id) && (
              <Text style={[styles.evidence, guessed[fact.id] !== undefined && styles.guess]}>
                {guessed[fact.id] !== undefined
                  ? `LifeBridge's model guessed this (${Math.min(99, Math.round(guessed[fact.id] * 100))}% sure) from ${evidence[fact.id].map((w) => `"${w}"`).join(', ')}. Please check it.`
                  : `From your words: ${(fact.type === 'multi' ? evidence[fact.id] : evidence[fact.id].slice(0, 1)).map((w) => `"${w}"`).join(', ')}`}
              </Text>
            )}
            {value !== undefined && !evidence[fact.id] && !changed.has(fact.id) && sharedNote(fact, value)}
          </View>
          {open ? (
            <ChevronUp size={20} color={colors.primary} />
          ) : (
            <Pencil size={18} color={value === undefined ? colors.muted : colors.primary} />
          )}
        </Pressable>
        {open && (
          <Card>
            <FactInput fact={fact} value={value} onChange={(v) => set(fact.id, v)} />
            <Button label="Done" kind="quiet" onPress={() => setEditing(null)} />
          </Card>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <H1>Here's what I understood</H1>
      <Body muted>Tap anything that's wrong to fix it. Your plan is built from these answers only.</Body>

      {described && (
        <View style={styles.topicBox}>
          <View style={styles.topicRow}>
            <Compass size={20} color={colors.primary} strokeWidth={2.25} />
            <Text style={styles.topicText}>
              Topic: <Text style={styles.topicName}>{pack.title}</Text>
            </Text>
          </View>
          {described.routing.method !== 'chosen' && described.routing.top_words.length > 0 && (
            <Text style={styles.evidence}>
              Picked because you mentioned {described.routing.top_words.map((w) => `"${w}"`).join(', ')}.
            </Text>
          )}
          {!choosingTopic ? (
            <Button label="Wrong topic? Choose another" kind="quiet" onPress={() => setChoosingTopic(true)} />
          ) : (
            TOPICS.filter((t) => t.id !== packId).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => switchTopic(t.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${t.short}`}
                style={({ pressed }) => [styles.topicChoice, pressed && styles.pressed]}
              >
                <t.icon size={20} color={colors.primary} strokeWidth={2.25} />
                <Text style={styles.topicText}>{t.short}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {answered.length > 0 ? answered.map(renderFact) : <Banner tone="may">I didn't pick up any details yet.</Banner>}

      {neededFacts.length > 0 && (
        <>
          <H2>{neededFacts.some((f) => f.required) ? 'Please answer these too' : 'A few questions that would change your plan'}</H2>
          <Body muted>Only questions whose answer matters for you, most important first. Skip any you're not sure about.</Body>
          {neededFacts.map(renderFact)}
        </>
      )}

      {error && <Banner tone="warn">{error}</Banner>}
      {requiredMissing.length > 0 && (
        <Banner tone="may">
          Please answer &ldquo;{requiredMissing[0].question}&rdquo; first. Your plan depends on it.
        </Banner>
      )}
      <Button label="Looks right. Build my plan" onPress={build} busy={busy} disabled={requiredMissing.length > 0} />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  factRow: { gap: space.sm },
  topicBox: { gap: space.xs, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: space.md, backgroundColor: colors.surface },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topicText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: font.body, color: colors.text },
  topicName: { fontFamily: fonts.bold, color: colors.primary },
  topicChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TAP,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  chip: {
    minHeight: TAP,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  chipEmpty: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  pressed: { opacity: 0.8 },
  chipQuestion: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted },
  chipAnswer: { fontFamily: fonts.bold, fontSize: font.body, color: colors.primary },
  chipAnswerEmpty: { fontFamily: fonts.medium, color: colors.muted },
  chipText: { flex: 1, gap: 2 },
  evidence: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, fontStyle: 'italic' },
  guess: { color: colors.mayText, fontStyle: 'normal' },
}));
