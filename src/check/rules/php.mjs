import {
  calls,
  containsVar,
  decodePhpString,
  isKeyword,
  isPunct,
  isVar,
  nextMeaningful,
  prevMeaningful,
  splitArguments,
} from '../lexer-php.mjs';
import { GETTEXT_SIGNATURES } from '../../i18n/functions.mjs';
import { expandTemplateArguments } from '../template-arguments.mjs';
import { printfArguments } from './printf.mjs';
import { scriptFooter } from './enqueue.mjs';

const DEFAULT_SAFE_OUTPUT = [
  'esc_html', 'esc_attr', 'esc_url', 'esc_js', 'esc_textarea', 'esc_xml',
  'esc_html__', 'esc_html_e', 'esc_attr__', 'esc_attr_e', 'esc_url_raw',
  'wp_kses', 'wp_kses_post', 'wp_kses_data', 'wp_json_encode',
  'intval', 'absint', 'floatval', 'boolval', 'number_format_i18n', 'size_format',
  'wp_get_attachment_image', 'get_the_post_thumbnail', 'get_avatar',
  'wp_nav_menu', 'get_search_form', 'get_calendar', 'comment_form',
  'wp_list_comments', 'wp_list_pages', 'wp_list_categories', 'wp_tag_cloud',
  'wp_dropdown_categories', 'wp_dropdown_pages', 'wp_login_form', 'wp_loginout',
  'get_the_category_list', 'get_the_tag_list', 'get_the_term_list',
  'get_comment_author_link', 'get_comment_link', 'get_edit_comment_link',
  'get_edit_post_link', 'get_delete_post_link', 'get_the_password_form',
  'the_content', 'the_excerpt', 'the_title', 'the_permalink', 'the_tags',
  'the_category', 'the_terms', 'wp_link_pages', 'the_posts_pagination',
  'paginate_comments_links', 'edit_post_link', 'comments_number',
  'get_header', 'get_footer', 'get_sidebar', 'get_template_part', 'comments_template',
  'paginate_links', 'get_the_posts_pagination', 'wp_get_archives',
  'bloginfo', 'dynamic_sidebar', 'the_archive_title', 'the_archive_description',
  'the_post_navigation', 'the_comments_navigation', 'the_permalink', 'post_class',
  'body_class', 'language_attributes', 'wp_head', 'wp_footer', 'wp_body_open',
  'wp_list_comments', 'comment_form', 'get_block_wrapper_attributes',
];

const FORBIDDEN = new Map([
  ['query_posts', ['error', 'query_posts breaks the main query. Use WP_Query or pre_get_posts.']],
  ['wp_reset_query', ['warning', 'Use wp_reset_postdata() after a custom query.']],
  ['create_function', ['error', 'create_function() was removed in PHP 8. Use a closure.']],
  ['each', ['error', 'each() was removed in PHP 8. Use foreach.']],
  ['ereg', ['error', 'The ereg family was removed in PHP 7. Use preg_match().']],
  ['eregi', ['error', 'The ereg family was removed in PHP 7. Use preg_match().']],
  ['ereg_replace', ['error', 'The ereg family was removed in PHP 7. Use preg_replace().']],
  ['eregi_replace', ['error', 'The ereg family was removed in PHP 7. Use preg_replace().']],
  ['split', ['error', 'split() was removed in PHP 7. Use explode() or preg_split().']],
  ['spliti', ['error', 'spliti() was removed in PHP 7. Use preg_split().']],
  ['mysql_query', ['error', 'Use $wpdb or the WordPress HTTP/database APIs.']],
  ['mysql_connect', ['error', 'Use $wpdb or the WordPress database APIs.']],
  ['mysql_real_escape_string', ['error', 'Use $wpdb->prepare().']],
  ['session_register', ['error', 'session_register() was removed in PHP 5.4.']],
  ['magic_quotes_runtime', ['error', 'magic_quotes_runtime() was removed in PHP 5.4.']],
  ['set_magic_quotes_runtime', ['error', 'set_magic_quotes_runtime() was removed in PHP 5.4.']],
  ['get_magic_quotes_gpc', ['error', 'get_magic_quotes_gpc() was removed in PHP 8.']],
  ['get_magic_quotes_runtime', ['error', 'get_magic_quotes_runtime() was removed in PHP 8.']],
  ['call_user_method', ['error', 'call_user_method() was removed in PHP 7.']],
  ['call_user_method_array', ['error', 'call_user_method_array() was removed in PHP 7.']],
  ['extract', ['warning', 'extract() hides where variables come from. Prefer an explicit array.']],
  ['eval', ['warning', 'eval() makes code hard to audit. Prefer a callback or a template file.']],
  ['unserialize', ['warning', 'unserialize() on untrusted data can instantiate objects. Prefer JSON.']],
  ['parse_str', ['warning', 'parse_str() without a result array pollutes the local scope.']],
]);

