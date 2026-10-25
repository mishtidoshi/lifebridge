// "What changed?": after the user updates an answer, a short summary of how the plan changed
// and why (engine/changes.py). Unchanged steps aren't listed, so the summary stays quiet.

import { ArrowUp, CircleCheck, CircleHelp, CirclePlus, CircleMinus, Sparkles, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { colors, font, fonts, radius, space, themed } from '@/lib/theme';
import type { PlanChange, PlanChanges } from '@/lib/types';

function Group({ icon: Icon, color, title, items }: { icon: LucideIcon; color: string; title: string; items: PlanChange[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Icon size={18} color={color} strokeWidth={2.25} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {items.map((c) => (
        <View key={c.step_id} style={styles.item}>
          <Text style={styles.itemTitle}>{c.title}</Text>
          <Text style={styles.reason}>{c.reason}</Text>
        </View>
      ))}
    </View>
  );
}

export function WhatChanged({ changes, onDismiss }: { changes: PlanChanges; onDismiss: () => void }) {
  return (
    <Card style={styles.card}>
      <View style={styles.head} accessibilityRole="header">
        <Sparkles size={20} color={colors.primary} strokeWidth={2.25} />
        <Text style={styles.title}>What changed?</Text>
      </View>
      {changes.next && changes.next.title && (
        <View style={styles.next}>
          <Text style={styles.nextLabel}>Do this next is now</Text>
          <Text style={styles.nextTitle}>{changes.next.title}</Text>
          <Text style={styles.reason}>{changes.next.reason}</Text>
        </View>
      )}
      <Group icon={CirclePlus} color={colors.primary} title="New steps" items={changes.added} />
      <Group icon={CircleCheck} color={colors.goodText} title="Now applies to you" items={changes.confirmed} />
      <Group icon={CircleHelp} color={colors.mayText} title='Now "May apply"' items={changes.now_unsure} />
      <Group icon={CircleMinus} color={colors.muted} title="No longer needed" items={changes.removed} />
      <Group icon={ArrowUp} color={colors.primary} title="Moved earlier" items={changes.moved_up} />
      <Button label="Got it" kind="quiet" onPress={onDismiss} />
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { borderColor: colors.primary, borderWidth: 1.5, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.heading, fontSize: font.title, color: colors.text },
  next: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md, gap: 2 },
  nextLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  nextTitle: { fontFamily: fonts.bold, fontSize: font.body, color: colors.text },
  group: { gap: space.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupTitle: { fontFamily: fonts.bold, fontSize: font.body, color: colors.text },
  item: { paddingLeft: 26, gap: 2 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text, lineHeight: 22 },
  reason: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
}));
