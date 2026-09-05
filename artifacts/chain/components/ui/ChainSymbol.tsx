import React, { type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ChainSymbolName = 'add' | 'check' | 'minimum';

const SYMBOLS: Record<ChainSymbolName, { ios: SFSymbol; fallback: IoniconName }> = {
  add: { ios: 'plus', fallback: 'add' },
  check: { ios: 'checkmark', fallback: 'checkmark' },
  minimum: { ios: 'leaf', fallback: 'leaf-outline' },
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
  const symbol = SYMBOLS[name];

  return (
    <SymbolView
      accessible={false}
      name={symbol.ios}
      size={size}
      tintColor={color}
      weight="semibold"
      fallback={<Ionicons accessible={false} name={symbol.fallback} size={size} color={color} />}
    />
  );
}