const GETTEXT = new Map(
  Object.entries(GETTEXT_SIGNATURES).map(([name, signature]) => [name, { domain: signature.domain }]),
);

const SUPERGLOBALS = new Set([
  '$_GET', '$_POST', '$_REQUEST', '$_COOKIE', '$_SERVER', '$_FILES', '$_ENV',
]);

const SANITIZERS = [
  'sanitize_', 'esc_', 'absint', 'intval', 'floatval', 'wp_unslash', 'wp_kses',
  'wp_verify_nonce', 'check_admin_referer', 'check_ajax_referer', 'filter_input',
  'wp_parse_args', 'rest_sanitize', 'rest_validate', 'current_user_can', 'isset',
  'empty', 'array_key_exists',
];

function safeSet(config) {
  return new Set([
    ...DEFAULT_SAFE_OUTPUT,
    ...(config.checks.safeOutputFunctions ?? []),
    ...(config.checks.escapedHelpers ?? []),
  ]);
}

function statementEnd(tokens, start) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'punct') {
      if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
      else if (token.value === ')' || token.value === ']' || token.value === '}') depth = Math.max(0, depth - 1);
      else if (token.value === ';' && depth === 0) return index;
    }
    if (token.type === 'close_tag' && depth === 0) return index;
  }
  return tokens.length;
}

function callNames(tokens) {
  const names = [];
  for (const call of calls(tokens)) names.push(call.name);
  return names;
}

function hasSafeCast(tokens) {
  const casts = new Set(['int', 'integer', 'float', 'double', 'bool', 'boolean', 'string']);
  for (let index = 0; index < tokens.length - 2; index++) {
    if (isPunct(tokens[index], '(') && tokens[index + 1]?.type === 'ident' && casts.has(tokens[index + 1].value) && isPunct(tokens[index + 2], ')')) {
      return true;
    }
  }
  return false;
}

function expressionIsSafe(tokens, safe) {
  if (tokens.length === 0) return true;
  const names = callNames(tokens);
  const safeCall = names.some((name) => safe.has(name) || name.startsWith('esc_') || name.startsWith('wp_kses'));
  if (safeCall) return true;

  const formatters = new Set(['sprintf', 'wp_sprintf', 'implode', 'join', 'number_format', 'date_i18n']);
  const unsafeCall = names.some((name) => !formatters.has(name));
  if (unsafeCall) return false;
  if (ternaryHasLiteralBranches(tokens)) return true;
  if (hasSafeCast(tokens)) return true;

  const varLike = tokens.some((token) => token.type === 'var' || (token.type === 'string' && token.interpolated));
  if (varLike) return false;
  return true;
}

/** `echo $cond ? 'a' : 'b';` only outputs literals. */
function ternaryHasLiteralBranches(tokens) {
  let depth = 0;
  let question = -1;
  let colon = -1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'punct') continue;
    if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
    else if (token.value === ')' || token.value === ']' || token.value === '}') depth = Math.max(0, depth - 1);
    else if (token.value === '?' && depth === 0 && question === -1) question = index;
    else if (token.value === ':' && depth === 0 && question !== -1 && colon === -1) colon = index;
  }
  if (question === -1 || colon === -1) return false;
  const branches = [tokens.slice(question + 1, colon), tokens.slice(colon + 1)];
  return branches.every((branch) => (
    !branch.some((token) => token.type === 'var' || (token.type === 'string' && token.interpolated))
    && callNames(branch).length === 0
  ));
}

