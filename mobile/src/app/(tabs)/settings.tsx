// Settings: Smart reading on/off, remembering sensitive answers, and deleting saved data.

import { router } from 'expo-router';
import { useState } from 'react';
import { Moon, Smartphone, Sun } from 'lucide-react-native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Banner, Body, Button, Card, H1, H2, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFlow } from '@/lib/flow';
import { useSettings, type Appearance } from '@/lib/settings';
import { colors, font, fonts, radius, space, themed } from '@/lib/theme';
import { TOPICS } from '@/lib/topics';

function Toggle({ label, value, onChange, children }: { label: string; value: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
        />
      </View>
      {children}
    </Card>
  );
}

const APPEARANCES: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Match my phone', Icon: Smartphone },
];

export default function SettingsScreen() {
  const settings = useSettings();
  const flow = useFlow();
  const auth = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const deleteAll = async () => {
    setBusy(true);
    try {
      for (const t of TOPICS) await flow.resetPack(t.id);
      setMessage(auth.user ? 'Your plans were deleted from this device and your account.' : 'Your plans were deleted from this device.');
      setConfirm(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen noHeader>
      <H1>Settings</H1>
      <Body muted>These settings are saved only on this device.</Body>

      <Card>
        <Text style={styles.label} accessibilityRole="header">
          Appearance
        </Text>
        <View style={styles.choices} accessibilityRole="radiogroup">
          {APPEARANCES.map(({ value, label, Icon }) => {
            const on = settings.appearance === value;
            return (
              <Pressable
                key={value}
                onPress={() => settings.update({ appearance: value })}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}
              >
                <Icon size={20} color={on ? colors.primary : colors.muted} strokeWidth={2.25} />
                <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Body muted>Dark mode is easier on the eyes at night. "Match my phone" follows your phone's setting.</Body>
      </Card>

      <Toggle
        label={`Smart reading: ${settings.smartReading ? 'On' : 'Off'}`}
        value={settings.smartReading}
        onChange={(v) => settings.update({ smartReading: v })}
      >
        <Body>
          When it's on, LifeBridge reads what you type in "What's happening?" to pick the topic and fill in your answers. It
          uses rules plus machine-learning models LifeBridge built itself, trained only on its own topics, on LifeBridge's
          server, so it can read typos like "senoir." Rules always decide your plan. Nothing goes to an AI company.
        </Body>
        <Body muted>
          When it's off, you answer a few questions instead and nothing you type is read. Your plan is the same either way,
          because rules build it from the answers you confirm.
        </Body>
      </Toggle>

      <Toggle
        label="Remember sensitive answers"
        value={settings.rememberSensitive}
        onChange={(v) => {
          settings.update({ rememberSensitive: v });
          if (!v) flow.resaveAll(false); // take them out of what's already saved
        }}
      >
        <Body>
          Some questions are sensitive, like immigration status or health conditions. When this is off, those answers are
          kept only until you close LifeBridge, and are never saved on this device{auth.user ? ' or in your account' : ''}. That
          protects you on a shared phone or school computer. You'll be asked again next time.
        </Body>
      </Toggle>

      <Card>
        <H2>Delete my data</H2>
        <Body>
          Deletes your answers, checklists, and progress for every topic from this device
          {auth.user ? ' and from your account' : ''}.
        </Body>
        {message && <Banner>{message}</Banner>}
        {!confirm ? (
          <Button label="Delete my data" kind="secondary" onPress={() => setConfirm(true)} />
        ) : (
          <>
            <Banner tone="warn">This can't be undone.</Banner>
            <Button label="Yes, delete my data" onPress={deleteAll} busy={busy} />
            <Button label="Cancel" kind="quiet" onPress={() => setConfirm(false)} />
          </>
        )}
      </Card>

      <Button label="Read the Terms & Privacy" kind="quiet" onPress={() => router.push('/legal')} />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 44 },
  label: { flex: 1, fontFamily: fonts.heading, fontSize: font.large, color: colors.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.muted },
  choiceTextOn: { color: colors.primary },
  pressed: { opacity: 0.75 },
}));
