const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
};

function supportsColor() {
  if (process.env.NO_COLOR || process.env.WPTK_NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== '0';
  return Boolean(process.stdout.isTTY);
}

export function createOutput({ json = false, quiet = false, color = supportsColor() } = {}) {
  const paint = (name, text) => (color ? `${ANSI[name]}${text}${ANSI.reset}` : String(text));

  const out = {
    json,
    quiet,
    color,
    line(text = '') {
      if (!quiet) process.stdout.write(`${text}\n`);
    },
    info(text) {
      if (!quiet) process.stdout.write(`${text}\n`);
    },
    ok(text) {
      if (!quiet) process.stdout.write(`${paint('green', 'ok')} ${text}\n`);
    },
    warn(text) {
      if (!quiet) process.stdout.write(`${paint('yellow', 'warn')} ${text}\n`);
    },
    fail(text) {
      process.stderr.write(`${paint('red', 'error')} ${text}\n`);
    },
    hint(text) {
      if (!quiet && text) process.stdout.write(`${paint('dim', `  ${text}`)}\n`);
    },
    heading(text) {
      if (!quiet) process.stdout.write(`${paint('bold', text)}\n`);
    },
    data(value) {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
    table(headers, rows) {
      if (quiet) return;
      const widths = headers.map((header, index) => Math.max(
        String(header).length,
        ...rows.map((row) => String(row[index] ?? '').length),
      ));
      const format = (row) => row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  ');
      process.stdout.write(`${format(headers)}\n`);
      process.stdout.write(`${widths.map((width) => '-'.repeat(width)).join('  ')}\n`);
      for (const row of rows) process.stdout.write(`${format(row)}\n`);
    },
    annotation(level, { file, line, message }) {
      // GitHub Actions workflow command. Harmless in other environments.
      const location = [file, line].filter((part) => part !== undefined && part !== null).join(',');
      const head = location ? `file=${file}${line ? `,line=${line}` : ''}` : '';
      process.stdout.write(`::${level}${head ? ` ${head}` : ''}::${String(message).replace(/\n/g, '%0A')}\n`);
    },
  };

  return out;
}