function lineText(ctx, line) {
  return ctx.lines[line - 1] ?? '';
}

function hasSanitizerNearby(ctx, line) {
  const from = Math.max(0, line - 2);
  const to = Math.min(ctx.lines.length, line + 1);
  const text = ctx.lines.slice(from, to).join(' ');
  return SANITIZERS.some((needle) => text.includes(needle));
}

function literalArg(argTokens) {
  const token = argTokens.find((item) => !['whitespace', 'comment'].includes(item.type));
  if (!token || token.type !== 'string' || token.partial) return null;
  return decodePhpString(token);
}

// ---------------------------------------------------------------------------

export const unescapedOutput = {
  id: 'php.unescaped-output',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const safe = safeSet(ctx.config);
    const tokens = ctx.tokens;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!isKeyword(token, 'echo') && !isKeyword(token, 'print') && token.type !== 'open_tag_echo') continue;
      const end = statementEnd(tokens, index + 1);
      const expression = tokens.slice(index + 1, end);
      if (expression.length === 0) continue;
      // `printf` and `sprintf` get a more specific rule.
      const names = callNames(expression);
      if (names.includes('printf') && !names.some((name) => safe.has(name) || name.startsWith('esc_'))) continue;
      if (expressionIsSafe(expression, safe)) continue;
      const snippet = expression.map((item) => item.value).join('').trim().slice(0, 80);
      ctx.add({
        line: token.line,
        message: `Output is not escaped: ${snippet}${snippet.length >= 80 ? '...' : ''}`,
        hint: 'Escape at the output site with esc_html(), esc_attr(), esc_url(), or wp_kses_post().',
      });
    }
  },
};

export const unescapedPrintf = {
  id: 'php.unescaped-printf',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const safe = safeSet(ctx.config);
    for (const call of calls(ctx.tokens)) {
      if (call.name !== 'printf') continue;
      if (call.args.length < 2) continue;
      const format = literalArg(call.args[0]);
      if (!format || !/%[0-9$]*[bcdeEfFgGosuxX]/.test(format)) continue;
      const values = call.args.slice(1);
      const hasUnsafeValue = values.some((arg) => containsVar(arg) || arg.some((token) => token.type === 'string' && token.interpolated));
      if (!hasUnsafeValue) continue;
      const hasSafeValue = values.some((arg) => expressionsHaveSafeCall(arg, safe));
      if (hasSafeValue) continue;
      ctx.add({
        line: ctx.tokens[call.nameIndex].line,
        message: 'printf() receives unescaped values.',
        hint: 'Escape each value with esc_html() or use wp_kses_post() on the final string.',
      });
    }
  },
};

function expressionsHaveSafeCall(tokens, safe) {
  return tokens.some((token) => token.type === 'ident' && (safe.has(token.value) || token.value.startsWith('esc_') || token.value.startsWith('wp_kses')));
}

export const textDomain = {
  id: 'php.text-domain',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const expected = ctx.theme.textDomain;
    const seen = new Set();
    for (const call of calls(ctx.tokens)) {
      const spec = GETTEXT.get(call.name);
      if (!spec) continue;
      const domainArg = call.args[spec.domain];
      const line = ctx.tokens[call.nameIndex].line;
      const key = `${line}:${call.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!domainArg || domainArg.filter((token) => token.type !== 'whitespace' && token.type !== 'comment').length === 0) {
        ctx.add({
          line,
          message: `${call.name}() has no text domain.`,
          hint: `Pass '${expected}' as the domain argument.`,
        });
        continue;
      }

      const domain = literalArg(domainArg);
      if (domain === null) {
        ctx.add({
          line,
          severity: 'warning',
          message: `${call.name}() uses a dynamic text domain.`,
          hint: 'Use a literal domain so translation tools can find the string.',
        });
      } else if (expected && domain !== expected) {
        ctx.add({
          line,
          severity: 'error',
          message: `${call.name}() uses text domain "${domain}", expected "${expected}".`,
          hint: `Change the domain to '${expected}'.`,
        });
      }
    }
  },
};

export const translatorComments = {
  id: 'php.translator-comment',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    for (const call of calls(ctx.tokens)) {
      if (!GETTEXT.has(call.name)) continue;
      const message = literalArg(call.args[0] ?? []);
      if (!message || !/%[0-9$]*[bcdeEfFgGosuxX]/.test(message)) continue;
      const line = ctx.tokens[call.nameIndex].line;
      const nearby = ctx.lines.slice(Math.max(0, line - 3), line - 1).join('\n');
      if (/translators?:/i.test(nearby)) continue;
      ctx.add({
        line,
        message: 'Translatable string has placeholders but no translator comment.',
        hint: 'Add a `translators:` comment explaining each placeholder.',
      });
    }
  },
};

export const forbiddenFunctions = {
  id: 'php.forbidden-function',
  severity: 'error',
  scope: 'php',
  run(ctx) {
    const seen = new Set();
    for (const call of calls(ctx.tokens, { includeKeywords: true })) {
      const entry = FORBIDDEN.get(call.name);
      if (!entry) continue;
      const [severity, hint] = entry;
      const line = ctx.tokens[call.nameIndex].line;
      const key = `${call.name}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.add({
        line,
        severity,
        message: `${call.name}() is not allowed in a theme.`,
        hint,
      });
    }
  },
};

