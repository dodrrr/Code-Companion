import assert from 'node:assert/strict';
import test from 'node:test';
import { captureBackup, parseBackup, restoreBackup, recoverInterruptedRestore } from '../domain/backup.ts';

class Store {
  values = new Map();
  failKey;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error('Quota exceeded'); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
test('exports all Chain data and restores an exact snapshot while preserving unrelated storage', () => {
  const store = new Store();
  store.setItem('@chain_plan_store', '{"days":{}}');
  store.setItem('@chain_focus_session_v1_task', '{"runningSince":123}');
  store.setItem('other-app', 'untouched');
  const backup = parseBackup(JSON.stringify(captureBackup(store)));
  store.setItem('@chain_newer', 'extra');
  store.setItem('@chain_plan_store', 'changed');
  restoreBackup(store, backup);
  assert.equal(store.getItem('@chain_newer'), null);
  assert.equal(store.getItem('@chain_plan_store'), '{"days":{}}');
  assert.equal(store.getItem('@chain_focus_session_v1_task'), '{"runningSince":123}');
  assert.equal(store.getItem('other-app'), 'untouched');
});
test('failed import rolls back without deleting existing data', () => {
  const store = new Store();
  store.setItem('@chain_v2', 'original');
  const backup = { app: 'chain', version: 1, createdAt: new Date().toISOString(), entries: [['@chain_new', 'one'], ['@chain_fail', 'two']] };
  store.failKey = '@chain_fail';
  assert.throws(() => restoreBackup(store, backup), /Quota/);
  assert.equal(store.getItem('@chain_v2'), 'original');
  assert.equal(store.getItem('@chain_new'), null);
  assert.equal(store.getItem('chain.restore-journal.v1'), null);
});
test('interrupted import is recovered before data providers load', () => {
  const store = new Store(); store.setItem('@chain_v2', 'original');
  store.setItem('chain.restore-journal.v1', JSON.stringify(captureBackup(store)));
  store.setItem('@chain_v2', 'partial');
  recoverInterruptedRestore(store);
  assert.equal(store.getItem('@chain_v2'), 'original');
  assert.equal(store.getItem('chain.restore-journal.v1'), null);
});
test('backup parser rejects foreign keys, duplicate keys and future versions', () => {
  const backup = { app: 'chain', version: 1, createdAt: 'today', entries: [['foreign-key', 'x']] };
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid/);
  backup.entries = [['@chain_v2', 'a'], ['@chain_v2', 'b']];
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid/);
  backup.version = 2;
  assert.throws(() => parseBackup(JSON.stringify(backup)), /supported/);
});
