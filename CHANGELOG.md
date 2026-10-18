# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `php.script-footer` warns on known nonboolean `wp_enqueue_script` footer
  arguments, accepting booleans and WordPress 6.3+ options arrays. Literal arrays
  check the final known `in_footer` value; unrelated fields remain out of scope.
  Dynamic expressions, unknown keys/unpacks and non-function calls are skipped.
  Complex same-quote interpolations are also skipped; docs record the existing
  JS fallback's inline heredoc-terminator limitation.
  Both analyzers preserve inspected source; existing check workflows apply with
  no automatic fix. Shared call safeguards are reused from the printf rule.
- `php.printf-arguments` warns when literal `printf` formats need more value
  arguments. Supports singular gettext source strings, positional indexes and
  reuse, flags/padding, literal and star width/precision, global names and both
  analyzers. Extra arguments are legal; unresolved formats/lists and non-function
  calls are skipped. Existing check workflows apply, with no source execution
  or automatic format fixes. Leading-zero indexes and PHP's numeric format
  bounds are covered by regression tests. Literal dollar signs and escaped
  backslashes retain matching findings across analyzers.
- `php.template-part-missing` recognizes literal positional array argument
  unpacking for `get_template_part`, including short/long arrays, mixed leading
  arguments, multiple unpacks, comments, trailing commas and third data values.
  Specialized/generic fallbacks match WordPress; unresolved expanded paths,
  keyed arrays, heredoc/nowdoc paths, namespace-qualified functions and methods
  are conservatively skipped without source execution. Fully qualified global
  calls are supported, with matching JS/PHP analyzer results.
- `block.attribute-json` validates syntax in opening and self-closing block
  attributes under `templates/` and `parts/`. It shares delimiter scanning with
  balance checks, reports stable file/line diagnostics, and respects existing
  suppression, baselines, diff/fix loops and formats without rewriting JSON.
- `block.markup-balance` checks HTML under `templates/` and `parts/` for
  unclosed, unexpected, misnested, and unterminated block delimiters. Supports
  nesting, self-closing blocks, core aliases, exact file/line diagnostics,
  existing diff/baseline/fix loops, and HTML-comment suppression directives.
- JSON findings include `documentationUrl`, an encoded absolute file URL to
  the matching explanation in the installed catalogue. Stable explicit anchors
  cover all 42 checks and `meta.rule-error`; diff, dry-run, and post-fix reports
  use the same links without changing baseline identities or non-JSON output.
- `check --explain <rule-id>` prints a rule's rationale and before/after examples
  from the shipped catalogue, with entries for all 42 current rules. It works
  offline without a theme or toolchain, supports Markdown and JSON output, and
  rejects invalid IDs, unsupported formats, and conflicting scan options.
- `check --diff <ref>` limits reports and mechanical fixes to changed files,
  including staged, unstaged, and non-ignored new sources. Supports nested theme
  directories and Windows case-only renames; JSON reports expose the scope.
  Unattributed theme-wide findings are omitted and partial baseline updates
  are rejected. Git stays offline even in partial clones; missing comparison
  objects fail before fixes. Structure findings respect ignored files and use
  the source file's actual spelling on Windows.
- `check --fix` for missing `wp_body_open()` in classic/hybrid headers,
  missing third text-domain arguments in eligible two-argument gettext calls,
  and numeric normalization of `Tested up to` header values.
- `check --fix --dry-run` previews edits without writing files. JSON reports
  include edit locations and replacements; applied fixes recheck the theme and
  use the remaining findings for the exit code. Suppressions and baselines are
  respected, while ambiguous syntax and symlinked files stay unchanged.
- Repository configuration for Matt Pocock engineering skills: local
  Markdown issue tracking, default triage labels, and domain-doc reading rules.

### Fixed

- Recognize `?>` as the end of a PHP line comment so gettext fixes leave
  adjacent HTML and JavaScript unchanged, including when a real PHP call
  appears on the same line.
- Respect inline suppression on the opening `<body>` tag and `Tested up to`
  header line before planning or applying their mechanical fixes.
- Resolve suppression directives at their actual lines inside multiline CSS
  comments, including ordinary theme headers with LF or CRLF line endings.

### Verified

