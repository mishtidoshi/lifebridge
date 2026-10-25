// Terms of Use and Privacy Policy, in plain language. Everything here describes what the app
// actually does; if the app changes, update this page and LEGAL_UPDATED in src/lib/legal.ts.

import { FileText, ShieldCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Card, H1, H2, Screen } from '@/components/ui';
import { EMAIL_SENDER } from '@/lib/auth';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal';
import { colors, font, fonts, space, themed } from '@/lib/theme';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.p}>•</Text>
      <Text style={[styles.p, styles.bulletText]}>{children}</Text>
    </View>
  );
}

export default function Legal() {
  return (
    <Screen>
      <H1>Terms & Privacy</H1>
      <Body muted>Last updated {LEGAL_UPDATED}</Body>

      <Card>
        <H2 icon={FileText}>Terms of Use</H2>

        <Section title="What LifeBridge is">
          <P>
            LifeBridge is a free student project made for the Congressional App Challenge. It is not a government
            website and isn't connected to any government agency, college, or program like the FAFSA, Medicaid, or
            FEMA.
          </P>
          <P>
            LifeBridge helps you plan. It doesn't decide whether you qualify for anything: only agencies, colleges,
            and insurance companies make those decisions. Information can be incomplete or change, so always confirm
            with the official source linked on each step or with the office in charge (like a financial aid office or
            your Medicaid office). LifeBridge is not legal, medical, financial, or immigration advice, and it isn't
            for emergencies: if you're in danger, call 911.
          </P>
        </Section>

        <Section title="Using LifeBridge">
          <Bullet>Use LifeBridge for your own (or your family's) planning.</Bullet>
          <Bullet>Don't try to get into other people's accounts or interfere with the app.</Bullet>
          <Bullet>LifeBridge may change, or stop being available, at any time.</Bullet>
        </Section>

        <Section title="Accounts">
          <Bullet>Accounts are optional. You can use everything without one.</Bullet>
          <Bullet>You must be 13 or older to create an account.</Bullet>
          <Bullet>Keep your password private. You're responsible for what happens in your account.</Bullet>
          <Bullet>
            Your saved plans are encrypted with your password. If you forget your password and reset it, your old saved
            plans can’t be opened, and you’ll start new ones.
          </Bullet>
          <Bullet>You can delete your account at any time from the account page.</Bullet>
        </Section>

        <Section title="No guarantees">
          <P>
            LifeBridge is provided as is. We work to keep it accurate, but we can't promise it's complete or error-free,
            and we're not responsible for missed deadlines or for decisions made by agencies, colleges, or insurers.
          </P>
        </Section>
      </Card>

      <Card>
        <H2 icon={ShieldCheck}>Privacy Policy</H2>

        <Section title="The short version">
          <Bullet>No ads. We never sell your information.</Bullet>
          <Bullet>Nothing you type is sent to an AI company.</Bullet>
          <Bullet>If you make an account, your plan and name are encrypted so only you can read them.</Bullet>
        </Section>

        <Section title="What you type in “What's happening?”">
          <P>
            LifeBridge's own reader (on our server) uses rules and machine-learning models that LifeBridge built and
            trained only on its own topics. They pick the topic and fill in answers like “senior” or “Texas,” even
            with typos. Answers the models guess are marked so you can check them. Your words are not stored or
            logged, they're never used to train anything, and they're never sent to an AI company. Please don't type
            your Social Security number.
          </P>
        </Section>

        <Section title="Your answers">
          <P>
            To build your plan, your answers are sent to our server, used right away, and not stored there. Most
            questions are optional. You can skip them or choose “Not sure.” Some questions are sensitive, like
            immigration status or health conditions; answering them is up to you.
          </P>
        </Section>

        <Section title="On your device">
          <P>
            Your answers, progress, checklist, and any dates you type are saved in your browser or phone so your plan
            is there next time. If you use LifeBridge without an account, this is the only place they're saved.
          </P>
        </Section>

        <Section title="If you create an account">
          <P>
            Accounts use Supabase, a service that stores account information for us. It stores your email address (so
            you can sign in and get account emails) and your saved plan and name, encrypted.
          </P>
          <P>
            Your plan and name are encrypted on your own device with a key made from your password, before they're
            sent. Supabase, and anyone running LifeBridge, only sees scrambled data. The name you enter when you sign
            up is kept readable only until your first sign-in, when it's encrypted.
          </P>
          <P>Account emails, like confirming your email or resetting your password, come from {EMAIL_SENDER}.</P>
        </Section>

        <Section title="Who we share information with">
          <P>
            No one, except Supabase as described above, which stores account data for us. We don't share your
            information with government agencies, colleges, insurers, employers, or advertisers.
          </P>
        </Section>

        <Section title="Children">
          <P>
            LifeBridge is meant for students, adults, and families. Accounts are only for people
            13 and older, and we don't knowingly collect information from children under 13.
          </P>
        </Section>

        <Section title="Deleting your information">
          <Bullet>“Start over” on your plan clears it.</Bullet>
          <Bullet>Signing out removes your account's plan and key from that device.</Bullet>
          <Bullet>“Delete my saved plans” and “Delete my account” on the account page remove your data from our servers.</Bullet>
        </Section>

        <Section title="Security">
          <P>
            Information travels over a secure (HTTPS) connection, saved plans are encrypted, and the database only lets
            each person reach their own data. No system is perfectly secure, so use a strong password you don't use
            anywhere else.
          </P>
        </Section>

        <Section title="Changes and questions">
          <P>If this policy changes, we'll update it here and change the date at the top.</P>
          {!!CONTACT_EMAIL && <P>Questions about your information? Email {CONTACT_EMAIL}.</P>}
        </Section>
      </Card>

      <Card>
        <H2>Credits</H2>
        <P>
          Photos from Unsplash and StockSnap. Icons from Lucide.
          Fonts: Fraunces, Nunito, and Caveat (Google Fonts).
        </P>
      </Card>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  section: { gap: space.xs, marginTop: space.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: font.large, color: colors.text },
  p: { fontFamily: fonts.regular, fontSize: font.body, lineHeight: 24, color: colors.text },
  bulletRow: { flexDirection: 'row', gap: space.sm },
  bulletText: { flex: 1 },
}));
