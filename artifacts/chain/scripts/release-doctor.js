const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const failures = [];
const checks = [
  ['App name', Boolean(app.name)],
  ['URL scheme', Boolean(app.scheme)],
  ['iOS bundle identifier', Boolean(app.ios?.bundleIdentifier)],
  ['Privacy policy URL', Boolean(app.extra?.privacyPolicyUrl)],
  ['Support URL', Boolean(app.extra?.supportUrl)],
  ['EAS profiles', fs.existsSync(path.join(root, 'eas.json'))],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'TODO'}  ${label}`);
  if (!passed) failures.push(label);
}

if (failures.length) {
  console.error(`\n${failures.length} release requirement(s) remain.`);
  process.exitCode = 1;
} else {
  console.log('\nRelease configuration is structurally ready. Physical-device QA is still required.');
}
