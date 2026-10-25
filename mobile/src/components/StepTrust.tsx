// Three sections at the bottom of a step:
//   How this step was made: the official text, the link, how it was drafted, and whether a person has reviewed it
//   Still stuck?: where to get help, and what to have ready
//   Report a problem: an email with only the step's id (shown only if CONTACT_EMAIL is set)

import { ChevronDown, ChevronUp, Flag, LifeBuoy, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Card, LinkText } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { CONTACT_EMAIL } from '@/lib/legal';
import { colors, font, fonts, radius, space, TAP, themed } from '@/lib/theme';
import type { PlanHelp, PlanStep } from '@/lib/types';

function Section({ icon: Icon, title, startOpen, children }: { icon: LucideIcon; title: string; startOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!startOpen);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Card>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <Icon size={20} color={colors.primary} strokeWidth={2.25} />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Chevron size={20} color={colors.muted} />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </Card>
  );
}

export function HowMade({ step }: { step: PlanStep }) {
  return (
    <Section icon={ShieldCheck} title="How this step was made" startOpen>
      {step.judgment ? (
        <Body>
          This step is LifeBridge's own advice, based on research and talking with students and counselors. It isn't a rule
          from an official source.
        </Body>
      ) : (
        <>
          <Text style={styles.label}>What the official source says</Text>
          {step.source_text ? (
            <Text style={styles.quote}>{step.source_text}</Text>
          ) : (
            <Body muted>The official wording hasn't been added yet. Use the link below.</Body>
          )}
          {step.source_url && <LinkText label="Read the official page" url={step.source_url} />}
        </>
      )}
      <View style={styles.facts}>
        {step.ai_drafted && (
          <Text style={styles.fact}>• Drafted with help from an AI assistant, using only the official text above.</Text>
        )}
        {step.last_verified && !step.judgment && (
          <Text style={styles.fact}>• The official text was last checked against the page on {formatDate(step.last_verified)}.</Text>
        )}
        <Text style={[styles.fact, step.review_status !== 'verified' && styles.factWarn]}>
          {step.review_status === 'verified'
            ? `• Reviewed by a person (${step.verified_by}).`
            : '• Not reviewed by a person yet. Double-check with the official source.'}
        </Text>
      </View>
    </Section>
  );
}

export function StillStuck({ help }: { help: PlanHelp[] }) {
  if (help.length === 0) return null;
  return (
    <Section icon={LifeBuoy} title="Still stuck?">
      {help.map((h) => (
        <View key={h.id} style={styles.helpItem}>
          <Text style={styles.helpTitle}>{h.title}</Text>
          <Body>{h.text}</Body>
          {h.prepare.length > 0 && (
            <>
              <Text style={styles.label}>Have these ready</Text>
              {h.prepare.map((p) => (
                <Text key={p} style={styles.fact}>
                  • {p}
                </Text>
              ))}
            </>
          )}
          {h.where?.url && <LinkText label={h.where.label} url={h.where.url} />}
        </View>
      ))}
    </Section>
  );
}

export function ReportProblem({ packId, stepId }: { packId: string; stepId: string }) {
  if (!CONTACT_EMAIL) return null;
  // Only the step's id goes in the email, so nothing about the person is sent.
  const subject = encodeURIComponent(`LifeBridge: problem with ${packId}/${stepId}`);
  const body = encodeURIComponent(`Step: ${packId}/${stepId}\n\nWhat's wrong or out of date:\n`);
  return (
    <Pressable
      onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`)}
      accessibilityRole="link"
      accessibilityHint="Opens an email with this step's name. Don't include personal information."
      style={({ pressed }) => [styles.report, pressed && styles.pressed]}
    >
      <Flag size={18} color={colors.muted} />
      <Text style={styles.reportText}>Report a problem with this step</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TAP },
  title: { flex: 1, fontFamily: fonts.heading, fontSize: font.large, color: colors.text },
  pressed: { opacity: 0.75 },
  body: { gap: space.sm },
  label: { fontFamily: fonts.bold, fontSize: font.small, color: colors.muted, marginTop: space.xs },
  quote: {
    fontFamily: fonts.regular,
    fontSize: font.body,
    lineHeight: 24,
    color: colors.text,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: space.md,
  },
  facts: { gap: 4, marginTop: space.xs },
  fact: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  factWarn: { color: colors.mayText, fontFamily: fonts.semibold },
  helpItem: { gap: space.xs, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  helpTitle: { fontFamily: fonts.bold, fontSize: font.body, color: colors.text },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: TAP, borderRadius: radius.md },
  reportText: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.muted, textDecorationLine: 'underline' },
}));
