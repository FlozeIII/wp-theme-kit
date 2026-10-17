import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../src/args.mjs';

test('parses strings, booleans, numbers, aliases, and positionals', () => {
  const result = parseArgs(['theme', '--type', 'block', '--width', '375', '-h', '--dark'], {
    strings: ['type'],
    numbers: ['width'],
    booleans: ['dark', 'help'],
    aliases: { h: 'help' },
  });
  assert.deepEqual(result.positionals, ['theme']);
  assert.equal(result.values.type, 'block');
  assert.equal(result.values.width, 375);
  assert.equal(result.values.help, true);
  assert.equal(result.values.dark, true);
});

test('supports --key=value and --no-flag', () => {
  const result = parseArgs(['--type=classic', '--no-dark'], {
    strings: ['type'],
    booleans: ['dark'],
  });
  assert.equal(result.values.type, 'classic');
  assert.equal(result.values.dark, false);
});

test('repeated options become arrays', () => {
  const result = parseArgs(['--ignore', 'a', '--ignore', 'b'], {
    strings: [],
    multiple: ['ignore'],
  });
  assert.deepEqual(result.values.ignore, ['a', 'b']);
});

test('rejects unknown options', () => {
  assert.throws(() => parseArgs(['--nope'], {}), /Unknown option/);
});

test('rejects a missing value', () => {
  assert.throws(() => parseArgs(['--type'], { strings: ['type'] }), /needs a value/);
});