- `npm test`: 177 passing, 1 skipped on Windows (file-symlink privileges).
- Script footer acceptance: 10 CLI tests cover scalar/array types, duplicate
  keys, conservative skips, call identity, theme types, JS/PHP agreement,
  no source execution, suppression/baselines, diff/fix rechecks and formats.
  Local WordPress runtime fixtures verified scalar and array truthiness.
- printf acceptance: 11 real CLI tests cover shortages/corrections, format
  variants, gettext wrappers, global-call identity, conservative skips,
  theme types, JS/PHP parity, a PHP runtime oracle, suppression/baselines,
  diff/fix rechecks and offline explanations/output formats.
- Template-array acceptance: 11 real CLI tests cover candidates/fallbacks,
  literal syntax variants, dynamic skips, methods, JS/PHP tokenizer agreement,
  global/namespace calls, heredoc/nowdoc skips, legacy/data arguments,
  ignores/baselines, diff/fix rechecks and formats.
  The local WordPress implementation independently confirmed five candidate
  lists and missing/specialized/generic lookup results without executing theme
  source.
- Attribute JSON acceptance: 11 real CLI tests cover malformed syntax, nested
  values and escaping, syntax-only value types, BOM/CRLF, comment boundaries,
  independent balance/suppression, scope/overrides, diff/baselines, fix rechecks,
  output formats, offline explanation, and distinct same-line delimiter errors.
- Block markup acceptance: 11 real CLI tests cover invalid/valid delimiters,
  namespaces, comment boundaries, BOM/CRLF, nested parts, scope and severity,
  HTML suppression, ordinary text containing C/JS comment markers,
  diff/baselines, fix rechecks, formats and explanation.
- JSON documentation acceptance: 6 CLI integration tests cover both JSON
  formats, exact rule targets, internal diagnostics, unique anchors, diff/fix
  reports, existing baseline fingerprints, non-JSON output, and a relocated kit
  with Unicode, spaces, `#`, and `%` in its path.
- `check --explain` acceptance: 6 CLI integration tests cover all 42 catalogue
  entries, execution outside a theme without tools, broken configuration,
  read-only behavior, text/JSON formats, help, and invalid/conflicting options.
- `check --diff` acceptance: 14 CLI integration tests cover real Git changes,
  clean scopes, Unicode paths, nested themes, renames/deletions, fixes and
  baselines, invalid refs, missing Git, partial-clone offline failures, ignored
  structure files, actual Windows path spelling, and output formats.
- Each regression was reproduced with a failing CLI test before its fix;
  coverage includes dry runs, applied edits, both PHP line-comment forms,
  JS/auto/PHP analysis, suppression on multiline body markup, and version-header
  suppression without rearranging the theme metadata.
- Combined fix fixture passes PHP syntax validation; Yuki dry run proposes no
  edits and reports 0 errors, 0 warnings, 8 info findings.

## [0.1.0] - 2026-10-17

### Added

- Zero-dependency `wptk` CLI with `init`, `adopt`, `check`, `doctor`, `make`,
  `package`, `verify-package`, `release`, `version bump`, `pot`, `shot`,
  `audit`, `preview`, and `install`.
- Static checks for classic, block, and hybrid WordPress themes.
- Scaffolding templates for classic, block, and hybrid themes.
- CDP-based screenshots and route audits using the system Edge or Chrome.
- Reproducible packaging from a committed Git revision with strict
  `.distignore` semantics.
- Offline POT generation for PHP and JavaScript gettext calls.
- Shared agent skills for Claude Code, Codex, and DeepSeek Harness.

### Verified

- `node --test`: 75 tests pass, including unit, package, scaffold, i18n, install,
  and browser tests.
- Dogfood against `yuki-theme` on 2026-10-17:
  - `wptk check`: 0 errors, 0 warnings, 8 info findings.
  - `wptk package --rev HEAD`: 34 files, with the same entry list as the
    theme's existing packager.
  - `wptk pot`: 112 msgids, matching `languages/yuki.pot` exactly.
  - `wptk shot`: a 1200x900 PNG from the local WordPress site.
- `claude plugin validate . --strict` passes.
- Claude `plugin marketplace add` and `plugin install` succeed against a
  temporary `CLAUDE_CONFIG_DIR`.
- Codex `plugin marketplace add` and `plugin add` succeed against a temporary
  `CODEX_HOME`; the plugin cache contains all six skills.
