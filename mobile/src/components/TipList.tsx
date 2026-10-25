// A list of short questions that open to show their answer (an accordion).
// Several can be open at once; the first starts open so it's clear the rows expand.

import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow, space, themed } from '@/lib/theme';

export interface Tip {
  icon: LucideIcon;
  question: string;
  answer: string;
}

export function TipList({ tips }: { tips: Tip[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <View style={styles.list}>
      {tips.map((tip, i) => {
        const isOpen = open.has(i);
        const Chevron = isOpen ? ChevronUp : ChevronDown;
        return (
          <View key={tip.question} style={[styles.item, i > 0 && styles.divider]}>
            <Pressable
              onPress={() => toggle(i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityHint={isOpen ? 'Hides the answer' : 'Shows the answer'}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <tip.icon size={22} color={colors.primary} strokeWidth={2.25} />
              </View>
              <Text style={styles.question}>{tip.question}</Text>
              <Chevron size={22} color={colors.muted} />
            </Pressable>
            {isOpen && <Text style={styles.answer}>{tip.answer}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.lg, ...shadow },
  item: { paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: { flex: 1, fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.text },
  answer: {
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    marginTop: space.sm,
    marginLeft: 44 + space.md, // line up with the question text, past the icon
  },
}));
