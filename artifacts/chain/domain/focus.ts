export const FOCUS_SESSION_VERSION = 1 as const;

export interface FocusSessionSnapshot {
  version: typeof FOCUS_SESSION_VERSION;
  itemId: string;
  planDate: string;
  targetSeconds: number;
  accumulatedSeconds: number;
  runningSince?: number;
  updatedAt: number;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function decodeFocusSession(value: unknown): FocusSessionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<FocusSessionSnapshot>;
  if (
    session.version !== FOCUS_SESSION_VERSION ||
    typeof session.itemId !== 'string' ||
    !session.itemId ||
    typeof session.planDate !== 'string' ||
    !session.planDate ||
    !finiteNonNegative(session.targetSeconds) ||
    session.targetSeconds < 1 ||
    !finiteNonNegative(session.accumulatedSeconds) ||
    !finiteNonNegative(session.updatedAt) ||
    (session.runningSince !== undefined && !finiteNonNegative(session.runningSince))
  ) {
    return null;
  }

  return {
    version: FOCUS_SESSION_VERSION,
    itemId: session.itemId,
    planDate: session.planDate,
    targetSeconds: Math.round(session.targetSeconds),
    accumulatedSeconds: Math.min(
      Math.round(session.accumulatedSeconds),
      Math.round(session.targetSeconds),
    ),
    runningSince: session.runningSince,
    updatedAt: session.updatedAt,
  };
}

export function createFocusSession(
  itemId: string,
  planDate: string,
  targetSeconds: number,
  now: number,
): FocusSessionSnapshot {
  return {
    version: FOCUS_SESSION_VERSION,
    itemId,
    planDate,
    targetSeconds: Math.max(1, Math.round(targetSeconds)),
    accumulatedSeconds: 0,
    runningSince: now,
    updatedAt: now,
  };
}

export function getFocusElapsedSeconds(session: FocusSessionSnapshot, now: number): number {
  const runningSeconds = session.runningSince === undefined
    ? 0
    : Math.max(0, Math.floor((now - session.runningSince) / 1000));
  return Math.min(session.targetSeconds, session.accumulatedSeconds + runningSeconds);
}

export function pauseFocusSession(
  session: FocusSessionSnapshot,
  now: number,
): FocusSessionSnapshot {
  return {
    ...session,
    accumulatedSeconds: getFocusElapsedSeconds(session, now),
    runningSince: undefined,
    updatedAt: now,
  };
}

export function resumeFocusSession(
  session: FocusSessionSnapshot,
  now: number,
): FocusSessionSnapshot {
  if (getFocusElapsedSeconds(session, now) >= session.targetSeconds) {
    return pauseFocusSession(session, now);
  }
  return {
    ...session,
    runningSince: now,
    updatedAt: now,
  };
}
