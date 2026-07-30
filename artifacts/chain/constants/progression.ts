export const PROGRESSION_STAGES = [
  { at: 0, key: 'starting-line', label: 'Starting line', copy: 'A small promise is enough to begin.' },
  { at: 1, key: 'first-proof', label: 'First proof', copy: 'You showed up. Come back once more.' },
  { at: 2, key: 'early-pattern', label: 'Early pattern', copy: 'Two marks are the start of a pattern.' },
  { at: 3, key: 'taking-shape', label: 'Taking shape', copy: 'The habit is beginning to have a pulse.' },
  { at: 5, key: 'making-room', label: 'Making room', copy: 'You are creating space for this in your day.' },
  { at: 7, key: 'full-week', label: 'A full week', copy: 'Seven deliberate returns to yourself.' },
  { at: 14, key: 'momentum', label: 'Momentum', copy: 'The pattern is beginning to carry you.' },
  { at: 21, key: 'part-of-week', label: 'Part of the week', copy: 'This now has a place in your life.' },
  { at: 30, key: 'real-habit', label: 'A real habit', copy: 'You built more than motivation.' },
  { at: 60, key: 'rooted', label: 'Rooted', copy: 'You keep the promise on ordinary days.' },
  { at: 100, key: 'proven', label: 'Proven', copy: 'Consistency is no longer a question.' },
  { at: 365, key: 'year-one', label: 'Year one', copy: 'A year of becoming who you said you would be.' },
] as const;

export function getProgressionStage(streak: number) {
  return [...PROGRESSION_STAGES].reverse().find((stage) => streak >= stage.at) ?? PROGRESSION_STAGES[0];
}

export function getNextProgressionStage(streak: number) {
  return PROGRESSION_STAGES.find((stage) => stage.at > streak);
}
