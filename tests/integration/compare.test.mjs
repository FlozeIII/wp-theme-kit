import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { runCliAsync, tempDir, write } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';
import { decodePng } from '../../src/preview/png-codec.mjs';

const browserTest = { skip: !findBrowser({}), timeout: 180000 };

function page(background) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html, body { margin: 0; height: 100%; background: ${background}; }</style>
</head><body></body></html>`;
}

async function site(t) {
  const server = http.createServer((request, response) => {
    const variant = new URL(request.url, 'http://127.0.0.1').searchParams.get('v');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page(variant === 'two' ? '#000000' : '#ffffff'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const root = tempDir('wptk-compare-');
  const url = `http://127.0.0.1:${server.address().port}`;
  write(root, '.wp-theme-kit.json', JSON.stringify({
    preview: {
      baseUrl: url,
      routes: [
        { name: 'one', path: '/?v=one', width: 800, height: 600 },
        { name: 'two', path: '/?v=two', width: 800, height: 600 },
        { name: 'small', path: '/?v=one', width: 400, height: 300 },
      ],
    },
  }));
  return { root, url };
}

test('compare passes identical screenshots and fails a color change with a diff image', browserTest, async (t) => {
  const { root } = await site(t);
  const shots = path.join(root, 'shots');
  const shotResult = await runCliAsync(['shot', '--cwd', root, '--all', '--out', shots]);
  assert.equal(shotResult.status, 0, shotResult.stdout + shotResult.stderr);

  const one = path.join(shots, 'one.png');
  const two = path.join(shots, 'two.png');
  const small = path.join(shots, 'small.png');
  for (const file of [one, two, small]) assert.ok(fs.existsSync(file), file);

  const copy = path.join(root, 'one-copy.png');
  fs.copyFileSync(one, copy);

  const identical = await runCliAsync(['compare', one, copy, '--json']);
  assert.equal(identical.status, 0, identical.stdout + identical.stderr);
  const sameReport = JSON.parse(identical.stdout);
  assert.equal(sameReport.ok, true);
  assert.equal(sameReport.width, 800);
  assert.equal(sameReport.height, 600);
  assert.equal(sameReport.changedPixels, 0);
  assert.equal(sameReport.totalPixels, 480000);
  assert.equal(sameReport.changedRatio, 0);
  assert.equal(sameReport.maxChannelDelta, 0);
  assert.equal(sameReport.diff, null);

  const prettyPass = await runCliAsync(['compare', one, copy]);
  assert.equal(prettyPass.status, 0, prettyPass.stdout + prettyPass.stderr);
  assert.match(prettyPass.stdout, /^ok 800x600: 0\/480000 pixels changed \(0%\), tolerance 0%/);

  const diffFile = path.join(root, 'diff.png');
  const changed = await runCliAsync(['compare', one, two, '--out', diffFile, '--json']);
  assert.equal(changed.status, 1, changed.stdout + changed.stderr);
  const report = JSON.parse(changed.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.changedPixels, 480000);
  assert.equal(report.changedRatio, 1);
  assert.equal(report.maxChannelDelta, 255);
  assert.equal(report.diff, diffFile);
  assert.ok(fs.existsSync(diffFile));

  const diff = decodePng(fs.readFileSync(diffFile));
  assert.equal(diff.width, 800);
  assert.equal(diff.height, 600);
  let red = 0;
  for (let index = 0; index < diff.data.length; index += 4) {
    if (diff.data[index] === 255 && diff.data[index + 1] === 0
      && diff.data[index + 2] === 0 && diff.data[index + 3] === 255) red++;
  }
  assert.equal(red, 480000);

  const prettyDiff = path.join(root, 'pretty-diff.png');
  const prettyChanged = await runCliAsync(['compare', one, two, '--out', prettyDiff]);
  assert.equal(prettyChanged.status, 1, prettyChanged.stdout + prettyChanged.stderr);
  assert.match(
    prettyChanged.stderr,
    /error 800x600: 480000\/480000 pixels changed \(100%\), tolerance 0%; diff: /,
  );

  const tolerated = await runCliAsync(['compare', one, two, '--tolerance', '1', '--json']);
  assert.equal(tolerated.status, 0, tolerated.stdout + tolerated.stderr);
  assert.equal(JSON.parse(tolerated.stdout).ok, true);

  const channel = await runCliAsync(['compare', one, two, '--channel', '255', '--json']);
  assert.equal(channel.status, 0, channel.stdout + channel.stderr);
  assert.equal(JSON.parse(channel.stdout).changedPixels, 0);

  const mismatchDiff = path.join(root, 'mismatch.png');
  const mismatch = await runCliAsync(['compare', one, small, '--out', mismatchDiff, '--json']);
  assert.equal(mismatch.status, 1, mismatch.stdout + mismatch.stderr);
  const mismatchReport = JSON.parse(mismatch.stdout);
  assert.equal(mismatchReport.ok, false);
  assert.equal(mismatchReport.reason, 'size-mismatch');
  assert.deepEqual(mismatchReport.expectedSize, { width: 800, height: 600 });
  assert.deepEqual(mismatchReport.actualSize, { width: 400, height: 300 });
  assert.equal(fs.existsSync(mismatchDiff), false);

  write(root, 'blocked', 'not a directory');
  const blocked = await runCliAsync([
    'compare', one, copy, '--out', path.join(root, 'blocked', 'diff.png'),
  ]);
  assert.equal(blocked.status, 2, blocked.stdout + blocked.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'blocked'), 'utf8'), 'not a directory');
});

test('compare validates arguments, inputs and output paths', async (t) => {
  const root = tempDir('wptk-compare-errors-');
  const one = path.join(root, 'one.png');
  const two = path.join(root, 'two.png');
  write(root, 'notes.txt', 'not a png');

  const help = await runCliAsync(['compare', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: wptk compare/);

  const cases = [
    ['compare'],
    ['compare', one],
    ['compare', one, two, 'extra'],
    ['compare', one, two, '--tolerance', '1.5'],
    ['compare', one, two, '--channel', '256'],
    ['compare', one, two, '--channel', '2.5'],
    ['compare', path.join(root, 'missing.png'), two],
    ['compare', path.join(root, 'notes.txt'), path.join(root, 'notes.txt')],
    ['compare', one, two, '--out', one],
  ];
  for (const args of cases) {
    const result = await runCliAsync(args);
    assert.equal(result.status, 2, `${args.join(' ')}\n${result.stdout}${result.stderr}`);
  }

  const helpHint = await runCliAsync(['compare']);
  assert.match(helpHint.stderr, /Usage: wptk compare/);

  const outDirectory = await runCliAsync(['compare', one, two, '--out', root]);
  assert.equal(outDirectory.status, 2, outDirectory.stdout + outDirectory.stderr);
});
