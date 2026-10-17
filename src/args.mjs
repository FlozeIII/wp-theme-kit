import { UsageError } from './errors.mjs';

/**
 * A deliberately small argument parser. No dependencies, no shell quoting.
 *
 * Supported forms:
 *   --flag                 boolean true
 *   --no-flag              boolean false
 *   --key value            string / number
 *   --key=value            string / number
 *   -h                     alias declared in `aliases`
 *   --                     everything after is positional
 *
 * Unknown options are errors unless `allowUnknown` is true.
 *
 * @param {string[]} argv
 * @param {object} spec
 * @param {string[]} [spec.strings]
 * @param {string[]} [spec.booleans]
 * @param {string[]} [spec.numbers]
 * @param {string[]} [spec.multiple]   options that may be repeated (values become arrays)
 * @param {Record<string,string>} [spec.aliases]
 * @param {boolean} [spec.allowUnknown]
 * @returns {{ values: Record<string, unknown>, positionals: string[], unknown: string[] }}
 */
export function parseArgs(argv, spec = {}) {
  const strings = new Set(spec.strings ?? []);
  const booleans = new Set(spec.booleans ?? []);
  const numbers = new Set(spec.numbers ?? []);
  const multiple = new Set(spec.multiple ?? []);
  const aliases = spec.aliases ?? {};
  const allowUnknown = spec.allowUnknown === true;

  const values = {};
  const positionals = [];
  const unknown = [];
  let positionalOnly = false;

  const setValue = (name, value) => {
    if (multiple.has(name)) {
      if (!Array.isArray(values[name])) values[name] = [];
      values[name].push(value);
    } else {
      values[name] = value;
    }
  };

  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index];

    if (positionalOnly) {
      positionals.push(raw);
      continue;
    }
    if (raw === '--') {
      positionalOnly = true;
      continue;
    }
    if (!raw.startsWith('-') || raw === '-') {
      positionals.push(raw);
      continue;
    }

    let token = raw;
    if (token.startsWith('-') && !token.startsWith('--')) {
      const short = token.slice(1);
      if (aliases[short]) token = `--${aliases[short]}`;
      else if (short.length === 1) token = `--${short}`;
    }

    const body = token.slice(2);
    const equals = body.indexOf('=');
    const name = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1);

    if (name.startsWith('no-') && booleans.has(name.slice(3))) {
      setValue(name.slice(3), false);
      continue;
    }

    const isKnown = strings.has(name) || booleans.has(name) || numbers.has(name) || multiple.has(name);
    if (!isKnown) {
      if (allowUnknown) {
        unknown.push(raw);
        continue;
      }
      throw new UsageError(`Unknown option: ${raw}`);
    }

    if (booleans.has(name)) {
      if (inlineValue !== undefined) {
        setValue(name, inlineValue !== 'false' && inlineValue !== '0');
      } else {
        setValue(name, true);
      }
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-')) {
        throw new UsageError(`Option --${name} needs a value.`);
      }
      value = next;
      index++;
    }

    if (numbers.has(name)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new UsageError(`Option --${name} needs a number, got "${value}".`);
      setValue(name, parsed);
    } else {
      setValue(name, value);
    }
  }

  return { values, positionals, unknown };
}

/** Turn `{"foo-bar": 1}` into a lookup that understands both kebab and camel spellings. */
export function valueOf(values, name) {
  if (Object.hasOwn(values, name)) return values[name];
  const camel = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return values[camel];
}
