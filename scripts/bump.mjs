// Bumps the version in manifest.json and package.json together.
// Usage: node scripts/bump.mjs [patch|minor|major|x.y.z]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] ?? 'patch';
const files = ['manifest.json', 'package.json'];

const current = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
const [major, minor = 0, patch = 0] = current.split('.').map(Number);
const next = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[arg] ?? arg;

if (!/^\d+(\.\d+){0,3}$/.test(next)) {
  console.error(`Invalid version "${next}". Use patch, minor, major or x.y.z`);
  process.exit(1);
}

for (const file of files) {
  const path = join(ROOT, file);
  const text = readFileSync(path, 'utf8');
  writeFileSync(path, text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`));
}
console.log(`${current} → ${next}`);
