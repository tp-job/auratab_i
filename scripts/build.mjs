// Validates the extension, then writes:
//   dist/atelier-launchpad/              → folder for "Load unpacked" (Chrome / Edge)
//   dist/atelier-launchpad-<version>.zip → package for Chrome Web Store / Edge Add-ons
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './lib/zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SLUG = 'atelier-launchpad';
const OUT_DIR = join(DIST, SLUG);
const PAGE = 'launchpad.html';
// Only these ship. Everything else (tests, scripts, docs, legacy) stays out of the package.
const SHIP = ['manifest.json', 'background.js', PAGE, 'css', 'js', 'fonts', 'icons', '_locales'];

const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  } catch (err) {
    fail(`${file}: invalid JSON (${err.message})`);
    return {};
  }
};

function walk(path) {
  const abs = join(ROOT, path);
  if (!existsSync(abs)) return fail(`missing ${path}`), [];
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs).sort().flatMap((name) => walk(join(path, name)));
}

// ---------- validate ----------

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) fail(`manifest version "${manifest.version}" is not 1-4 dot-separated integers`);
if (pkg.version !== manifest.version) fail(`package.json version ${pkg.version} ≠ manifest version ${manifest.version}`);

for (const [size, icon] of Object.entries({ ...manifest.icons, ...manifest.action?.default_icon })) {
  const abs = join(ROOT, icon);
  if (!existsSync(abs)) { fail(`icon ${icon} missing`); continue; }
  const png = readFileSync(abs);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  if (w !== Number(size) || h !== Number(size)) fail(`icon ${icon} is ${w}x${h}, expected ${size}x${size}`);
}

// Click-to-open: the toolbar icon is the only entry point; the New Tab page is left alone.
if (manifest.chrome_url_overrides) fail('chrome_url_overrides must not be set: the launchpad opens from the toolbar icon only');
if (!manifest.action) fail('manifest.action is required (the toolbar icon opens the launchpad)');
if (manifest.action?.default_popup) fail('action.default_popup would stop action.onClicked from firing');
if (!manifest.commands?._execute_action) fail('commands._execute_action (the keyboard shortcut for the icon) is missing');
const worker = manifest.background?.service_worker;
if (!worker || !existsSync(join(ROOT, worker))) fail('background.service_worker file missing');
// The only network the page may reach is the weather API, and only over https.
// Anything else in connect-src (or a host permission beyond these two) is a bug.
const WEATHER_ORIGINS = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'];
const csp = manifest.content_security_policy?.extension_pages ?? '';
const connect = /connect-src ([^;]+)/.exec(csp)?.[1].trim().split(/\s+/) ?? [];
if (connect.join(' ') !== WEATHER_ORIGINS.join(' ')) {
  fail(`CSP connect-src must be exactly "${WEATHER_ORIGINS.join(' ')}" (got "${connect.join(' ') || 'nothing'}")`);
}
for (const host of manifest.host_permissions ?? []) {
  if (!WEATHER_ORIGINS.some((o) => host === `${o}/*`)) fail(`host permission ${host} is not one of the weather origins`);
}

// Locales: default exists, all locales have identical keys, manifest __MSG_ keys resolve.
const locales = readdirSync(join(ROOT, '_locales'));
const messages = Object.fromEntries(locales.map((l) => [l, readJson(`_locales/${l}/messages.json`)]));
if (!messages[manifest.default_locale]) fail(`default_locale "${manifest.default_locale}" has no messages.json`);
const baseKeys = Object.keys(messages[manifest.default_locale] ?? {}).sort();
for (const [locale, msgs] of Object.entries(messages)) {
  const keys = Object.keys(msgs).sort();
  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));
  if (missing.length) fail(`_locales/${locale} missing: ${missing.join(', ')}`);
  if (extra.length) fail(`_locales/${locale} has unknown keys: ${extra.join(', ')}`);
}
for (const match of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
  if (!baseKeys.includes(match[1])) fail(`manifest uses __MSG_${match[1]}__ but it is not defined`);
}
const name = messages[manifest.default_locale]?.extName?.message ?? '';
if (name.length > 75) fail('extName exceeds 75 characters');
for (const [locale, msgs] of Object.entries(messages)) {
  if ((msgs.extDescription?.message ?? '').length > 132) fail(`_locales/${locale} extDescription exceeds 132 characters`);
}

