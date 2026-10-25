// One step: why it applies, the tracker, documents, deadlines, explanation, and the official source.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  CalendarClock,
  ClipboardList,
  Clock,
  FileText,
  Lightbulb,
  Square,
  SquareCheck,
  TrendingUp,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StepGrid } from '@/components/StepGrid';
import { HowMade, ReportProblem, StillStuck } from '@/components/StepTrust';
import { Banner, Body, Button, Card, H1, H2, LinkText, Loading, Pill, Screen } from '@/components/ui';
import { daysAway, formatDate } from '@/lib/dates';
import { useFlow, useProgress } from '@/lib/flow';
import { colors, font, radius, space, TAP, fonts, themed } from '@/lib/theme';
import { stepState } from '@/lib/tracker';
import { TRACKER_LABELS, TRACKER_STATES } from '@/lib/types';

export default function StepScreen() {
  const { packId, stepId } = useLocalSearchParams<{ packId: string; stepId: string }>();
  const flow = useFlow();
  const plan = flow.plans[packId];
  const { progress, update } = useProgress(packId);

  // Opened directly (e.g. after a reload): the plan screen knows how to rebuild it.
  useEffect(() => {
    if (!plan) router.replace(`/${packId}/plan`);
  }, [plan, packId]);

  const step = plan?.steps.find((s) => s.id === stepId);
  if (!plan || !step) return <Screen><Loading /></Screen>;

  const state = stepState(step, progress);
  const index = plan.steps.indexOf(step);
  const docs = plan.documents.filter((d) => step.documents.includes(d.id));
  const deadlines = plan.deadlines.filter((d) => step.deadlines.includes(d.id));
  const titles = Object.fromEntries(plan.steps.map((s) => [s.id, s.title]));
  const prev = plan.steps[index - 1];
  const next = plan.steps[index + 1];
  // replace, not push: "Back" should return to the plan, not through every step you looked at
  const goTo = (id: string) => router.replace(`/${packId}/step/${id}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: `Step ${index + 1} of ${plan.steps.length}` }} />
      <H1>{step.title}</H1>
      {step.estimated_time && (
        <View style={styles.timeRow}>
          <Clock size={16} color={colors.muted} />
          <Body muted>About {step.estimated_time}</Body>
        </View>
      )}

      <Card>
        <H2 icon={LayoutGrid}>All steps</H2>
        <StepGrid steps={plan.steps} currentId={step.id} progress={progress} onSelect={goTo} />
      </Card>

      {step.match === 'unknown' && (
        <Banner tone="may">
          May apply: check this. It depends on something that isn't settled yet, like a question you skipped or
          answered "Not sure." A counselor or the official source can help you find out.
        </Banner>
      )}

      <Card>
        <H2 icon={Lightbulb}>Why this applies to you</H2>
        {step.why.length > 0 ? (
          step.why.map((w) => (
            <Text key={w} style={styles.bullet}>
              • {w}
            </Text>
          ))
        ) : (
          <Body muted>It might, depending on your answers to the quick questions.</Body>
        )}
        {step.depends_on.length > 0 && (
          <Text style={styles.meta}>Do first: {step.depends_on.map((d) => titles[d]).join(' · ')}</Text>
        )}
      </Card>

      <Card>
        <H2 icon={TrendingUp}>Your progress</H2>
        <View style={styles.states} accessibilityRole="radiogroup">
          {TRACKER_STATES.map((s) => (
            <Pressable
              key={s}
              onPress={() => update((p) => ({ ...p, tracker: { ...p.tracker, [step.id]: s } }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: state === s }}
              style={[styles.state, state === s && styles.stateOn]}
            >
              <Text style={[styles.stateText, state === s && styles.stateTextOn]}>{TRACKER_LABELS[s]}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <H2 icon={ClipboardList}>What to do</H2>
        <Body>{step.plain_explanation}</Body>
        {step.where && (
          <>
            <Text style={styles.label}>Where</Text>
            {step.where.url ? <LinkText label={step.where.label} url={step.where.url} /> : <Body>{step.where.label}</Body>}
          </>
        )}
      </Card>

      {docs.length > 0 && (
        <Card>
          <H2 icon={FileText}>Documents</H2>
          {docs.map((d) => (
            <View key={d.id} style={styles.docLine}>
              <View style={styles.docRow}>
                {progress.documents[d.id] ? (
                  <SquareCheck size={20} color={colors.goodText} />
                ) : (
                  <Square size={20} color={colors.muted} />
                )}
                <Text style={[styles.bullet, styles.docName]}>{d.name}</Text>
              </View>
              {d.may_apply && <Pill label="May apply" tone="may" />}
            </View>
          ))}
        </Card>
      )}

      {deadlines.length > 0 && (
        <Card>
          <H2 icon={CalendarClock}>Deadlines</H2>
          {deadlines.map((dl) => {
            const date = dl.date ?? progress.dates[dl.id];
            return (
              <View key={dl.id} style={styles.deadline}>
                <Text style={styles.deadlineLabel}>{dl.label}</Text>
                <Text style={styles.meta}>
                  {date
                    ? `${formatDate(date)} · ${daysAway(date, plan.today)}`
                    : dl.asap
                      ? 'As soon as possible: money is given out while it lasts'
                      : 'Varies: add your date on the Deadlines tab'}
                </Text>
                {dl.status === 'passed' && !!dl.if_missed && <Banner tone="may">If you missed it: {dl.if_missed}</Banner>}
              </View>
            );
          })}
        </Card>
      )}

      <HowMade step={step} />
      <StillStuck help={plan.help} />
      <ReportProblem packId={packId} stepId={step.id} />
      <View style={styles.stepNav}>
        {prev && (
          <Pressable
            onPress={() => goTo(prev.id)}
            accessibilityRole="button"
            accessibilityLabel={`Previous step: ${prev.title}`}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          >
            <ArrowLeft size={20} color={colors.primary} strokeWidth={2.5} />
            <View style={styles.navText}>
              <Text style={styles.navLabel}>Previous</Text>
              <Text style={styles.navTitle} numberOfLines={2}>{prev.title}</Text>
            </View>
          </Pressable>
        )}
        {next && (
          <Pressable
            onPress={() => goTo(next.id)}
            accessibilityRole="button"
            accessibilityLabel={`Next step: ${next.title}`}
            style={({ pressed }) => [styles.navButton, styles.navNext, pressed && styles.pressed]}
          >
            <View style={[styles.navText, styles.navTextNext]}>
              <Text style={[styles.navLabel, styles.navLabelNext]}>Next step</Text>
              <Text style={[styles.navTitle, styles.navTitleNext]} numberOfLines={2}>{next.title}</Text>
            </View>
            <ArrowRight size={20} color={colors.primaryText} strokeWidth={2.5} />
          </Pressable>
        )}
      </View>
      <Button label="Back to my plan" kind="secondary" onPress={() => router.replace(`/${packId}/plan`)} />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  stepNav: { flexDirection: 'row', gap: space.sm },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  navNext: { backgroundColor: colors.primary },
  pressed: { opacity: 0.8 },
  navText: { flex: 1, gap: 2 },
  navTextNext: { alignItems: 'flex-end' },
  navLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  navLabelNext: { color: colors.primaryText },
  navTitle: { fontFamily: fonts.medium, fontSize: font.small, color: colors.text, lineHeight: 18 },
  navTitleNext: { color: colors.primaryText, textAlign: 'right' },
  bullet: { fontFamily: fonts.regular, fontSize: font.body, color: colors.text, lineHeight: 24 },
  meta: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  label: { fontFamily: fonts.bold, fontSize: font.small, color: colors.muted, textTransform: 'uppercase', marginTop: space.sm },
  states: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  state: {
    minHeight: TAP,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stateOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stateText: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.text },
  stateTextOn: { color: colors.primaryText },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  docName: { flex: 1 },
  docLine: { gap: space.xs },
  deadline: { gap: 2, paddingVertical: space.xs },
  deadlineLabel: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text },
  quote: {
    fontFamily: fonts.regular,
    fontSize: font.body,
    lineHeight: 24,
    color: colors.text,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: space.md,
    fontStyle: 'italic',
  },
}));
