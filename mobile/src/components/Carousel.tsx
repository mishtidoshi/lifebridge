// A swipeable row of slides with arrows and dots, so it works with touch, mouse, and keyboard.
// It never moves on its own: auto-advancing slides are hard to read and to use with a screen reader.

import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { colors, radius, shadow, space, TAP, themed } from '@/lib/theme';

interface Props<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  label: string; // what the carousel is, for screen readers ("How LifeBridge works")
  slideWidth?: number; // fraction of the available width per slide (1 = full width, 0.82 = peek at the next one)
}

export function Carousel<T>({ items, renderItem, label, slideWidth = 1 }: Props<T>) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const gap = slideWidth < 1 ? space.md : 0;
  const slide = Math.round(width * slideWidth);
  const step = slide + gap; // distance from one slide to the next

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    scroller.current?.scrollTo({ x: next * step, animated: true });
    setIndex(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (step > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / step));
  };

  return (
    <View accessibilityLabel={label} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{ gap, paddingRight: width - slide }}
        >
          {items.map((item, i) => (
            <View
              key={i}
              style={{ width: slide }}
              accessibilityLabel={`${i + 1} of ${items.length}`}
              importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
            >
              {renderItem(item, i)}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.controls}>
        <ArrowButton direction="left" disabled={index === 0} onPress={() => goTo(index - 1)} />
        <View style={styles.dots}>
          {items.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${i + 1} of ${items.length}`}
              accessibilityState={{ selected: i === index }}
              hitSlop={10}
              style={styles.dotHit}
            >
              <View style={[styles.dot, i === index && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
        <ArrowButton direction="right" disabled={index === items.length - 1} onPress={() => goTo(index + 1)} />
      </View>
    </View>
  );
}

function ArrowButton({ direction, disabled, onPress }: { direction: 'left' | 'right'; disabled: boolean; onPress: () => void }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'left' ? 'Previous' : 'Next'}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.arrow, disabled && styles.arrowOff, pressed && styles.pressed]}
    >
      <Icon size={22} color={colors.primary} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dotHit: { padding: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
  arrow: {
    width: TAP,
    height: TAP,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  arrowOff: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
}));
