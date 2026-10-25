// Account: sign in, create an account, reset a password, or manage the signed-in account.
// Accounts are optional. Without one, everything stays on this device.

import { router } from 'expo-router';
import { CircleCheck, CloudOff, Eye, EyeOff, LockKeyhole, Mail, Square, SquareCheck, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Banner, Body, Button, Card, H1, H2, Loading, Screen } from '@/components/ui';
import { EMAIL_SENDER, emailProblem, nameProblem, passwordProblem, useAuth } from '@/lib/auth';
import { useFlow } from '@/lib/flow';
import { TOPICS } from '@/lib/topics';
import { colors, font, fonts, radius, space, TAP, themed } from '@/lib/theme';

type Mode = 'signin' | 'signup' | 'forgot';

/** Back to where they came from, or home if this page was opened directly. */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function Account() {
  const auth = useAuth();

  if (!auth.enabled) {
    return (
      <Screen noHeader>
        <H1>Accounts</H1>
        <Card>
          <H2 icon={CloudOff}>Accounts aren't turned on yet</H2>
          <Body>
            You can still use everything in LifeBridge. Your answers and progress are saved on this device.
          </Body>
          {__DEV__ && (
            <Body muted>
              Developer note: add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY to mobile/.env.local (see the
              README, "Accounts"), then restart the app.
            </Body>
          )}
        </Card>
      </Screen>
    );
  }
  if (auth.loading) return <Screen noHeader><Loading /></Screen>;
  if (auth.recovering) return <NewPassword />;
  return auth.user ? <SignedIn /> : <SignedOut />;
}

// --- signed out -------------------------------------------------------------------

