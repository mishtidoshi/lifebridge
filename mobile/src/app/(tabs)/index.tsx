// Home: every topic LifeBridge covers. "What's happening?" is a text box the server reads
// (rules first, then a small naive Bayes model picks the topic); the topic cards open each
// topic's own page. A photo collage, a "how it works" carousel, and a "good to know"
// question list explain the app.

import { router } from "expo-router";
import {
  FolderOpen,
  Lock,
  Landmark,
  MapPin,
  SkipForward,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { Carousel } from "@/components/Carousel";
import { Collage, type CollagePhoto } from "@/components/Collage";
import { DescribeBox } from "@/components/DescribeBox";
import { Photo } from "@/components/Photo";
import { TipList, type Tip } from "@/components/TipList";
import { TopicCard } from "@/components/TopicCard";
import { Banner, Body, H2, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFlow } from "@/lib/flow";
import { colors, font, fonts, radius, shadow, space, themed } from "@/lib/theme";
import { TOPICS } from "@/lib/topics";
import type { PackSummary } from "@/lib/types";

// Different people and different situations: school, health care, wildfire, floods, disability.
const PEOPLE: [
  CollagePhoto,
  CollagePhoto,
  CollagePhoto,
  CollagePhoto,
  CollagePhoto,
  CollagePhoto,
] = [
  {
    source: require("../../../assets/images/collage-family.jpg"),
    alt: "An older sister helping a younger girl with homework",
  },
  {
    source: require("../../../assets/images/collage-pharmacy.jpg"),
    alt: "A pharmacist showing a pill bottle to an older woman",
  },
  {
    source: require("../../../assets/images/collage-hands.jpg"),
    alt: "A circle of friends in colorful sweaters stacking their hands together",
  },
  {
    source: require("../../../assets/images/topic-disaster.jpg"),
    alt: "Two people hugging next to their car among storm debris",
  },
  {
    source: require("../../../assets/images/collage-wheelchair.jpg"),
    alt: "A young man in a wheelchair reading through papers",
  },
  {
    source: require("../../../assets/images/collage-student.jpg"),
    alt: "A smiling student with braids, a backpack, and headphones outside her school",
  },
];

const HOW_IT_WORKS: {
  image: ImageSourcePropType;
  step: string;
  title: string;
  text: string;
}[] = [
  {
    image: require("../../../assets/images/slide-describe.jpg"),
    step: "1",
    title: "Tell us what's going on",
    text: "In your own words, or by answering a few quick questions.",
  },
  {
    image: require("../../../assets/images/slide-check.jpg"),
    step: "2",
    title: "Check what we understood",
    text: "Fix anything that looks off. It helps to do this part with someone you trust.",
  },
  {
    image: require("../../../assets/images/slide-plan.jpg"),
    step: "3",
    title: "Follow your plan",
    text: "Steps in the right order, one document checklist, and every deadline in one place.",
  },
];

const GOOD_TO_KNOW: Tip[] = [
  {
    icon: SkipForward,
    question: "Not sure about an answer?",
    answer:
      'Skip it. Steps that depend on it are marked "May apply," so nothing gets hidden.',
  },
  {
    icon: Landmark,
    question: "Where does the information come from?",
    answer:
      "Official government sources, like StudentAid.gov, Medicaid.gov, your state, and FEMA. Every step links to its source and shows the date a person last checked it.",
  },
  {
    icon: MapPin,
    question: "Does my state matter?",
    answer:
      "Often, yes. Programs, offices, and deadlines are different in each state, so LifeBridge asks where you live.",
  },
  {
    icon: Lock,
    question: "Is what I type private?",
    answer:
      "Yes. LifeBridge reads it with its own rules and machine-learning models that run on LifeBridge's server, and nothing goes to an AI company. The Terms & Privacy page (at the bottom of every screen) has the details.",
  },
];

export default function Home() {
  const flow = useFlow();
  const auth = useAuth();
  const firstName = auth.user ? auth.name.first : "";
  const [summaries, setSummaries] = useState<Record<string, PackSummary>>({});
  const [examples, setExamples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.packs().then(
      (list) => setSummaries(Object.fromEntries(list.map((p) => [p.id, p]))),
      (e: Error) => setError(e.message),
    );
    // One example from each topic, so it's clear the box handles any of them.
    Promise.all(TOPICS.map((t) => flow.loadPack(t.id))).then(
      (packs) =>
        setExamples(packs.map((p) => p.example_inputs[0]).filter(Boolean)),
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: updates when someone signs in, signs out, or deletes their account.
  const savedTopics = TOPICS.filter((t) => flow.progress[t.id]?.facts);
  const resume = (packId: string) => {
    const saved = flow.progress[packId]?.facts;
    if (saved) {
      flow.setFacts(packId, saved);
      router.push(`/${packId}/plan`);
    }
  };

  return (
    <Screen noHeader>
      <View style={styles.topRow}>
        <View style={styles.brand}>
          <Image
            source={require("../../../assets/images/logo.png")}
            style={styles.logo}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Text style={styles.brandText}>LifeBridge</Text>
        </View>
        {firstName ? <Text style={styles.hello}>Hi, {firstName}!</Text> : null}
      </View>

      <View>
        <Collage photos={PEOPLE} />
        <View style={styles.sticker} accessible={false}>
          <Text style={styles.stickerText}>for U.S. families</Text>
        </View>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          When life changes, know what to do next.
        </Text>
        <Body muted>
          Tell LifeBridge what's going on and it builds a step-by-step
          plan from official sources so you never miss what matters.
        </Body>
      </View>

      {auth.notice && (
        <Pressable
          onPress={auth.clearNotice}
          accessibilityRole="button"
          accessibilityHint="Dismisses this message"
        >
          <Banner tone="may">{auth.notice} (Tap to dismiss.)</Banner>
        </Pressable>
      )}
      {savedTopics.length > 0 && (
        <View style={styles.saved}>
          {savedTopics.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => resume(t.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open my saved plan: ${t.short}`}
              style={({ pressed }) => [
                styles.savedRow,
                pressed && styles.pressed,
              ]}
            >
              <FolderOpen size={20} color={colors.primary} strokeWidth={2.25} />
              <Text style={styles.savedText}>
                Open my plan: <Text style={styles.savedTopic}>{t.short}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <DescribeBox
        examples={examples}
        placeholder="For example: I got a letter saying my Medicaid is up for renewal, and I just moved…"
      />

      <H2 big>Or pick a topic</H2>
      {error && <Banner tone="warn">{error}</Banner>}
      <View style={styles.topics}>
        {TOPICS.map((t) => (
          <TopicCard
            key={t.id}
            topic={t}
            title={summaries[t.id]?.title ?? t.short}
            summary={summaries[t.id]?.summary ?? ""}
            hasPlan={!!flow.progress[t.id]?.facts}
          />
        ))}
      </View>

      <H2 big>How LifeBridge works</H2>
      <Carousel
        label="How LifeBridge works"
        items={HOW_IT_WORKS}
        renderItem={(s) => (
          <View style={styles.slide}>
            <Photo source={s.image} />
            <View style={styles.slideBody}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{s.step}</Text>
              </View>
              <View style={styles.slideText}>
                <Text style={styles.slideTitle}>{s.title}</Text>
                <Text style={styles.slideCopy}>{s.text}</Text>
              </View>
            </View>
          </View>
        )}
      />

      <H2 big>Good to know</H2>
      <TipList tips={GOOD_TO_KNOW} />

      <View style={styles.closing}>
        <Photo
          source={require("../../../assets/images/closing-family.jpg")}
          style={styles.closingImage}
          alt="A mother and her young daughter laughing together outdoors"
        />
        <Text style={styles.closingHand}>you've got this</Text>
        <Body muted>
          Every step you check off is one less thing to worry about.
        </Body>
      </View>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  hello: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.muted },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm },
  logo: { width: 32, height: 32, borderRadius: 8 },
  brandText: {
    fontFamily: fonts.headingHeavy,
    fontSize: font.large,
    color: colors.primary,
  },
  sticker: {
    position: "absolute",
    right: space.md,
    bottom: -space.md,
    backgroundColor: colors.maySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 2,
    transform: [{ rotate: "-3deg" }],
    ...shadow,
  },
  stickerText: { fontFamily: fonts.hand, fontSize: 20, color: colors.mayText },
  intro: { gap: space.sm, marginTop: space.sm },
  title: {
    fontFamily: fonts.headingHeavy,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
  },
  saved: { gap: space.sm },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  savedText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: font.body,
    color: colors.primary,
  },
  savedTopic: { fontFamily: fonts.bold },
  topics: { gap: space.md },
  pressed: { opacity: 0.75 },
  slide: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow,
  },
  slideBody: {
    flexDirection: "row",
    gap: space.md,
    padding: space.lg,
    alignItems: "flex-start",
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontFamily: fonts.headingHeavy,
    fontSize: font.large,
    color: colors.primaryText,
  },
  slideText: { flex: 1, gap: space.xs },
  slideTitle: {
    fontFamily: fonts.heading,
    fontSize: font.large,
    color: colors.text,
  },
  slideCopy: {
    fontFamily: fonts.regular,
    fontSize: font.body,
    color: colors.muted,
    lineHeight: 22,
  },
  closing: { gap: space.sm, marginTop: space.md },
  closingImage: { borderRadius: radius.lg },
  closingHand: {
    fontFamily: fonts.hand,
    fontSize: 30,
    color: colors.primary,
    marginTop: space.xs,
  },
}));
