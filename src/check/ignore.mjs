const PHPCS_MAP = new Map([
  ['WordPress.Security.EscapeOutput', ['php.unescaped-output']],
  ['WordPress.Security.NonceVerification', ['php.nonce-check']],
  ['WordPress.Security.ValidatedSanitizedInput', ['php.superglobal-direct']],
  ['WordPress.DB.PreparedSQL', ['php.sql-interpolation']],
  ['WordPress.WP.I18n', ['php.text-domain']],
  ['WordPress.NamingConventions.PrefixAllGlobals', ['php.global-prefix']],
  ['WordPress.PHP.DiscouragedPHPFunctions', ['php.forbidden-function']],
  ['WordPress.WP.EnqueuedResourceParameters', ['php.asset-version']],
]);

function stripComment(text) {
  return text
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .replace(/^\/\//, '')
    .replace(/^#/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join('\n');
}

function parseDirective(text) {
  const match = /(phpcs:ignore|wptk-ignore-next-line|wptk-ignore)\b([^\n]*)/i.exec(text);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const rest = match[2] ?? '';
  const words = rest
    .split(/[\s,]+/)
    .map((word) => word.replace(/[^A-Za-z0-9_.\\-].*$/, ''))
    .filter((word) => word && !word.startsWith('--'));

  const rules = new Set();
  let mapped = false;
  for (const word of words) {
    for (const [sniff, ids] of PHPCS_MAP) {
      if (word === sniff || word.startsWith(`${sniff}.`)) {
        for (const id of ids) rules.add(id);
        mapped = true;
      }
    }
    if (word.includes('.') && /^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/i.test(word)) {
      rules.add(word);
    }
  }

  // A PHPCS sniff we do not model still means "the author reviewed this line".
  if (!mapped && words.length > 0 && rules.size === 0) rules.add('*');
  if (rules.size === 0) rules.add('*');

  return { kind, rules };
}

/**
 * Build a line -> rule set map from comments.
 *
 * @param {Array<{type:string,value:string,line:number}>} tokens PHP tokens
 * @param {string} source used for JS/CSS/HTML comments
 * @param {string} language php|js|css|html
 */
export function buildIgnoreMap(tokens, source, language) {
  const byLine = new Map();
  const byNextLine = new Map();

  const add = (target, line, directive) => {
    if (!target.has(line)) target.set(line, new Set());
    for (const rule of directive.rules) target.get(line).add(rule);
  };

  if (language === 'php') {
    for (const token of tokens) {
      if (token.type !== 'comment') continue;
      const directive = parseDirective(stripComment(token.value));
      if (!directive) continue;
      if (directive.kind === 'wptk-ignore-next-line') add(byNextLine, token.line + 1, directive);
      else add(byLine, token.line, directive);
    }
    return { byLine, byNextLine };
  }

  const comments = [];
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    comments.push({ text: match[0], line });
  }
  for (const comment of comments) {
    const directive = parseDirective(stripComment(comment.text));
    if (!directive) continue;
    if (directive.kind === 'wptk-ignore-next-line') add(byNextLine, comment.line + 1, directive);
    else add(byLine, comment.line, directive);
  }
  return { byLine, byNextLine };
}

export function isIgnored(ignoreMap, ruleId, line) {
  for (const map of [ignoreMap.byLine, ignoreMap.byNextLine]) {
    const rules = map.get(line);
    if (rules && (rules.has('*') || rules.has(ruleId))) return true;
  }
  return false;
}