// Files: every local reference in the page exists; no remotely hosted code anywhere.
const files = SHIP.flatMap(walk);
const html = readFileSync(join(ROOT, PAGE), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^[a-z]+:/i.test(ref)) fail(`${PAGE} references remote resource ${ref}`);
  else if (!existsSync(join(ROOT, ref))) fail(`${PAGE} references missing file ${ref}`);
}
// The CSP (style-src 'self', script-src 'self') blocks inline styles and scripts.
if (/\sstyle="|<style[\s>]/i.test(html)) fail(`${PAGE} has inline styles (blocked by the CSP; use a class)`);
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fail(`${PAGE} has an inline <script> (blocked by the CSP)`);

// Every t('key') / data-i18n="key" used by the page exists in the default locale.
const used = new Set();
for (const file of files.filter((f) => /\.(js|html)$/.test(f))) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const [, key] of text.matchAll(/\bt\(\s*'(\w+)'/g)) used.add(key);
  for (const [, key] of text.matchAll(/data-i18n(?:-\w+)?="(\w+)"/g)) used.add(key);
}
for (const key of used) if (!baseKeys.includes(key)) fail(`message "${key}" is used but not in _locales/${manifest.default_locale}`);

for (const file of files.filter((f) => /\.(js|css|html)$/.test(f))) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  if (/\b(import|from)\s*\(?\s*['"]https?:/.test(text) || /url\(\s*['"]?https?:/.test(text) || /<script[^>]+src="https?:/.test(text)) {
    fail(`${file} loads remote code/resources (not allowed in MV3)`);
  }
  if (/\beval\s*\(|new Function\s*\(/.test(text)) fail(`${file} uses eval/new Function`);
  for (const [, dep] of text.matchAll(/(?:import|from)\s*['"](\.[^'"]+)['"]/g)) {
    if (!existsSync(join(ROOT, dirname(file), dep))) fail(`${file} imports missing module ${dep}`);
  }
}

// Nocturnal Atelier v3.2: no weight above 600.
const css = readFileSync(join(ROOT, 'css/launchpad.css'), 'utf8');
for (const [, weight] of css.matchAll(/font-weight:\s*(\d+)/g)) {
  if (Number(weight) > 600) fail(`css/launchpad.css uses font-weight ${weight} (max 600)`);
}
for (const [, weight] of css.matchAll(/\bfont:\s*(\d{3})\b/g)) {
  if (Number(weight) > 600) fail(`css/launchpad.css uses font weight ${weight} in a font shorthand (max 600)`);
}

if (errors.length) {
  console.error(`\n✖ Build failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// ---------- write ----------

// Empty dist/atelier-launchpad in place rather than deleting it, so a browser that
// already "Load unpacked"-ed this folder only needs a Reload to pick up the new build.
mkdirSync(OUT_DIR, { recursive: true });
for (const entry of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, entry), { recursive: true, force: true });
for (const item of SHIP) cpSync(join(ROOT, item), join(OUT_DIR, item), { recursive: true });

const zipPath = join(DIST, `${SLUG}-${manifest.version}.zip`);
const entries = files.map((f) => ({ name: f.split(sep).join('/'), data: readFileSync(join(ROOT, f)) }));
const zip = createZip(entries);
writeFileSync(zipPath, zip);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const unpacked = entries.reduce((sum, e) => sum + e.data.length, 0);
console.log(`✔ Atelier Launchpad ${manifest.version} — ${entries.length} files, ${kb(unpacked)} unpacked`);
console.log(`  Load unpacked : ${OUT_DIR}`);
console.log(`  Store package : ${zipPath} (${kb(zip.length)})`);
