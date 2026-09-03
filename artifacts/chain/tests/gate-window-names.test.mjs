import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gateWindowDescriptor,
  gateWindowDisplayName,
  gateWindowNameKey,
  isGateWindowNameTaken,
  nextAvailableGateWindowName,
  normalizeGateWindowName,
} from '../domain/gateWindows.ts';

function makeWindow(overrides = {}) {
  return {
    id: 'deep-work',
    name: 'Deep work',
    startHour: 9,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    days: [1, 2, 3, 4, 5],
    appIds: [],
    mode: 'scheduled',
    ...overrides,
  };
}

test('Window names normalize Unicode compatibility forms and contiguous whitespace', () => {
  assert.equal(normalizeGateWindowName('\tＤｅｅｐ\u00a0　work\n'), 'Deep work');
  assert.equal(normalizeGateWindowName('  Cafe\u0301  '), 'Café');
  assert.equal(normalizeGateWindowName('Morning\n\t reset'), 'Morning reset');
  assert.equal(normalizeGateWindowName('   '), '');
});

test('Window name keys use normalized, locale-stable case folding', () => {
  assert.equal(gateWindowNameKey(' DEEP\u00a0WORK '), gateWindowNameKey('ｄｅｅｐ work'));
  assert.equal(gateWindowNameKey('Straße'), gateWindowNameKey('STRASSE'));
  assert.equal(gateWindowNameKey('ΟΣ'), gateWindowNameKey('οσ'));
  assert.equal(gateWindowNameKey('Morning reset'), 'morning reset');
});

test('taken-name checks honor normalization and exclude only the edited Window id', () => {
  const windows = [
    makeWindow({ id: 'first', name: 'Deep work' }),
    makeWindow({ id: 'legacy-copy', name: 'ＤＥＥＰ　ＷＯＲＫ' }),
    makeWindow({ id: 'other', name: 'Wind down' }),
  ];

  assert.equal(isGateWindowNameTaken(' deep\tWORK ', windows), true);
  assert.equal(isGateWindowNameTaken('deep work', windows, 'first'), true);
  assert.equal(isGateWindowNameTaken('deep work', windows, 'legacy-copy'), true);
  assert.equal(isGateWindowNameTaken('wind down', windows, 'other'), false);
  assert.equal(isGateWindowNameTaken('   ', windows), false);
});

test('next available Window names keep the base or fill the first free suffix', () => {
  assert.equal(nextAvailableGateWindowName('  Deep\twork  ', []), 'Deep work');
  assert.equal(nextAvailableGateWindowName('Deep work', [makeWindow()]), 'Deep work 2');

  const withGap = [
    makeWindow({ id: 'base', name: 'DEEP WORK' }),
    makeWindow({ id: 'two', name: 'Deep\u00a0work 2' }),
    makeWindow({ id: 'four', name: 'Ｄｅｅｐ　ｗｏｒｋ　４' }),
  ];
  assert.equal(nextAvailableGateWindowName('Deep work', withGap), 'Deep work 3');
  assert.equal(nextAvailableGateWindowName('Deep work', withGap, 'base'), 'Deep work');

  const suffixWithoutBase = [makeWindow({ id: 'two', name: 'Deep work 2' })];
  assert.equal(nextAvailableGateWindowName('Deep work', suffixWithoutBase), 'Deep work');
  assert.equal(nextAvailableGateWindowName('   ', withGap), '');
});

test('scheduled Window descriptors summarize weekday, daily and custom repeats', () => {
  assert.equal(
    gateWindowDescriptor(makeWindow()),
    'Weekdays · 9:00 AM–11:00 AM',
  );
  assert.equal(
    gateWindowDescriptor(makeWindow({ days: [0, 6, 5, 4, 3, 2, 1] })),
    'Every day · 9:00 AM–11:00 AM',
  );
  assert.equal(
    gateWindowDescriptor(makeWindow({ days: [0, 3, 1, 3], startHour: 22, startMinute: 30, endHour: 0, endMinute: 5 })),
    'Mon, Wed, Sun · 10:30 PM–12:05 AM',
  );
  assert.equal(
    gateWindowDescriptor(makeWindow({ days: [] })),
    'No days · 9:00 AM–11:00 AM',
  );
});

test('on-demand Window descriptors distinguish bounded and open-ended sessions', () => {
  assert.equal(
    gateWindowDescriptor(makeWindow({ mode: 'onDemand', days: [], onDemandDurationMinutes: 90 })),
    'On demand · 1h 30m',
  );
  assert.equal(
    gateWindowDescriptor(makeWindow({ mode: 'onDemand', days: [], onDemandDurationMinutes: null })),
    'On demand · Open-ended',
  );
  assert.equal(
    gateWindowDescriptor(makeWindow({ mode: 'onDemand', days: [], onDemandDurationMinutes: undefined })),
    'On demand · 1h',
  );
});

test('legacy duplicates with the same name key and descriptor receive stable display ordinals', () => {
  const first = makeWindow({ id: 'first', name: 'Deep work' });
  const second = makeWindow({ id: 'second', name: 'DEEP\u00a0WORK' });
  const third = makeWindow({ id: 'third', name: 'Deep work' });
  const windows = [first, second, third];
  const before = structuredClone(windows);

  assert.equal(gateWindowDisplayName(first, windows), 'Deep work · Window 1');
  assert.equal(gateWindowDisplayName(second, windows), 'DEEP\u00a0WORK · Window 2');
  assert.equal(gateWindowDisplayName(third, windows), 'Deep work · Window 3');
  assert.equal(gateWindowDisplayName({ ...second }, windows), 'DEEP\u00a0WORK · Window 2');
  assert.deepEqual(windows, before);
});

test('display ordinals do not combine same-name Windows with different descriptors', () => {
  const weekdays = makeWindow({ id: 'weekdays' });
  const weekend = makeWindow({ id: 'weekend', days: [6, 0] });
  const differentlyNamed = makeWindow({ id: 'other', name: 'Morning reset' });
  const exactCopy = makeWindow({ id: 'copy' });

  assert.equal(gateWindowDisplayName(weekend, [weekdays, weekend]), 'Deep work');
  assert.equal(gateWindowDisplayName(differentlyNamed, [weekdays, differentlyNamed]), 'Morning reset');
  assert.equal(gateWindowDisplayName(weekdays, [weekdays, weekend, exactCopy]), 'Deep work · Window 1');
  assert.equal(gateWindowDisplayName(exactCopy, [weekdays, weekend, exactCopy]), 'Deep work · Window 2');
  assert.equal(gateWindowDisplayName(exactCopy, [exactCopy, weekdays]), 'Deep work · Window 1');
});
