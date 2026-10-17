import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePhpString, lexPhp } from '../../src/check/lexer-php.mjs';

test('lexes PHP tags, calls, variables, and inline HTML', () => {
  const tokens = lexPhp('<?php echo esc_html( $name ); ?><p>Hi</p>');
  assert.equal(tokens[0].type, 'open_tag');
  assert.ok(tokens.some((token) => token.type === 'keyword' && token.value === 'echo'));
  assert.ok(tokens.some((token) => token.type === 'ident' && token.value === 'esc_html'));
  assert.ok(tokens.some((token) => token.type === 'var' && token.value === '$name'));
  assert.ok(tokens.some((token) => token.type === 'inline_html' && token.value.includes('Hi')));
});

test('tracks line numbers across comments and strings', () => {
  const tokens = lexPhp(`<?php
// one
/* two
   three */
echo "four";
echo $five;`);
  const echoes = tokens.filter((token) => token.value === 'echo');
  assert.deepEqual(echoes.map((token) => token.line), [5, 6]);
});

test('recognizes short echo tags', () => {
  const tokens = lexPhp('<?= esc_html( $x ) ?>');
  assert.equal(tokens[0].type, 'open_tag_echo');
});

test('decodes single and double quoted strings', () => {
  const tokens = lexPhp(`<?php $a = 'it\\'s'; $b = "line\\nnext";`);
  const strings = tokens.filter((token) => token.type === 'string');
  assert.equal(decodePhpString(strings[0]), "it's");
  assert.equal(decodePhpString(strings[1]), 'line\nnext');
});

test('marks interpolated double-quoted strings', () => {
  const tokens = lexPhp('<?php echo "Hello $name";');
  const string = tokens.find((token) => token.type === 'string');
  assert.equal(string.interpolated, true);
  assert.equal(decodePhpString(string), null);
});

test('handles heredoc and nowdoc as single tokens', () => {
  const nowdoc = lexPhp("<?php $x = <<<'TXT'\nhello $name\nTXT;\n");
  const token = nowdoc.find((item) => item.type === 'string' && item.quoted === 'nowdoc');
  assert.ok(token);
  assert.equal(token.interpolated, false);

  const heredoc = lexPhp("<?php $x = <<<TXT\nhello\nTXT;\n");
  const token2 = heredoc.find((item) => item.type === 'string' && item.quoted === 'heredoc');
  assert.ok(token2);
  assert.equal(token2.interpolated, true);
});

test('does not treat #[ attribute as a comment', () => {
  const tokens = lexPhp('<?php #[Attr] function f() {}');
  assert.ok(tokens.some((token) => token.type === 'punct' && token.value === '#['));
  assert.equal(tokens.some((token) => token.type === 'comment'), false);
});
