import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Tab-only symbols follow the supplied original iOS navigation reference. */
export function TabSymbol({ name, focused, color, size = 26 }: {
  name: 'link' | 'shield' | 'moon'; focused: boolean; color: string; size?: number;
}) {
  const paths = name === 'link' ? [
    'M9.5 14.5a4.5 4.5 0 0 0 6.36 0l4-4a4.5 4.5 0 0 0-6.36-6.36l-2.2 2.2',
    'M14.5 9.5a4.5 4.5 0 0 0-6.36 0l-4 4a4.5 4.5 0 0 0 6.36 6.36l2.2-2.2',
  ] : name === 'shield' ? ['M12 2.5 20.5 6v7c0 4.5-8.5 8.5-8.5 8.5S3.5 17.5 3.5 13V6Z']
    : ['M20.8 15.2A8.7 8.7 0 0 1 8.8 3.2a9 9 0 1 0 12 12Z'];
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
    {paths.map((d, index) => <Path key={index} d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill={focused && name !== 'link' ? color : 'none'} />)}
  </Svg>;
}