export const superglobals = {
  id: 'php.superglobal-direct',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    const reported = new Set();
    for (let index = 0; index < ctx.tokens.length; index++) {
      const token = ctx.tokens[index];
      if (!isVar(token) || !SUPERGLOBALS.has(token.value)) continue;
      if (hasSanitizerNearby(ctx, token.line)) continue;
      const key = `${token.value}:${token.line}`;
      if (reported.has(key)) continue;
      reported.add(key);
      ctx.add({
        line: token.line,
        message: `${token.value} is read without a visible sanitizer.`,
        hint: 'Sanitize on input and escape on output. Review this line.',
      });
    }
  },
};

export const sqlInterpolation = {
  id: 'php.sql-interpolation',
  severity: 'error',
  scope: 'php',
  run(ctx) {
    for (let index = 0; index < ctx.tokens.length; index++) {
      if (!isVar(ctx.tokens[index], '$wpdb')) continue;
      const arrow = nextMeaningful(ctx.tokens, index);
      if (arrow === -1 || !isPunct(ctx.tokens[arrow], '->')) continue;
      const methodIndex = nextMeaningful(ctx.tokens, arrow);
      if (methodIndex === -1 || ctx.tokens[methodIndex].type !== 'ident') continue;
      const method = ctx.tokens[methodIndex].value;
      if (!['query', 'get_results', 'get_var', 'get_row', 'get_col'].includes(method)) continue;
      const open = nextMeaningful(ctx.tokens, methodIndex);
      if (open === -1 || !isPunct(ctx.tokens[open], '(')) continue;
      const { args } = splitArguments(ctx.tokens, open);
      const sql = args[0] ?? [];
      const hasPrepare = args.some((arg) => arg.some((token) => token.type === 'ident' && token.value === 'prepare'));
      if (hasPrepare) continue;
      const directInterpolation = sql.some((token) => token.type === 'string' && token.interpolated);
      const concatenated = sql.some((token) => isPunct(token, '.'))
        && sql.some((token) => token.type === 'var' || (token.type === 'string' && token.interpolated));
      const plainVariable = sql.some((token) => token.type === 'var');
      if (!directInterpolation && !concatenated && !plainVariable) continue;
      ctx.add({
        line: ctx.tokens[index].line,
        severity: directInterpolation || concatenated ? 'error' : 'info',
        message: `$wpdb->${method}() receives an interpolated query.`,
        hint: 'Use $wpdb->prepare( "… %s …", $value ) with placeholders.',
      });
    }
  },
};

export const nonceChecks = {
  id: 'php.nonce-check',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    if (!ctx.source.includes('$_POST') && !ctx.source.includes('$_REQUEST')) return;
    if (/(wp_verify_nonce|check_admin_referer|check_ajax_referer|wp_verify_nonce_field)/.test(ctx.source)) return;
    const line = firstLineContaining(ctx, ['$_POST', '$_REQUEST']);
    ctx.add({
      line,
      message: 'Request data is read without a nonce check in this file.',
      hint: 'Verify intent with check_admin_referer(), check_ajax_referer(), or wp_verify_nonce().',
    });
  },
};

