export const CLOCK_MINUTE_OPTIONS: readonly number[] = Object.freeze(
  Array.from({ length: 12 }, (_, index) => index * 5),
);

export function isClockMinuteOption(minute: number): boolean {
  return Number.isInteger(minute) && CLOCK_MINUTE_OPTIONS.includes(minute);
}
