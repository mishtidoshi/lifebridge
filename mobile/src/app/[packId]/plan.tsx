// The plan: notices, "Do this next," ordered steps, one document checklist, and the deadline timeline.

import { router, useLocalSearchParams } from 'expo-router';
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  ListOrdered,
  CloudUpload,
  CloudCheck,
  MessageCircleQuestionMark,
  Square,
  SquareCheck,
  Target,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FactInput } from '@/components/FactInput';
import { WhatChanged } from '@/components/WhatChanged';
import { Banner, Body, Button, Card, H1, H2, LinkText, Loading, Pill, Screen } from '@/components/ui';
import { daysAway, formatDate, isIsoDate, statusFor } from '@/lib/dates';
import { calendarUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFlow, useProgress, withoutBlanks } from '@/lib/flow';
import type { Progress } from '@/lib/storage';
import { colors, font, radius, space, TAP, fonts, shadow, themed } from '@/lib/theme';
import { nextStep, stepState } from '@/lib/tracker';
import {
  TRACKER_LABELS,
  type DeadlineStatus,
  type FactValue,
  type PackDetail,
  type Plan,
  type PlanDeadline,
  type PlanStep,
} from '@/lib/types';

type Tab = 'steps' | 'documents' | 'deadlines';

const WAVE = 3; // quick questions shown at a time, most important first

