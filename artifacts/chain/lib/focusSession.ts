import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeFocusSession, type FocusSessionSnapshot } from '@/domain/focus';

const FOCUS_SESSION_KEY_PREFIX = '@chain_focus_session_v1_';
const focusSessionQueues = new Map<string, Promise<void>>();

function focusSessionKey(itemId: string) {
  return `${FOCUS_SESSION_KEY_PREFIX}${encodeURIComponent(itemId)}`;
}

function enqueueFocusSessionOperation<T>(itemId: string, operation: () => Promise<T>): Promise<T> {
  const previous = focusSessionQueues.get(itemId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  focusSessionQueues.set(itemId, result.then(() => undefined, () => undefined));
  return result;
}

export async function readFocusSession(itemId: string): Promise<FocusSessionSnapshot | null> {
  return enqueueFocusSessionOperation(itemId, async () => {
    const raw = await AsyncStorage.getItem(focusSessionKey(itemId));
    if (!raw) return null;
    try {
      return decodeFocusSession(JSON.parse(raw));
    } catch {
      return null;
    }
  });
}

export function writeFocusSession(session: FocusSessionSnapshot): Promise<void> {
  return enqueueFocusSessionOperation(session.itemId, () =>
    AsyncStorage.setItem(focusSessionKey(session.itemId), JSON.stringify(session))
  );
}

export function removeFocusSession(itemId: string): Promise<void> {
  return enqueueFocusSessionOperation(itemId, () =>
    AsyncStorage.removeItem(focusSessionKey(itemId))
  );
}
