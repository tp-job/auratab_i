// "Measure, don't claim" (docs/design-system.md §1.4, §2.4): contrast is computed from the
// live stylesheet in both modes. Translucent tokens are composited over the page `bg`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/newtab.css', import.meta.url), 'utf8');
const l1 = css.slice(css.indexOf('/* ==== L1'), css.indexOf('/* ==== L2'));
const l2 = css.slice(css.indexOf('/* ==== L2'), css.indexOf('/* ==== L3'));

const primitives = Object.fromEntries([...l1.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));

// Split "a, b" at the top-level comma of light-dark(a, b).
function lightDarkArgs(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ',' && depth === 0) return [body.slice(0, i).trim(), body.slice(i + 1).trim()];
  }
  throw new Error(`not a light-dark() pair: ${body}`);
}

const tokens = {};
for (const m of l2.matchAll(/--([\w-]+):\s*light-dark\((.*)\);/g)) {
  const [light, dark] = lightDarkArgs(m[2]);
  tokens[m[1]] = { light, dark };
}

function parse(value, mode) {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) {
    if (primitives[ref[1]]) return parse(primitives[ref[1]], mode);
    if (tokens[ref[1]]) return parse(tokens[ref[1]][mode], mode);
    throw new Error(`unknown token ${value}`);
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgba = value.match(/^rgba\(([^)]+)\)$/);
  if (rgba) return rgba[1].split(',').map(Number);
  throw new Error(`unparseable colour ${value}`);
}

const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
const lum = (rgb) => {
  const [r, g, b] = rgb.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const color = (name, mode) => parse(tokens[name][mode], mode);
const surfaceIn = (name, mode) => over(color(name, mode), color('bg', mode));

const TEXT = ['text', 'text-secondary', 'text-tertiary', 'text-muted', 'accent'];

for (const mode of ['light', 'dark']) {
  test(`${mode}: every L2 token is defined for this mode and bg is opaque`, () => {
    assert.ok(Object.keys(tokens).length >= 20);
    assert.equal(color('bg', mode)[3], 1);
  });

  test(`${mode}: text tokens ≥ 4.5:1 on bg, surface and surface-2`, () => {
    const report = [];
    for (const base of ['bg', 'surface', 'surface-2']) {
      const bg = base === 'bg' ? color('bg', mode) : surfaceIn(base, mode);
      for (const name of TEXT) {
        const ratio = contrast(color(name, mode), bg);
        report.push(`${name} on ${base}: ${ratio.toFixed(2)}`);
        assert.ok(ratio >= 4.5, `${mode} ${name} on ${base} is ${ratio.toFixed(2)}:1`);
      }
    }
    console.log(`  ${mode}: ${report.filter((r) => r.includes(' on bg')).join(' · ')}`);
  });

  test(`${mode}: non-text indicators ≥ 3:1 (switch track, knob, focus ring)`, () => {
    const bg = color('bg', mode);
    for (const name of ['accent', 'text-muted', 'focus-ring']) {
      assert.ok(contrast(color(name, mode), bg) >= 3, `${mode} ${name} vs bg`);
    }
    assert.ok(contrast(bg, color('accent', mode)) >= 3, `${mode} knob on checked track`);
    assert.ok(contrast(bg, color('text-muted', mode)) >= 3, `${mode} knob on unchecked track`);
  });

  test(`${mode}: status text ≥ 4.5:1 and icons ≥ 3:1 on their tinted background`, () => {
    for (const status of ['info', 'success']) {
      const bg = surfaceIn(`${status}-bg`, mode);
      const text = contrast(color(`${status}-text`, mode), bg);
      const icon = contrast(color(`${status}-accent`, mode), bg);
      assert.ok(text >= 4.5, `${mode} ${status} text ${text.toFixed(2)}`);
      assert.ok(icon >= 3, `${mode} ${status} icon ${icon.toFixed(2)}`);
    }
  });
}

test('accent flips with the theme (never one fixed colour)', () => {
  assert.notEqual(tokens.accent.light, tokens.accent.dark);
});
