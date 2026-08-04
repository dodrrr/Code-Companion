import { useColorScheme } from 'react-native';
import { usePathname } from 'expo-router';
import colors from '@/constants/colors';

export type SectionTone = 'today' | 'gate' | 'plan' | 'neutral';

export const SECTION_ACCENTS: Record<SectionTone, string> = {
  today: '#FF6B35',
  gate: '#A855F7',
  plan: '#4A8CFF',
  neutral: '#FF6B35',
};

function toneForPath(pathname: string): SectionTone {
  if (pathname.includes('gate') || pathname.includes('pause-gate')) return 'gate';
  if (pathname.includes('plan')) return 'plan';
  return 'today';
}

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors(explicitTone?: SectionTone) {
  const scheme = useColorScheme();
  const pathname = usePathname();
  const palette =
    scheme === 'dark' && 'dark' in colors
      ? ((colors as unknown) as Record<string, typeof colors.light>).dark
      : colors.light;
  const sectionTone = explicitTone ?? toneForPath(pathname);
  const sectionAccent = SECTION_ACCENTS[sectionTone];
  return {
    ...palette,
    primary: sectionAccent,
    tint: sectionAccent,
    accent: sectionAccent,
    sectionTone,
    sectionAccent,
    radius: colors.radius,
  };
}
