// A 3×3 photo grid: one big photo (2×2) and five small ones.
//   [ big  big ][ a ]
//   [ big  big ][ b ]
//   [ c ][ d ][ e ]

import { useState } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { Photo } from '@/components/Photo';
import { radius, themed } from '@/lib/theme';

export interface CollagePhoto {
  source: ImageSourcePropType;
  alt: string;
}

const GAP = 6;

export function Collage({ photos }: { photos: [CollagePhoto, CollagePhoto, CollagePhoto, CollagePhoto, CollagePhoto, CollagePhoto] }) {
  const [width, setWidth] = useState(0);
  const small = (width - 2 * GAP) / 3; // three tiles and two gaps fill the row exactly
  const big = 2 * small + GAP;
  const [main, a, b, c, d, e] = photos;

  const tile = (p: CollagePhoto, size: number) => (
    <Photo source={p.source} alt={p.alt} ratio={1} style={[styles.tile, { width: size }]} />
  );

  return (
    <View onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)} style={styles.grid}>
      {width > 0 && (
        <>
          <View style={styles.row}>
            {tile(main, big)}
            <View style={styles.column}>
              {tile(a, small)}
              {tile(b, small)}
            </View>
          </View>
          <View style={styles.row}>
            {tile(c, small)}
            {tile(d, small)}
            {tile(e, small)}
          </View>
        </>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { width: '100%', gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  column: { gap: GAP },
  tile: { borderRadius: radius.md },
}));
