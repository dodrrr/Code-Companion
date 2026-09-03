import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  decodeGateWindowsState,
  emptyGateWindowsState,
  GATE_WINDOWS_SCHEMA_VERSION,
  getGateWindowDayMinutesFromState,
  getGateWindowWeekMinutesFromState,
  transitionGateWindowsState,
  type GateWindow,
  type GateWindowsState,
} from '../domain/gateWindows';
import { reportDiagnostic } from './diagnostics';
import { createVersionedRepository } from './versionedRepository';

export {
  canToggleGateWindowSkip,
  formatGateHour,
  formatGateWindowMinutes,
  gateDateKey,
  gateWindowDescriptor,
  gateWindowDisplayName,
  gateWindowDurationMinutes,
  gateWindowNameKey,
  gateWindowSchedule,
  getGateWindowStatus,
  isGateWindowNameTaken,
  nextAvailableGateWindowName,
  normalizeGateWindowName,
  removeGateWindow,
  startGateWindowOnDemand,
  endGateWindowOnDemand,
  syncGateWindowProgress,
  toggleGateWindowSkipToday,
} from '../domain/gateWindows';
export type { GateWindow, GateWindowStatus } from '../domain/gateWindows';

const GATE_WINDOWS_KEY = '@chain_gate_windows';

const repository = createVersionedRepository<GateWindowsState>({
  storage: AsyncStorage,
  key: GATE_WINDOWS_KEY,
  version: GATE_WINDOWS_SCHEMA_VERSION,
  decode: decodeGateWindowsState,
  empty: emptyGateWindowsState,
});

let cachedState = emptyGateWindowsState();
let hasLoadedState = false;
let saveGeneration = 0;
let operationQueue: Promise<void> = Promise.resolve();

export type GateWindowsLoadResult =
  | { status: 'ready'; windows: GateWindow[] }
  | { status: 'failed'; windows: GateWindow[]; error: unknown };

export async function getGateWindowsSnapshot(): Promise<GateWindowsLoadResult> {
  try {
    await operationQueue.catch(() => undefined);
    const result = await repository.readWithMetadata();
    if (result.source === 'invalid' || result.source === 'unsupported') {
      const error = new Error(result.source === 'unsupported'
        ? 'Gate Windows were written by a newer app version'
        : 'Gate Windows storage and backup could not be decoded');
      reportDiagnostic({ area: 'gate', operation: 'windows.readInvalidRepository', severity: 'error', error });
      return { status: 'failed', windows: hasLoadedState ? cachedState.windows : [], error };
    }
    cachedState = result.value;
    hasLoadedState = true;
    return { status: 'ready', windows: cachedState.windows };
  } catch (error) {
    reportDiagnostic({ area: 'gate', operation: 'windows.read', severity: 'error', error });
    return { status: 'failed', windows: hasLoadedState ? cachedState.windows : [], error };
  }
}

export async function getGateWindows(): Promise<GateWindow[]> {
  return (await getGateWindowsSnapshot()).windows;
}

/**
 * Save the editable Window collection in a serialized, versioned envelope.
 * Observations belonging to removed Windows are archived in the same atomic payload.
 */
export function saveGateWindows(windows: GateWindow[]): Promise<void> {
  const generation = ++saveGeneration;

  operationQueue = operationQueue.catch(() => undefined).then(async () => {
    try {
      const persisted = await repository.read();
      const nextState = transitionGateWindowsState(persisted, windows);
      await repository.write(nextState);
      if (generation === saveGeneration) {
        cachedState = nextState;
        hasLoadedState = true;
      }
    } catch (error) {
      reportDiagnostic({ area: 'gate', operation: 'windows.write', severity: 'error', error });
      throw error;
    }
  });
  return operationQueue;
}

/** Includes archived observations from deleted Windows after the initial repository read. */
export function getGateWindowWeekMinutes(windows: GateWindow[], date = new Date()) {
  return getGateWindowWeekMinutesFromState(windows, cachedState.archivedMinutesByWindow, date);
}

/** Includes the current and archived timer ledger for one local calendar day. */
export function getGateWindowDayMinutes(windows: GateWindow[], date = new Date()) {
  return getGateWindowDayMinutesFromState(windows, cachedState.archivedMinutesByWindow, date);
}
