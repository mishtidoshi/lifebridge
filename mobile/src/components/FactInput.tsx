// One question from a pack's `facts`, rendered by its type (enum, multi, bool, date).

import { Circle, CircleDot, Search, Square, SquareCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isIsoDate } from '@/lib/dates';
import { colors, font, radius, space, TAP, fonts, themed } from '@/lib/theme';
import { NOT_SURE, type Fact, type FactValue } from '@/lib/types';

interface Props {
  fact: Fact;
  value: FactValue | undefined;
  onChange: (value: FactValue | undefined) => void;
}

export function FactInput({ fact, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.question}>{fact.question}</Text>
      {fact.type === 'enum' && <EnumInput fact={fact} value={value as string | undefined} onChange={onChange} />}
      {fact.type === 'multi' && <MultiInput fact={fact} value={value as string[] | undefined} onChange={onChange} />}
      {fact.type === 'bool' && <BoolInput value={value} onChange={onChange} />}
      {fact.type === 'date' && <DateInput value={value as string | undefined} onChange={onChange} />}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  multi,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <ChoiceMark multi={multi} selected={selected} />
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ChoiceMark({ multi, selected }: { multi?: boolean; selected: boolean }) {
  const Icon = multi ? (selected ? SquareCheck : Square) : selected ? CircleDot : Circle;
  return <Icon size={22} color={selected ? colors.primary : colors.muted} strokeWidth={selected ? 2.25 : 1.75} />;
}

const LONG_LIST = 12; // more options than this (like the 50 states) get a search box

function EnumInput({ fact, value, onChange }: { fact: Fact; value?: string; onChange: Props['onChange'] }) {
  if (fact.options.length > LONG_LIST) return <SearchPicker fact={fact} value={value} onChange={onChange} />;
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      {fact.options.map((o) => (
        <Choice
          key={o.value}
          label={o.label}
          selected={value === o.value}
          onPress={() => onChange(value === o.value ? undefined : o.value)}
        />
      ))}
    </View>
  );
}

/** A long list with a search box. After choosing, it shows just the choice and a "Change" button. */
function SearchPicker({ fact, value, onChange }: { fact: Fact; value?: string; onChange: Props['onChange'] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(value === undefined);
  const chosen = fact.options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const matches = q ? fact.options.filter((o) => o.label.toLowerCase().includes(q) || o.value === q) : fact.options;

  if (chosen && !open) {
    return (
      <View style={styles.choices}>
        <Choice label={chosen.label} selected onPress={() => setOpen(true)} />
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.change}>
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.choices}>
      <View style={styles.searchRow}>
        <Search size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type to search, like Texas or TX"
          placeholderTextColor={colors.muted}
          accessibilityLabel={`Search: ${fact.question}`}
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>
      <ScrollView style={styles.pickList} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
        <View style={styles.choices}>
          {matches.map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              selected={value === o.value}
              onPress={() => {
                onChange(o.value);
                setQuery('');
                setOpen(false);
              }}
            />
          ))}
          {matches.length === 0 && <Text style={styles.help}>No matches. Try another spelling.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function MultiInput({ fact, value, onChange }: { fact: Fact; value?: string[]; onChange: Props['onChange'] }) {
  const picked = value ?? [];
  const toggle = (v: string) =>
    onChange(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);
  return (
    <View style={styles.choices}>
      {fact.options.map((o) => (
        <Choice key={o.value} label={o.label} multi selected={picked.includes(o.value)} onPress={() => toggle(o.value)} />
      ))}
      <Text style={styles.help}>Pick all that apply.</Text>
    </View>
  );
}

// "Not sure" is a real answer (saved as "not_sure"): the app stops asking, and the rules treat it as unknown.
function BoolInput({ value, onChange }: { value?: FactValue; onChange: Props['onChange'] }) {
  const pick = (v: FactValue) => onChange(value === v ? undefined : v);
  return (
    <View style={styles.choices} accessibilityRole="radiogroup">
      <Choice label="Yes" selected={value === true} onPress={() => pick(true)} />
      <Choice label="No" selected={value === false} onPress={() => pick(false)} />
      <Choice label="Not sure" selected={value === NOT_SURE} onPress={() => pick(NOT_SURE)} />
    </View>
  );
}

function DateInput({ value, onChange }: { value?: string; onChange: Props['onChange'] }) {
  const [draft, setDraft] = useState(value ?? '');
  const bad = draft !== '' && !isIsoDate(draft);
  return (
    <View>
      <TextInput
        value={draft}
        onChangeText={(t) => {
          setDraft(t);
          onChange(isIsoDate(t) ? t : undefined);
        }}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        accessibilityLabel="Date, year month day"
        style={[styles.input, bad && styles.inputBad]}
      />
      {bad && <Text style={styles.error}>Use the format YYYY-MM-DD, for example 2026-11-03.</Text>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TAP,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, minHeight: TAP, fontFamily: fonts.regular, fontSize: font.body, color: colors.text },
  pickList: { maxHeight: 300 },
  change: { alignSelf: 'flex-start', minHeight: TAP, justifyContent: 'center' },
  changeText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.primary, textDecorationLine: 'underline' },
  wrap: { gap: space.sm },
  question: { fontFamily: fonts.heading, fontSize: font.large, color: colors.text, lineHeight: 26 },
  choices: { gap: space.sm },
  choice: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.8 },
  choiceText: { fontFamily: fonts.regular, fontSize: font.body, color: colors.text, flexShrink: 1 },
  choiceTextOn: { fontFamily: fonts.semibold, color: colors.primary },
  help: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted },
  input: {
    fontFamily: fonts.regular,
    minHeight: TAP,
    fontSize: font.body, // 16+ keeps iPhone Safari from zooming in
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  inputBad: { borderColor: colors.warnText },
  error: { fontFamily: fonts.regular, color: colors.warnText, fontSize: font.small, marginTop: space.xs },
}));
