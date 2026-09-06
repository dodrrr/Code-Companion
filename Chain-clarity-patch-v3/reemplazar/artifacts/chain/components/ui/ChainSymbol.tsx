import React from 'react';
import Svg, { Path } from 'react-native-svg';

export type ChainSymbolName = 'add' | 'check' | 'minimum' | 'rest' | 'freeze' | 'empty';

/**
 * A small, consistent family for Chain actions and day states.
 * Shared 24-unit grid, round caps and round joins on every platform.
 * These glyphs are decorative; the parent control owns its accessible label.
 */
const SYMBOL_PATHS: Record<ChainSymbolName, readonly string[]> = {
  add: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12.5 9.5 17 19 7'],
  minimum: [
    'M19.5 4.5c-4.1.1-8.4-.2-11.2 2.6-2.6 2.6-2.5 6.5-.1 8.8 2.3 2.3 6.2 2.5 8.8-.1 2.8-2.8 2.5-7.1 2.5-11.3Z',
    'M5 19 14.5 9.5',
  ],
  rest: ['M20 14.1A8.4 8.4 0 0 1 9.9 4a8.4 8.4 0 1 0 10.1 10.1Z'],
  freeze: [
    'M12 3v18',
    'M4.2 7.5 19.8 16.5',
    'M4.2 16.5 19.8 7.5',
    'M9.7 4.5 12 6.8 14.3 4.5',
    'M9.7 19.5 12 17.2 14.3 19.5',
    'M4.4 10.2 7.6 9.5 7.1 6.3',
    'M16.9 17.7 16.4 14.5 19.6 13.8',
    'M4.4 13.8 7.6 14.5 7.1 17.7',
    'M16.9 6.3 16.4 9.5 19.6 10.2',
  ],
  empty: ['M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 1 1 17 0'],
};

export function ChainSymbol({
  name,
  size,
  color,
}: {
  name: ChainSymbolName;
  size: number;
  color: string;
}) {
  // Tiny history markers keep a readable stroke without growing the control.
  const strokeWidth = size <= 14 ? 2.2 : 1.9;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {SYMBOL_PATHS[name].map((d, index) => (
        <Path
          key={index}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
