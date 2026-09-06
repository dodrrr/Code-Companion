export const PROGRESSION_STAGES = [
  { at: 0, key: 'starting-line', label: 'Starting line', copy: 'A small promise is enough to begin.' },
  { at: 1, key: 'first-proof', label: 'First proof', copy: 'You showed up. Come back once more.' },
  { at: 2, key: 'early-pattern', label: 'Early pattern', copy: 'Your progress is beginning to show.' },
  { at: 3, key: 'taking-shape', label: 'Taking shape', copy: 'The habit is beginning to have a pulse.' },
  { at: 5, key: 'making-room', label: 'Making room', copy: 'You are creating space for this in your day.' },
  { at: 7, key: 'full-week', label: 'Steady returns', copy: 'Your progress is becoming a pattern.' },
  { at: 14, key: 'momentum', label: 'Momentum', copy: 'The pattern is beginning to carry you.' },
  { at: 21, key: 'part-of-week', label: 'Making progress', copy: 'You are making space for what matters.' },
  { at: 30, key: 'real-habit', label: 'Finding rhythm', copy: 'You are building a record of returning.' },
  { at: 60, key: 'rooted', label: 'Rooted', copy: 'You keep the promise on ordinary days.' },
  { at: 100, key: 'proven', label: 'Proven', copy: 'Many returns have brought you here.' },
  { at: 365, key: 'year-one', label: 'Long view', copy: 'Your progress has a long history.' },
] as const;

export function getProgressionStage(streak: number) {
  return [...PROGRESSION_STAGES].reverse().find((stage) => streak >= stage.at) ?? PROGRESSION_STAGES[0];
}

export function getNextProgressionStage(streak: number) {
  return PROGRESSION_STAGES.find((stage) => stage.at > streak);
}

/** A streak counts kept periods, not elapsed calendar time. */
export function formatStreakCount(value: number, cadence: 'daily' | 'weekly'): string {
  const unit = cadence === 'weekly' ? 'week' : 'day';
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}
