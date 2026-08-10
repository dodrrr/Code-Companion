import assert from 'node:assert/strict';
import test from 'node:test';

import { removeGateWindow } from '../domain/gateWindows.ts';

const makeWindow = (id) => ({
  id,
  name: `Window ${id}`,
  startHour: 9,
  startMinute: 0,
  endHour: 11,
  endMinute: 0,
  days: [1, 2, 3, 4, 5],
  appIds: [],
});

test('removing a Gate window deletes only the selected window without mutating state', () => {
  const windows = [makeWindow('morning'), makeWindow('deep-work'), makeWindow('wind-down')];
  const next = removeGateWindow(windows, 'deep-work');

  assert.deepEqual(next.map((window) => window.id), ['morning', 'wind-down']);
  assert.deepEqual(windows.map((window) => window.id), ['morning', 'deep-work', 'wind-down']);
});