function SignedOut() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null); // "check your email" message

  const submit = async () => {
    setError(null);
    const name = { first: firstName.trim(), last: lastName.trim() };
    const problem =
      (mode === 'signup' ? nameProblem(name) : null) ??
      emailProblem(email) ??
      (mode === 'signup' ? passwordProblem(password) : null) ??
      (mode === 'signin' && !password ? 'Please enter your password.' : null) ??
      (mode === 'signup' && !agreed ? 'Please check the box to continue.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(email.trim(), password);
        leave();
      } else if (mode === 'signup') {
        const { needsEmailConfirmation } = await auth.signUp(email.trim(), password, name);
        if (needsEmailConfirmation) setSent(`We sent a link to ${email.trim()}. Open it to confirm your account, then come back and sign in.`);
        else leave();
      } else {
        await auth.sendPasswordReset(email.trim());
        setSent(`If there's an account for ${email.trim()}, we sent it a link to choose a new password.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen noHeader>
        <H1>Check your email</H1>
        <Card>
          <H2 icon={Mail}>One more step</H2>
          <Body>{sent}</Body>
          <Body>
            The email comes from <Text style={styles.strong}>{EMAIL_SENDER}</Text>, the service LifeBridge uses for
            accounts.
          </Body>
          <Body muted>Don't see it after a few minutes? Check your spam or junk folder.</Body>
        </Card>
        <Button
          label="Back to sign in"
          kind="secondary"
          onPress={() => {
            setSent(null);
            setMode('signin');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen noHeader>
      <H1>{mode === 'signup' ? 'Create an account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}</H1>
      <Body muted>
        {mode === 'forgot'
          ? "Enter your email and we'll send you a link to choose a new password. Your saved plans are encrypted with your old password, so after a reset you'll start new ones."
          : 'An account saves your answers and progress for every topic, so you can open your plans on another phone or computer.'}
      </Body>

      {mode !== 'forgot' && (
        <View style={styles.switcher} accessibilityRole="tablist">
          {(['signin', 'signup'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setError(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={[styles.switch, mode === m && styles.switchOn]}
            >
              <Text style={[styles.switchText, mode === m && styles.switchTextOn]}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Card>
        {mode === 'signup' && (
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" maxLength={50} />
            </View>
            <View style={styles.nameField}>
              <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={50} />
            </View>
          </View>
        )}
        <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" inputMode="email" autoCapitalize="none" />
        {mode !== 'forgot' && (
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? 'At least 8 characters, with a letter and a number.' : undefined}
          />
        )}
        {mode === 'signup' && (
          <Pressable
            onPress={() => {
              setAgreed(!agreed);
              setError(null);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            style={styles.agree}
          >
            {agreed ? <SquareCheck size={24} color={colors.primary} /> : <Square size={24} color={colors.muted} />}
            <Text style={styles.agreeText}>I'm 13 or older and agree to the Terms of Use and Privacy Policy.</Text>
          </Pressable>
        )}
        {mode === 'signup' && <Button label="Read the Terms & Privacy" kind="quiet" onPress={() => router.push('/legal')} />}
        {error && <Banner tone="warn">{error}</Banner>}
        {busy && mode === 'signin' && (
          <View style={styles.senderRow} accessibilityLiveRegion="polite">
            <LockKeyhole size={16} color={colors.muted} />
            <Text style={styles.senderText}>Signing in and unlocking your encrypted plans. This takes a few seconds…</Text>
          </View>
        )}
        <Button
          label={mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
          onPress={submit}
          busy={busy}
        />
        {mode !== 'signin' && (
          <View style={styles.senderRow}>
            <Mail size={16} color={colors.muted} />
            <Text style={styles.senderText}>
              {mode === 'signup' ? "We'll email you a link to confirm your account." : 'The reset link is sent by email.'} It
              comes from {EMAIL_SENDER}, the service LifeBridge uses for accounts.
            </Text>
          </View>
        )}
        {mode === 'signin' && <Button label="Forgot your password?" kind="quiet" onPress={() => setMode('forgot')} />}
        {mode === 'forgot' && <Button label="Back to sign in" kind="quiet" onPress={() => setMode('signin')} />}
      </Card>
    </Screen>
  );
}

// --- back from a "reset your password" email ------------------------------------------

function NewPassword() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await auth.setNewPassword(password);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen noHeader>
      <H1>Choose a new password</H1>
      <Card>
        <PasswordField label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
        {error && <Banner tone="warn">{error}</Banner>}
        <Button label="Save new password" onPress={save} busy={busy} />
      </Card>
    </Screen>
  );
}

// --- signed in ----------------------------------------------------------------------

function SignedIn() {
  const auth = useAuth();
  const flow = useFlow();
  const user = auth.user!;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'plan' | 'account' | null>(null);
  const saved = auth.name;
  const [firstName, setFirstName] = useState(saved.first);
  const [lastName, setLastName] = useState(saved.last);
  const [busy, setBusy] = useState(false);
  const savedTopics = TOPICS.filter((t) => flow.progress[t.id]?.facts);
  const forgetAll = (uid: string) => Promise.all(TOPICS.map((t) => flow.forgetOnDevice(uid, t.id)));

  const run = async (action: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = () =>
    run(async () => {
      const uid = user.id;
      await auth.signOut();
      await forgetAll(uid); // it's saved in the account; don't leave it on a shared device
      router.replace('/');
    });

  const saveName = () => {
    const name = { first: firstName.trim(), last: lastName.trim() };
    const problem = nameProblem(name);
    if (problem) return setError(problem);
    run(() => auth.updateName(name), 'Name saved.');
  };

  const sync = flow.sync;
  return (
    <Screen noHeader>
      <H1>Your account</H1>
      {auth.notice && <Banner tone="may">{auth.notice}</Banner>}
      {!saved.first && <Banner>Add your name below so LifeBridge can greet you.</Banner>}

      <Card>
        <H2 icon={UserRound}>{saved.first ? `Hi, ${saved.first}!` : 'Signed in'}</H2>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.syncRow}>
          {sync.status === 'error' ? <CloudOff size={18} color={colors.warnText} /> : <CircleCheck size={18} color={colors.goodText} />}
          <Text style={[styles.syncText, sync.status === 'error' && styles.syncError]}>
            {sync.status === 'saving' ? 'Saving to your account…' : sync.status === 'error' ? sync.message : 'Your answers and progress are saved to this account.'}
          </Text>
        </View>
        {savedTopics.map((t) => (
          <Button key={t.id} label={`Open my plan: ${t.short}`} onPress={() => router.push(`/${t.id}/plan`)} />
        ))}
      </Card>

      <Card>
        <H2>Your name</H2>
        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" maxLength={50} />
          </View>
          <View style={styles.nameField}>
            <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" maxLength={50} />
          </View>
        </View>
        <Button label="Save name" kind="secondary" onPress={saveName} busy={busy} />
      </Card>

      {message && <Banner>{message}</Banner>}
      {error && <Banner tone="warn">{error}</Banner>}

      <Button label="Sign out" kind="secondary" onPress={signOut} busy={busy} />

      <Card>
        <H2>Delete your information</H2>
        {confirmDelete === null && (
          <>
            <Button label="Delete my saved plans" kind="quiet" onPress={() => setConfirmDelete('plan')} />
            <Button label="Delete my account" kind="quiet" onPress={() => setConfirmDelete('account')} />
          </>
        )}
        {confirmDelete !== null && (
          <>
            <Banner tone="warn">
              {confirmDelete === 'plan'
                ? 'This deletes your answers and progress for every topic from your account and this device. It can’t be undone.'
                : 'This deletes your account and everything saved to it. It can’t be undone.'}
            </Banner>
            <Button
              label={confirmDelete === 'plan' ? 'Yes, delete my saved plans' : 'Yes, delete my account'}
              onPress={() =>
                run(async () => {
                  if (confirmDelete === 'plan') {
                    for (const t of TOPICS) await flow.resetPack(t.id);
                  } else {
                    const uid = user.id;
                    await auth.deleteAccount();
                    await forgetAll(uid);
                    router.replace('/');
                  }
                  setConfirmDelete(null);
                }, confirmDelete === 'plan' ? 'Your saved plans were deleted.' : undefined)
              }
              busy={busy}
            />
            <Button label="Cancel" kind="quiet" onPress={() => setConfirmDelete(null)} />
          </>
        )}
      </Card>
    </Screen>
  );
}

// --- form fields --------------------------------------------------------------------

function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function PasswordField({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          {...input}
          secureTextEntry={!show}
          autoCapitalize="none"
          accessibilityLabel={label}
          style={[styles.input, styles.passwordInput]}
        />
        <Pressable
          onPress={() => setShow(!show)}
          accessibilityRole="button"
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
          style={styles.eye}
        >
          {show ? <EyeOff size={22} color={colors.primary} /> : <Eye size={22} color={colors.primary} />}
        </Pressable>
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  switcher: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 3 },
  switch: { flex: 1, minHeight: TAP, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  switchOn: { backgroundColor: colors.surface },
  switchText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.muted },
  switchTextOn: { color: colors.primary },
  field: { gap: space.xs },
  label: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.text },
  input: {
    minHeight: TAP + 4,
    fontFamily: fonts.regular,
    fontSize: font.body,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.bg,
  },
  hint: { fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  passwordInput: { flex: 1 },
  eye: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  agree: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.xs },
  agreeText: { flex: 1, fontFamily: fonts.regular, fontSize: font.small, color: colors.text, lineHeight: 20 },
  email: { fontFamily: fonts.semibold, fontSize: font.large, color: colors.text },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  nameField: { flexGrow: 1, flexBasis: 140 },
  senderRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  senderText: { flex: 1, fontFamily: fonts.regular, fontSize: font.small, color: colors.muted, lineHeight: 20 },
  strong: { fontFamily: fonts.semibold },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  syncText: { flex: 1, fontFamily: fonts.regular, fontSize: font.small, color: colors.muted },
  syncError: { color: colors.warnText },
}));