export const capabilityChecks = {
  id: 'php.capability-check',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    if (!ctx.source.includes('$_POST') && !ctx.source.includes('$_GET')) return;
    if (/current_user_can\s*\(/.test(ctx.source)) return;
    if (!/(wp_insert_post|wp_update_post|wp_delete_post|update_option|delete_option|wp_update_user|wp_set_object_terms)\s*\(/.test(ctx.source)) return;
    const line = firstLineContaining(ctx, ['wp_insert_post', 'wp_update_post', 'wp_delete_post', 'update_option', 'delete_option', 'wp_update_user']);
    ctx.add({
      line,
      message: 'A state-changing operation has no visible capability check.',
      hint: 'Guard writes with current_user_can() for the specific capability.',
    });
  },
};

export const abspathGuard = {
  id: 'php.abspath-guard',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    // Template files are loaded by WordPress and do not need a guard. Library
    // files can be requested directly, so they benefit from one.
    if (!/^(inc|includes|src|lib|classes)\//.test(ctx.relative.replaceAll('\\', '/'))) return;
    if (!ctx.source.includes('<?')) return;
    const head = ctx.tokens.slice(0, 24);
    const hasGuard = head.some((token) => token.type === 'ident' && token.value === 'defined')
      && head.some((token) => token.type === 'string' && token.value.includes('ABSPATH'));
    if (hasGuard) return;
    ctx.add({
      line: 1,
      message: 'Library file has no ABSPATH guard.',
      hint: "Start with `if ( ! defined( 'ABSPATH' ) ) { exit; }`.",
    });
  },
};

export const globalPrefix = {
  id: 'php.global-prefix',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    const prefix = `${ctx.theme.prefix}_`;
    const tokens = ctx.tokens;
    let depth = 0;
    let classDepth = -1;
    let pendingClass = false;
    const ignored = new Set(['__construct', '__destruct', '__toString']);

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (isKeyword(token, 'class') || isKeyword(token, 'interface') || isKeyword(token, 'trait') || isKeyword(token, 'enum')) {
        pendingClass = true;
        continue;
      }
      if (isPunct(token, '{')) {
        depth++;
        if (pendingClass) {
          classDepth = depth;
          pendingClass = false;
        }
        continue;
      }
      if (isPunct(token, '}')) {
        if (classDepth === depth) classDepth = -1;
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (!isKeyword(token, 'function') || classDepth !== -1) continue;
      let nameIndex = nextMeaningful(tokens, index);
      if (nameIndex !== -1 && isPunct(tokens[nameIndex], '&')) nameIndex = nextMeaningful(tokens, nameIndex);
      if (nameIndex === -1 || tokens[nameIndex].type !== 'ident') continue;
      const name = tokens[nameIndex].value;
      if (ignored.has(name) || name.startsWith(prefix)) continue;
      ctx.add({
        line: token.line,
        message: `Global function ${name}() is not prefixed with "${prefix}".`,
        hint: 'Prefix global functions to avoid collisions with plugins and WordPress.',
      });
    }
  },
};

export const hardcodedLocal = {
  id: 'php.hardcoded-local-path',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const patterns = [
      /localhost/i, /127\.0\.0\.1/, /[A-Za-z]:\\/,
      /\/Users\//, /\/home\//, /\/var\/www\//, /wp-dev/i,
    ];
    for (const token of ctx.tokens) {
      if (token.type !== 'string') continue;
      const value = decodePhpString(token) ?? token.value;
      if (!patterns.some((pattern) => pattern.test(value))) continue;
      ctx.add({
        line: token.line,
        message: 'Hard-coded local path or host in a shipped file.',
        hint: 'Use home_url(), site_url(), or get_template_directory_uri().',
      });
    }
  },
};

