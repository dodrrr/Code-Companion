export const SECTION_ACCENTS = {
  today: '#FF6B35',
  gate: '#A970FF',
  plan: '#5B8CFF',
  neutral: '#9B9BA1',
} as const;

export type SectionTone = keyof typeof SECTION_ACCENTS;

export const AMBIENT_ACCENTS = {
  ...SECTION_ACCENTS,
  focus: SECTION_ACCENTS.today,
} as const;

export type AmbientTone = keyof typeof AMBIENT_ACCENTS;

type RGB = readonly [red: number, green: number, blue: number];

function parseHexColor(color: string): RGB | null {
  const value = color.trim().replace(/^#/, '');
  let expanded: string;
  if (value.length === 3 || value.length === 4) {
    expanded = value.slice(0, 3).split('').map((character) => character + character).join('');
  } else if (value.length === 6 || value.length === 8) {
    expanded = value.slice(0, 6);
  } else {
    return null;
  }
  if (expanded.length !== 6 || !/^[0-9a-f]{6}$/i.test(expanded)) return null;
  const parsed = Number.parseInt(expanded, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function relativeLuminance(color: string): number | null {
  const rgb = parseHexColor(color);
  if (!rgb) return null;
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHexColor(color: string, target: string, amount: number): string | null {
  const sourceRgb = parseHexColor(color);
  const targetRgb = parseHexColor(target);
  if (!sourceRgb || !targetRgb) return null;
  const channel = (index: number) => Math.round(sourceRgb[index] + (targetRgb[index] - sourceRgb[index]) * amount)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
}

/** WCAG contrast ratio. Invalid colors safely return the minimum ratio (1). */
export function contrastRatio(colorA: string, colorB: string): number {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  if (luminanceA === null || luminanceB === null) return 1;
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Picks whichever neutral text color has the stronger WCAG contrast. */
export function readableTextColor(
  backgroundColor: string,
  lightText = '#FFFFFF',
  darkText = '#111114',
): string {
  const lightContrast = contrastRatio(backgroundColor, lightText);
  const darkContrast = contrastRatio(backgroundColor, darkText);
  return darkContrast > lightContrast ? darkText : lightText;
}

/**
 * Preserves an accent's hue when it is used as text on a surface, lightening
 * or darkening only as much as needed to reach WCAG AA contrast.
 */
export function readableAccentColor(
  accentColor: string,
  surfaceColor: string,
  minimumContrast = 4.5,
): string {
  if (contrastRatio(accentColor, surfaceColor) >= minimumContrast) return accentColor;
  const target = contrastRatio('#FFFFFF', surfaceColor) >= contrastRatio('#111114', surfaceColor)
    ? '#FFFFFF'
    : '#111114';
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mixHexColor(accentColor, target, step / 10);
    if (candidate && contrastRatio(candidate, surfaceColor) >= minimumContrast) return candidate;
  }
  return target;
}

export const AMBIENT_COMPANIONS: Record<AmbientTone, readonly [string, string]> = {
  today: ['#B76A48', '#343037'],
  gate: ['#7655A8', '#302A3A'],
  plan: ['#4268A8', '#28313F'],
  focus: ['#B76A48', '#343037'],
  neutral: ['#4E5561', '#292C33'],
};
