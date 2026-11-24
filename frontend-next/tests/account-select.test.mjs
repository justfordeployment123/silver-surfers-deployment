import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// UAT bug 13: the status dropdown on the Account page showed white option
// text on the browser's white popup in light mode, so the choices were
// invisible. The select sits on a permanently dark panel, so its popup must
// be dark and its options must set their own colors.
const source = readFileSync(new URL('../app/(site)/account/page.js', import.meta.url), 'utf8');
const rule = (selector) => {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return '';
  return source.slice(source.indexOf('{', start) + 1, source.indexOf('}', start));
};

test('the account select opts into a dark popup in every theme', () => {
  assert.match(rule('.ac-sel'), /color-scheme:\s*dark/);
});

test('the select options set an explicit readable color on a dark background', () => {
  const option = rule('.ac-sel option');
  assert.match(option, /background(-color)?:\s*#[0-9a-f]{3,8}/i);
  assert.match(option, /color:\s*#fff/i);
});

test('options no longer depend on a text-black class that does not exist', () => {
  assert.doesNotMatch(source, /<option[^>]*text-black/);
});
