/**
 * Chain's visual grammar. Keep this intentionally small: a premium interface
 * comes from repeating a few deliberate decisions, not from accumulating
 * one-off values in every screen.
 */
export const SPACE = {
  hairline: 2,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const RADIUS = {
  compact: 12,
  control: 16,
  button: 18,
  card: 22,
  hero: 24,
  modal: 26,
  sheet: 28,
  large: 32,
  capsule: 999,
} as const;

export const CONTROL = {
  minimumTarget: 44,
  buttonHeight: 50,
  prominentButtonHeight: 54,
  screenHorizontal: 20,
  tabContentInset: 88,
} as const;

export const TYPE = {
  screenTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.7,
  },
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.8,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: 'Inter_600SemiBold',
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_600SemiBold',
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
  },
  metadata: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
  },
} as const;

export const MOTION = {
  pressIn: 110,
  quick: 140,
  standard: 220,
  deliberate: 360,
  hold: 900,
  spring: { damping: 22, stiffness: 260, mass: 0.7 },
  calmSpring: { damping: 24, stiffness: 220, mass: 0.78 },
} as const;

export const OPACITY = {
  pressed: 0.78,
  disabled: 0.46,
  secondaryPressed: 0.68,
} as const;

export const SCRIM = 'rgba(0,0,0,0.72)';
