import { useColorScheme } from 'react-native';
import { usePathname } from 'expo-router';
import colors from '@/constants/colors';
import { readableTextColor, SECTION_ACCENTS, SectionTone } from '@/constants/sectionTheme';

export { SECTION_ACCENTS, SectionTone } from '@/constants/sectionTheme';

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
  const sectionAccentForeground = readableTextColor(sectionAccent);
  return {
    ...palette,
    primary: sectionAccent,
    primaryForeground: sectionAccentForeground,
    tint: sectionAccent,
    accent: sectionAccent,
    accentForeground: sectionAccentForeground,
    sectionTone,
    sectionAccent,
    radius: colors.radius,
  };
}
