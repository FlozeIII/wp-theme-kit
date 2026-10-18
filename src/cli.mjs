import path from 'node:path';
import { createOutput } from './output.mjs';
import { UsageError, WptkError } from './errors.mjs';
import { VERSION } from './version.mjs';

export { VERSION };

const COMMANDS = new Map([
  ['check', {
    summary: 'Run offline static checks on a WordPress theme.',
    load: () => import('./commands/check.mjs'),
  }],
  ['doctor', {
    summary: 'Inspect the local toolchain and WordPress environment.',
    load: () => import('./commands/doctor.mjs'),
  }],
  ['init', {
    summary: 'Create a classic, block, or hybrid theme.',
    load: () => import('./commands/init.mjs'),
  }],
  ['adopt', {
    summary: 'Add kit config and agent instructions to an existing theme.',
    load: () => import('./commands/adopt.mjs'),
  }],
  ['make', {
    summary: 'Generate a template, part, module, block, or pattern.',
    load: () => import('./commands/make.mjs'),
  }],
  ['package', {
    summary: 'Build an installable zip from a committed revision.',
    load: () => import('./commands/package.mjs'),
  }],
  ['verify-package', {
    summary: 'Verify a built theme zip without WordPress.',
    load: () => import('./commands/verify-package.mjs'),
  }],
  ['theme-check', {
    summary: 'Run optional local Theme Check against a theme ZIP.',
    load: () => import('./commands/theme-check.mjs'),
  }],
  ['version', {
    summary: 'Print or bump the theme version.',
    load: () => import('./commands/version.mjs'),
  }],
  ['release', {
    summary: 'Run local release preflight, package, and verify.',
    load: () => import('./commands/release.mjs'),
  }],
  ['shot', {
    summary: 'Take a screenshot with a real viewport.',
    load: () => import('./commands/shot.mjs'),
  }],
  ['compare', {
    summary: 'Compare two screenshots and write a diff image.',
    load: () => import('./commands/compare.mjs'),
  }],
  ['audit', {
    summary: 'Audit routes in a real browser.',
    load: () => import('./commands/audit.mjs'),
  }],
  ['preview', {
    summary: 'Open a route in the system browser.',
    load: () => import('./commands/preview.mjs'),
  }],
  ['pot', {
    summary: 'Generate or check a POT translation template.',
    load: () => import('./commands/pot.mjs'),
  }],
  ['install', {
    summary: 'Install skills and agent instructions for each harness.',
    load: () => import('./commands/install.mjs'),
  }],
  ['mu-plugin', {
    summary: 'Install optional WordPress observation helpers.',
    load: () => import('./commands/mu-plugin.mjs'),
  }],
]);

function takeGlobals(argv) {
  const rest = [];
  const globals = {
    cwd: process.cwd(),
    json: false,
    color: undefined,
    quiet: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--cwd') {
      const value = argv[++index];
      if (!value) throw new UsageError('--cwd needs a directory.');
      globals.cwd = path.resolve(value);
    } else if (arg.startsWith('--cwd=')) {
      globals.cwd = path.resolve(arg.slice('--cwd='.length));
    } else if (arg === '--json') {
      globals.json = true;
    } else if (arg === '--color') {
      globals.color = true;
    } else if (arg === '--no-color') {
      globals.color = false;
    } else if (arg === '--quiet') {
      globals.quiet = true;
    } else if (arg === '--version' || arg === '-V') {
      globals.version = true;
    } else if (arg === '--help' || arg === '-h') {
      globals.help = true;
      rest.push(arg);
    } else {
      rest.push(arg);
    }
  }

  return { rest, globals };
}

function helpText(out, command) {
  if (command && COMMANDS.has(command)) {
    const entry = COMMANDS.get(command);
    out.heading(`wptk ${command}`);
    out.line(`  ${entry.summary}`);
    out.line(`  Usage: wptk ${command} [options]`);
    out.line('  Run `wptk ' + command + ' --help` for command-specific options.');
    return;
  }

  out.heading(`wp-theme-kit ${VERSION}`);
  out.line('Cross-harness toolkit for WordPress theme development.');
  out.line('');
  out.heading('Commands');
  for (const [name, entry] of COMMANDS) {
    out.line(`  ${name.padEnd(16)} ${entry.summary}`);
  }
  out.line('');
  out.heading('Global options');
  out.line('  --cwd <dir>       Work in another theme directory.');
  out.line('  --json            Machine-readable output where supported.');
  out.line('  --no-color        Disable ANSI colors.');
  out.line('  --quiet           Suppress progress output.');
  out.line('  -h, --help        Show help.');
  out.line('  -V, --version     Show the version.');
  out.line('');
  out.line('Exit codes: 0 success, 1 check failure, 2 usage or environment error.');
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} process exit code
 */
export async function main(argv) {
  let globals;
  try {
    const taken = takeGlobals(argv);
    globals = taken.globals;
    const rest = taken.rest;

    if (globals.version) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }

    if (rest.length === 0 || rest.every((arg) => arg === '--help' || arg === '-h')) {
      helpText(createOutput({ json: globals.json, quiet: globals.quiet, color: globals.color }));
      return 0;
    }

    const command = rest[0];
    const commandArgs = rest.slice(1);

    if (command === 'help') {
      helpText(createOutput({ json: globals.json, quiet: globals.quiet, color: globals.color }), commandArgs[0]);
      return 0;
    }

    const entry = COMMANDS.get(command);
    if (!entry) {
      if (globals.help) {
        helpText(createOutput({ json: globals.json, quiet: globals.quiet, color: globals.color }));
        return 0;
      }
      throw new UsageError(`Unknown command: ${command}`, 'Run `wptk --help` to list commands.');
    }

    const out = createOutput({ json: globals.json, quiet: globals.quiet, color: globals.color });
    const module = await entry.load();
    if (typeof module.run !== 'function') throw new Error(`Command module for ${command} does not export run().`);
    const code = await module.run({ argv: commandArgs, globals, out });
    return Number.isInteger(code) ? code : 0;
  } catch (error) {
    const out = createOutput({
      json: globals?.json ?? false,
      quiet: false,
      color: globals?.color,
    });

    if (error instanceof WptkError) {
      out.fail(error.message);
      if (error.hint) {
        if (globals?.json) process.stderr.write(`${error.hint}\n`);
        else out.hint(error.hint);
      }
      return error.exitCode;
    }

    out.fail(error?.message ?? String(error));
    if (process.env.WPTK_DEBUG) process.stderr.write(`${error?.stack ?? ''}\n`);
    return 2;
  }
}

export { COMMANDS };