export default function PlanScreen() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const flow = useFlow();
  const auth = useAuth();
  const plan = flow.plans[packId];
  const { progress, update } = useProgress(packId);
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [dismissed, setDismissed] = useState<Plan | null>(null); // the plan whose "What changed?" was closed
  const [nextNote, setNextNote] = useState<string | null>(null);
  const lastNext = useRef<string | undefined>(undefined);

  // Coming back to a saved plan (or reloading the page): rebuild it from the saved facts.
  useEffect(() => {
    flow.loadPack(packId).then(setPack, () => {});
    if (plan) return;
    (async () => {
      const facts = flow.facts[packId] ?? (await flow.ensureProgress(packId)).facts;
      if (!facts) {
        router.replace('/');
        return;
      }
      flow.buildPlan(packId, facts).catch((e: Error) => setError(e.message));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  const answer = async (factId: string, value: FactValue | undefined) => {
    const facts = { ...(flow.facts[packId] ?? {}) };
    if (value === undefined) delete facts[factId];
    else facts[factId] = value;
    setRebuilding(true);
    try {
      await flow.buildPlan(packId, withoutBlanks(facts));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRebuilding(false);
    }
  };

  // When "Do this next" moves on because the user finished a step, say so.
  const nextId = plan ? nextStep(plan, progress)?.id : undefined;
  useEffect(() => {
    const before = lastNext.current;
    lastNext.current = nextId;
    if (!plan || !before || before === nextId || progress.tracker[before] !== 'done') return;
    const finished = plan.steps.find((s) => s.id === before)?.title;
    const upNext = plan.steps.find((s) => s.id === nextId)?.title;
    setNextNote(upNext ? `You finished "${finished}". Next up: ${upNext}.` : `You finished "${finished}". Every step is done.`);
  }, [nextId, plan, progress.tracker]);

  if (!plan) return <Screen>{error ? <Banner tone="warn">{error}</Banner> : <Loading label="Building your plan…" />}</Screen>;

  const next = nextStep(plan, progress);
  const doneCount = plan.steps.filter((s) => stepState(s, progress) === 'done').length;

  return (
    <Screen>
      <H1>{plan.pack.title}</H1>
      <Body muted>
        {plan.steps.length} steps · {doneCount} done · built for {formatDate(plan.today)}
      </Body>

      {plan.why_it_matters && (
        <View style={styles.why}>
          <Text style={styles.whyLabel}>Why this matters</Text>
          <Text style={styles.whyText}>{plan.why_it_matters.text}</Text>
          {plan.why_it_matters.source_url && <LinkText label="Official source" url={plan.why_it_matters.source_url} />}
        </View>
      )}
      {plan.cycle_warning && <Banner tone="warn">{plan.cycle_warning}</Banner>}
      {plan.notices.map((n) => (
        <Banner key={n.id} tone="may">
          {n.message}
        </Banner>
      ))}
      {error && <Banner tone="warn">{error}</Banner>}
      {plan.changes?.any && dismissed !== plan && <WhatChanged changes={plan.changes} onDismiss={() => setDismissed(plan)} />}
      {nextNote && (
        <Pressable onPress={() => setNextNote(null)} accessibilityRole="button" accessibilityHint="Dismisses this message">
          <Banner>{nextNote}</Banner>
        </Pressable>
      )}

      {auth.enabled && !auth.user && (
        <Pressable
          onPress={() => router.push('/account')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveCard, pressed && { opacity: 0.85 }]}
        >
          <CloudUpload size={22} color={colors.primary} />
          <Text style={styles.saveText}>Create a free account to save your plan and open it on another device.</Text>
        </Pressable>
      )}
      {auth.user && (
        <View style={styles.syncRow}>
          <CloudCheck size={16} color={flow.sync.status === 'error' ? colors.warnText : colors.goodText} />
          <Text style={[styles.syncText, flow.sync.status === 'error' && { color: colors.warnText }]}>
            {flow.sync.status === 'saving'
              ? 'Saving to your account…'
              : flow.sync.status === 'error'
                ? flow.sync.message
                : 'Saved to your account'}
          </Text>
        </View>
      )}

      <Tabs tab={tab} onChange={setTab} counts={[plan.steps.length, plan.documents.length, plan.deadlines.length]} />

      {tab === 'steps' && (
        <>
          {next && (
            <Card style={styles.nextCard}>
              <View style={styles.nextLabelRow}>
                <Target size={16} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.nextLabel}>DO THIS NEXT</Text>
              </View>
              <Text style={styles.nextTitle}>{next.title}</Text>
              <Text style={styles.nextBody} numberOfLines={3}>
                {next.plain_explanation}
              </Text>
              <Button label="See how" kind="secondary" onPress={() => router.push(`/${packId}/step/${next.id}`)} />
            </Card>
          )}
          {!next && plan.steps.length > 0 && <Banner>Every step is marked done. Nice work.</Banner>}

          {plan.questions.length > 0 && pack && (
            <Card style={styles.questionsCard}>
              <H2 icon={MessageCircleQuestionMark}>
                {plan.questions.length > WAVE ? 'A few quick questions' : `Answer ${plan.questions.length} quick question${plan.questions.length > 1 ? 's' : ''}`}{' '}
                to make your plan exact
              </H2>
              <Body muted>
                Some steps are marked "May apply" because they depend on these. The most important ones come first
                {plan.questions.length > WAVE ? ', and more appear only if they still matter after you answer' : ''}.
              </Body>
              {plan.questions.slice(0, WAVE).map((q) => {
                const fact = pack.facts.find((f) => f.id === q.fact_id);
                return fact ? (
                  <FactInput
                    key={q.fact_id}
                    fact={fact}
                    value={flow.facts[packId]?.[q.fact_id]}
                    onChange={(v) => answer(q.fact_id, v)}
                  />
                ) : null;
              })}
              {rebuilding && <Loading label="Updating your plan…" />}
            </Card>
          )}

          <H2 icon={ListOrdered}>All steps, in order</H2>
          {plan.steps.map((step, i) => (
            <StepRow
              key={step.id}
              n={i + 1}
              step={step}
              progress={progress}
              isNew={!!plan.changes?.added.some((c) => c.step_id === step.id)}
              onPress={() => router.push(`/${packId}/step/${step.id}`)}
            />
          ))}
        </>
      )}

      {tab === 'documents' && <DocumentsTab plan={plan} progress={progress} update={update} />}
      {tab === 'deadlines' && <DeadlinesTab plan={plan} progress={progress} update={update} />}

      <Button label="Change my answers" kind="secondary" onPress={() => router.push(`/${packId}/confirm`)} />
      <Button
        label="Start over"
        kind="quiet"
        onPress={async () => {
          await flow.resetPack(packId);
          router.replace('/');
        }}
      />
    </Screen>
  );
}

function Tabs({ tab, onChange, counts }: { tab: Tab; onChange: (t: Tab) => void; counts: number[] }) {
  const tabs: [Tab, string, LucideIcon][] = [
    ['steps', 'Steps', ListOrdered],
    ['documents', 'Documents', FileText],
    ['deadlines', 'Deadlines', CalendarDays],
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map(([id, label, Icon], i) => (
        <Pressable
          key={id}
          onPress={() => onChange(id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === id }}
          style={[styles.tab, tab === id && styles.tabOn]}
        >
          <Icon size={18} color={tab === id ? colors.primary : colors.muted} strokeWidth={2.25} />
          <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
            {label} ({counts[i]})
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function StepRow({
  n,
  step,
  progress,
  isNew,
  onPress,
}: {
  n: number;
  step: PlanStep;
  progress: Progress;
  isNew: boolean;
  onPress: () => void;
}) {
  const state = stepState(step, progress);
  const done = state === 'done';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Step ${n}: ${step.title}. ${isNew ? 'New. ' : ''}${TRACKER_LABELS[state]}.${step.match === 'unknown' ? ' May apply.' : ''}`}
      style={({ pressed }) => [styles.stepRow, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.stepNum, done && styles.stepNumDone]}>
        {done ? (
          <Check size={18} color={colors.goodText} strokeWidth={3} />
        ) : (
          <Text style={styles.stepNumText}>{n}</Text>
        )}
      </View>
      <View style={styles.stepText}>
        <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{step.title}</Text>
        <View style={styles.pills}>
          {isNew && <Pill label="New" tone="info" />}
          <Pill label={TRACKER_LABELS[state]} tone={done ? 'good' : state === 'todo' ? 'neutral' : 'info'} />
          {step.match === 'unknown' && <Pill label="May apply: check this" tone="may" />}
        </View>
      </View>
      <ChevronRight size={22} color={colors.muted} />
    </Pressable>
  );
}

function DocumentsTab({ plan, progress, update }: TabProps) {
  const titles = Object.fromEntries(plan.steps.map((s) => [s.id, s.title]));
  const gathered = plan.documents.filter((d) => progress.documents[d.id]).length;
  return (
    <>
      <Body muted>
        Gather each document once. {gathered} of {plan.documents.length} gathered.
      </Body>
      {plan.documents.map((doc) => {
        const on = !!progress.documents[doc.id];
        return (
          <Pressable
            key={doc.id}
            onPress={() => update((p) => ({ ...p, documents: { ...p.documents, [doc.id]: !on } }))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={[styles.docRow, on && styles.docRowOn]}
          >
            {on ? (
              <SquareCheck size={24} color={colors.goodText} strokeWidth={2.25} />
            ) : (
              <Square size={24} color={colors.muted} strokeWidth={1.75} />
            )}
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, on && styles.stepTitleDone]}>{doc.name}</Text>
              {!!doc.who && <Text style={styles.meta}>Who: {doc.who}</Text>}
              {!!doc.note && <Text style={styles.meta}>{doc.note}</Text>}
              <Text style={styles.meta}>Used for: {doc.used_by.map((id) => titles[id]).join(' · ')}</Text>
              {doc.may_apply && <Pill label="May apply" tone="may" />}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

const STATUS_TONE: Record<DeadlineStatus, 'warn' | 'may' | 'info' | 'neutral'> = {
  passed: 'neutral',
  soon: 'warn',
  upcoming: 'info',
  needs_date: 'may',
};
const STATUS_LABEL: Record<DeadlineStatus, string> = {
  passed: 'Passed',
  soon: 'Soon',
  upcoming: 'Upcoming',
  needs_date: 'Add your date',
};

function DeadlinesTab({ plan, progress, update }: TabProps) {
  const titles = Object.fromEntries(plan.steps.map((s) => [s.id, s.title]));
  return (
    <>
      <Body muted>Dates that come from a letter or depend on your situation can be typed in.</Body>
      {plan.deadlines.map((dl) => (
        <DeadlineRow key={dl.id} dl={dl} today={plan.today} titles={titles} progress={progress} update={update} />
      ))}
    </>
  );
}

function DeadlineRow({
  dl,
  today,
  titles,
  progress,
  update,
}: {
  dl: PlanDeadline;
  today: string;
  titles: Record<string, string>;
  progress: Progress;
  update: TabProps['update'];
}) {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const userDate = progress.dates[dl.id];
  const date = dl.date ?? userDate ?? null;
  const status = dl.date ? dl.status : statusFor(userDate ?? null, today);
  const [draft, setDraft] = useState(userDate ?? '');

  return (
    <Card>
      <View style={styles.pills}>
        {dl.asap ? (
          <Pill label="As soon as possible" tone="warn" />
        ) : (
          <Pill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        )}
        {dl.kind === 'hard' && <Pill label="Hard deadline" tone="warn" />}
        {dl.kind === 'priority' && <Pill label="Priority" tone="info" />}
      </View>
      <Text style={styles.stepTitle}>{dl.label}</Text>
      {date && (
        <View style={styles.dateRow}>
          <CalendarDays size={18} color={colors.text} />
          <Text style={styles.deadlineDate}>
            {formatDate(date)} · {daysAway(date, today)}
          </Text>
        </View>
      )}
      {!dl.date && !dl.asap && (
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (isIsoDate(t) || t === '') {
              update((p) => {
                const dates = { ...p.dates };
                if (t) dates[dl.id] = t;
                else delete dates[dl.id];
                return { ...p, dates };
              });
            }
          }}
          placeholder="Type the date: YYYY-MM-DD"
          accessibilityLabel={`Date for ${dl.label}`}
          inputMode="numeric"
          style={styles.dateInput}
        />
      )}
      {!!dl.note && <Text style={styles.meta}>{dl.note}</Text>}
      {status === 'passed' && !!dl.if_missed && <Banner tone="may">If you missed it: {dl.if_missed}</Banner>}
      <Text style={styles.meta}>For: {dl.used_by.map((id) => titles[id]).join(' · ')}</Text>
      {date && status !== 'passed' && (
        <LinkText label="Add to my calendar" url={calendarUrl(packId, dl.id, dl.date ? undefined : date)} />
      )}
      {dl.source_url && <LinkText label="Official source" url={dl.source_url} />}
    </Card>
  );
}

interface TabProps {
  plan: Plan;
  progress: Progress;
  update: (change: (p: Progress) => Progress) => void;
}

const styles = themed(() => StyleSheet.create({
  why: { gap: 2, borderLeftWidth: 4, borderLeftColor: colors.mayBorder, paddingLeft: space.md, paddingVertical: space.xs },
  whyLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.mayText },
  whyText: { fontFamily: fonts.medium, fontSize: font.body, color: colors.text, lineHeight: 23 },
  saveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
  },
  saveText: { flex: 1, fontFamily: fonts.semibold, fontSize: font.small, color: colors.primary, lineHeight: 20 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncText: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted },
  nextCard: { borderColor: colors.primary, borderWidth: 2 },
  nextLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary, letterSpacing: 1 },
  nextTitle: { fontFamily: fonts.heading, fontSize: font.title, color: colors.text },
  nextBody: { fontFamily: fonts.regular, fontSize: font.body, color: colors.muted, lineHeight: 22 },
  questionsCard: { backgroundColor: colors.maySoft, borderColor: colors.mayBorder },
  tabs: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 3 },
  tab: { flexGrow: 1, flexBasis: 'auto', minHeight: TAP + 12, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.sm, paddingVertical: space.xs },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.muted },
  tabTextOn: { color: colors.primary },
  stepRow: {
    ...shadow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    minHeight: TAP + 16,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumDone: { backgroundColor: colors.goodSoft },
  stepNumText: { fontFamily: fonts.bold, color: colors.primary },
  stepText: { flex: 1, gap: space.xs },
  stepTitle: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text, lineHeight: 22 },
  stepTitleDone: { color: colors.muted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  docRow: {
    ...shadow,
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
    minHeight: TAP,
  },
  docRowOn: { backgroundColor: colors.bg },
  meta: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  deadlineDate: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text },
  dateInput: {
    fontFamily: fonts.regular,
    minHeight: TAP,
    fontSize: font.body,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: colors.text,
  },
}));
