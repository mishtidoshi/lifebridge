// A photo in a fixed-shape frame. The frame sets the size; the image fills it (cropping as needed).
// (Putting aspectRatio on <Image> directly is ignored on the web, where it shows at full height.)

import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { themed } from '@/lib/theme';

interface Props {
  source: ImageSourcePropType;
  alt?: string; // leave out for decorative photos, so screen readers skip them
  ratio?: number; // width / height
  style?: StyleProp<ViewStyle>;
}

export function Photo({ source, alt, ratio = 3 / 2, style }: Props) {
  return (
    <View style={[styles.frame, { aspectRatio: ratio }, style]} accessible={!!alt} accessibilityLabel={alt} accessibilityRole={alt ? 'image' : undefined}>
      <Image source={source} style={styles.image} resizeMode="cover" accessible={false} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
}));
