const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const appStoreMode = process.argv.includes('--app-store');
const failures = [];
const checks = [
  ['App name', Boolean(app.name)],
  ['URL scheme', Boolean(app.scheme)],
  ['iOS bundle identifier', Boolean(app.ios?.bundleIdentifier)],
  ['Privacy policy URL', Boolean(app.extra?.privacyPolicyUrl), true],
  ['Support URL', Boolean(app.extra?.supportUrl), true],
  ['EAS profiles', fs.existsSync(path.join(root, 'eas.json'))],
  ['Privacy draft', fs.existsSync(path.join(root, 'docs/privacy-policy-draft.md'))],
  ['Support draft', fs.existsSync(path.join(root, 'docs/support-page-draft.md'))],
];

for (const [label, passed, external] of checks) {
  const blocking = !passed && (!external || appStoreMode);
  console.log(`${passed ? 'PASS' : external ? 'EXTERNAL' : 'TODO'}  ${label}`);
  if (blocking) failures.push(label);
}

if (failures.length) {
  console.error(`\n${failures.length} release requirement(s) remain.`);
  process.exitCode = 1;
} else {
  console.log(`\n${appStoreMode ? 'App Store configuration' : 'Pre-Developer configuration'} is structurally ready. Physical-device QA is still required.`);
}
