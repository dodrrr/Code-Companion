import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  decodeGateRules,
  GATE_RULES_SCHEMA_VERSION,
  normalizeGateRule,
  type GateRule,
  type GateRules,
} from '../domain/gateRules';
import { createVersionedRepository } from './versionedRepository';

const GATE_RULES_KEY = '@chain_gate_rules';

const repository = createVersionedRepository<GateRules>({
  storage: AsyncStorage,
  key: GATE_RULES_KEY,
  version: GATE_RULES_SCHEMA_VERSION,
  decode: decodeGateRules,
  empty: () => ({}),
});

function normalizeAppId(value: string): string {
  const appId = value.trim();
  if (!appId || appId.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(appId)) {
    throw new Error('A valid Gate app id is required');
  }
  return appId;
}

/** Reads and, when needed, atomically migrates the legacy unversioned record. */
export function getGateRules(): Promise<GateRules> {
  return repository.read();
}

export function saveGateRules(rules: GateRules): Promise<void> {
  return repository.write(rules);
}

export function setGateRule(appId: string, rule: GateRule): Promise<GateRules> {
  const key = normalizeAppId(appId);
  const normalized = normalizeGateRule(rule);
  if (normalized === null) return Promise.reject(new Error('A valid Gate rule is required'));
  return repository.update((current) => ({ ...current, [key]: normalized }));
}

export function removeGateRule(appId: string): Promise<GateRules> {
  const key = normalizeAppId(appId);
  return repository.update((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
}