export const templateParts = {
  id: 'php.template-part-missing',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    if (!ctx.theme.isClassic && !ctx.theme.isHybrid) return;
    const checks = {
      get_header: (args) => {
        if (!args[0]) return 'header.php';
        const name = literalArg(args[0]);
        return name === null ? null : `header-${name}.php`;
      },
      get_footer: (args) => {
        if (!args[0]) return 'footer.php';
        const name = literalArg(args[0]);
        return name === null ? null : `footer-${name}.php`;
      },
      get_sidebar: (args) => {
        if (!args[0]) return 'sidebar.php';
        const name = literalArg(args[0]);
        return name === null ? null : `sidebar-${name}.php`;
      },
      comments_template: (args) => (args[0] ? literalArg(args[0]) : 'comments.php'),
    };

    for (const call of calls(ctx.tokens)) {
      if (['get_template_part', '\\get_template_part'].includes(call.name)) {
        const args = expandTemplateArguments(call.args);
        if (!args) continue;
        if (args === call.args && call.name !== 'get_template_part') continue;
        if (args !== call.args) {
          const before = prevMeaningful(ctx.tokens, call.nameIndex);
          if (['->', '?->', '::'].includes(ctx.tokens[before]?.value)) continue;
          // The JS lexer splits qualified names, while PHP 8 emits one token.
          if (ctx.tokens[before]?.value === '\\') {
            const qualifier = ctx.tokens[prevMeaningful(ctx.tokens, before)];
            if (qualifier?.type === 'ident' || isKeyword(qualifier, 'namespace')) continue;
          }
        }
        const slug = literalArg(args[0] ?? []);
        if (!slug) continue;
        const name = literalArg(args[1] ?? []);
        const candidates = name
          ? [`${slug}-${name}.php`, `${slug}.php`]
          : [`${slug}.php`];
        if (!candidates.some((candidate) => ctx.themeFileExists(candidate))) {
          ctx.add({
            line: ctx.tokens[call.nameIndex].line,
            message: `get_template_part() target not found: ${candidates.join(' or ')}`,
            hint: 'Create the template part or fix the slug.',
          });
        }
        continue;
      }

      const resolver = checks[call.name];
      if (!resolver) continue;
      const target = resolver(call.args);
      if (!target || target.includes('null')) continue;
      if (!ctx.themeFileExists(target)) {
        ctx.add({
          line: ctx.tokens[call.nameIndex].line,
          message: `${call.name}() target not found: ${target}`,
          hint: 'Create the file or correct the argument.',
        });
      }
    }
  },
};

export const requireGlob = {
  id: 'php.require-glob',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    if (!/(glob|scandir|opendir)\s*\(/.test(ctx.source)) return;
    if (!/(require|include)(_once)?\s*\(?/.test(ctx.source)) return;
    const line = firstLineContaining(ctx, ['glob(', 'scandir(', 'opendir(']);
    ctx.add({
      line,
      message: 'PHP files are discovered dynamically and then included.',
      hint: 'Prefer explicit require_once calls; dynamic loading hides behavior.',
    });
  },
};

export const assetVersion = {
  id: 'php.asset-version',
  severity: 'info',
  scope: 'php',
  run(ctx) {
    for (const call of calls(ctx.tokens)) {
      if (!['wp_enqueue_style', 'wp_enqueue_script', 'wp_register_style', 'wp_register_script'].includes(call.name)) continue;
      const versionArg = call.args[3];
      const isEmpty = !versionArg || versionArg.filter((token) => token.type !== 'whitespace' && token.type !== 'comment').length === 0;
      const emptyString = versionArg && literalArg(versionArg) === '';
      if (!isEmpty && !emptyString) continue;
      ctx.add({
        line: ctx.tokens[call.nameIndex].line,
        message: `${call.name}() has no version argument.`,
        hint: 'Pass a theme version (for example wp_get_theme()->get( "Version" )) to bust caches.',
      });
    }
  },
};

function firstLineContaining(ctx, needles) {
  for (let index = 0; index < ctx.lines.length; index++) {
    if (needles.some((needle) => ctx.lines[index].includes(needle))) return index + 1;
  }
  return 1;
}

export const rules = [
  unescapedOutput,
  unescapedPrintf,
  printfArguments,
  scriptFooter,
  textDomain,
  translatorComments,
  forbiddenFunctions,
  superglobals,
  sqlInterpolation,
  nonceChecks,
  capabilityChecks,
  abspathGuard,
  globalPrefix,
  hardcodedLocal,
  templateParts,
  requireGlob,
  assetVersion,
];
