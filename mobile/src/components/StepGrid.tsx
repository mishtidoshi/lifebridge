// Every step of the plan as a numbered box. Tap one to jump to it.
// Filled teal = the step you're on, green with a check = done, amber = "may apply".

import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Progress } from '@/lib/storage';
import { colors, fonts, radius, space, themed } from '@/lib/theme';
import { stepState } from '@/lib/tracker';
import { TRACKER_LABELS, type PlanStep } from '@/lib/types';

interface Props {
  steps: PlanStep[];
  currentId: string;
  progress: Progress;
  onSelect: (stepId: string) => void;
}

export function StepGrid({ steps, currentId, progress, onSelect }: Props) {
  return (
    <View>
      <View style={styles.grid}>
        {steps.map((step, i) => {
          const current = step.id === currentId;
          const state = stepState(step, progress);
          const done = state === 'done';
          const may = step.match === 'unknown';
          return (
            <Pressable
              key={step.id}
              onPress={() => onSelect(step.id)}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${step.title}. ${TRACKER_LABELS[state]}.${may ? ' May apply.' : ''}`}
              accessibilityState={{ selected: current }}
              style={({ pressed }) => [
                styles.box,
                done && styles.boxDone,
                may && !done && styles.boxMay,
                current && styles.boxCurrent,
                pressed && styles.pressed,
              ]}
            >
              {done && !current ? (
                <Check size={20} color={colors.goodText} strokeWidth={3} />
              ) : (
                <Text style={[styles.number, current && styles.numberCurrent, may && !current && styles.numberMay]}>
                  {i + 1}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend} accessible={false}>
        <LegendItem style={styles.boxCurrent} label="This step" />
        <LegendItem style={styles.boxDone} label="Done" />
        <LegendItem style={styles.boxMay} label="May apply" />
      </View>
    </View>
  );
}

function LegendItem({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const BOX = 48;

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: colors.goodSoft, borderColor: colors.goodSoft },
  boxMay: { backgroundColor: colors.maySoft, borderColor: colors.mayBorder, borderStyle: 'dashed' },
  boxCurrent: { backgroundColor: colors.primary, borderColor: colors.primary, borderStyle: 'solid' },
  pressed: { opacity: 0.7 },
  number: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  numberCurrent: { color: colors.primaryText },
  numberMay: { color: colors.mayText },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5 },
  legendText: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
}));
