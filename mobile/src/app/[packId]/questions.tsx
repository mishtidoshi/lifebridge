// The question form, asked in waves: a few questions at a time, most important first, and only
// questions whose answer would change the plan (engine/questions.py decides). When nothing left
// would change the plan, it moves on to "Check your answers". No AI involved.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FactInput } from '@/components/FactInput';
import { Banner, Body, Button, Card, H1, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useFlow, withoutBlanks } from '@/lib/flow';
import { colors, font, fonts, space, themed } from '@/lib/theme';
import type { FactValue, Facts, PackDetail, QuestionWave } from '@/lib/types';

export default function Questions() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const flow = useFlow();
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Facts>(flow.facts[packId] ?? {});
  const [asked, setAsked] = useState<string[]>([]); // shown already (answered or skipped)
  const [wave, setWave] = useState<QuestionWave | null>(null);
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [stillNeeded, setStillNeeded] = useState<Set<string> | null>(null); // this set's questions that still matter

  // After each answer, ask again which questions matter: an answer can make another question in this
  // same set pointless (someone 65 or older isn't asked about work-rule exemptions), so it's hidden.
  useEffect(() => {
    if (!wave) return;
    const timer = setTimeout(() => {
      api.questions(packId, withoutBlanks(facts), asked, 10).then(
        (w) => setStillNeeded(new Set(w.questions.map((q) => q.fact_id))),
        () => setStillNeeded(null),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [packId, facts, asked, wave]);

  const finish = (answers: Facts) => {
    flow.setFacts(packId, answers);
    router.replace(`/${packId}/confirm`);
  };

  const loadWave = async (answers: Facts, shown: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.questions(packId, withoutBlanks(answers), shown);
      if (next.done) finish(answers);
      else {
        setStillNeeded(null);
        setWave(next);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    flow.loadPack(packId).then(
      (p) => {
        setPack(p);
        const start = flow.withShared(p, facts); // ask once: reuse the state from another topic
        setFacts(start);
        loadWave(start, []);
      },
      (e: Error) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  const set = (id: string, value: FactValue | undefined) =>
    setFacts((f) => {
      const next = { ...f };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });

  if (!pack || !wave) {
    return <Screen>{error ? <Banner tone="warn">{error}</Banner> : <Loading label="Finding the questions that matter…" />}</Screen>;
  }

  const byId = Object.fromEntries(pack.facts.map((f) => [f.id, f]));
  const showing = wave.questions.filter(
    (q) => facts[q.fact_id] !== undefined || !stillNeeded || stillNeeded.has(q.fact_id),
  );
  const requiredLeft = showing.filter((q) => q.required && facts[q.fact_id] === undefined);

  const next = () => {
    const shown = [...asked, ...wave.questions.map((q) => q.fact_id)]; // skipped ones aren't asked again
    setAsked(shown);
    setRound((r) => r + 1);
    loadWave(facts, shown);
  };

  return (
    <Screen>
      <H1>{round === 1 ? 'A few questions' : 'Supplemental questions'}</H1>
      <Body muted>
        LifeBridge only asks what would change your plan, most important first. Skip any you're not sure about: steps that
        depend on them will say "May apply."
      </Body>

      {showing.map((q) => {
        const fact = byId[q.fact_id];
        if (!fact) return null;
        return (
          <Card key={q.fact_id}>
            <View style={styles.tagRow}>
              {q.required && <Text style={styles.required}>Required</Text>}
              <Text style={styles.reason}>{q.reason}</Text>
            </View>
            <FactInput fact={fact} value={facts[fact.id]} onChange={(v) => set(fact.id, v)} />
          </Card>
        );
      })}

      {error && <Banner tone="warn">{error}</Banner>}
      {requiredLeft.length > 0 && <Banner tone="may">Please answer the required question first. Your plan depends on it.</Banner>}
      <Button
        label={wave.remaining > 0 ? 'Next' : 'Done'}
        onPress={next}
        busy={busy}
        disabled={requiredLeft.length > 0}
        hint="Gets the next questions, if any are still needed"
      />
      <Text style={styles.progress}>
        {wave.remaining > 0
          ? `Up to ${wave.remaining} more question${wave.remaining === 1 ? '' : 's'} may follow, only if your answers make them matter.`
          : 'This is the last set.'}
      </Text>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  tagRow: { gap: 2 },
  required: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.primary, textTransform: 'uppercase' },
  reason: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted },
  progress: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, textAlign: 'center', marginTop: -space.xs },
}));
