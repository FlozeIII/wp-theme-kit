# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [0.3.0] - 2026-10-19

### Added

- `wptk preview --link <dir>` mounts a local design-comparison directory under
  the WordPress root (junction/symlink, copy fallback), records it in
  `wp-content/uploads/wp-theme-kit/links.json`, and adds `--link-status` plus
  `--link-remove`. Paths are validated `[a-z0-9-]` segments, sources must stay
  inside the working directory, and the mount can be screenshotted through the
  real site URL. Removal never deletes a copied tree, and a corrupt manifest is
  reported instead of silently ignored. This lets an oil-ui comparison page
  load the site's CSS and JS; wptk has no runtime dependency on oil-ui.
- A full Simplified Chinese README (`README.zh-CN.md`) kept in structural
  parity with the English one, with language links at the top of both files.
  User-facing command, configuration and behaviour changes must update both.

## [0.2.1] - 2026-10-18

### Fixed

- Browser automation no longer hangs or fails on cleanup: the CDP HTTP connect,
  WebSocket handshake and each command are bounded, closing a page rejects
  pending calls, and the temporary profile is removed with a retry that never
  fails the command.
- Windows stops the whole Chromium process tree, so a finished command releases
  its sockets and profile instead of leaving the caller waiting.
- Browser startup tolerates slower CI machines, and the browser suites allow
  180 seconds per test.
- Cross-platform CI defects are fixed: Windows path comparisons use `realpath`,
  the unsafe harness-path fixture is platform-specific, and the relocated-CLI
  fixture copies files explicitly.
- CI runs browser acceptance on Ubuntu and macOS because hosted Windows runners
  intermittently hang headless Edge; Windows keeps the non-browser suite. Jobs
  cap each test at 180 seconds and force-exit the runner.

## [0.2.0] - 2026-10-18

### Added

- `wptk mu-plugin install|status|remove|mail` installs optional mail-capture and
  HTTP-stub helpers into a local WordPress site's `wp-content/mu-plugins/`,
  records them in a manifest, upgrades older copies, adopts current marked
  helpers missing from the manifest, and refuses newer or unmarked files without
  `--force`. `remove` deletes only regular files whose marker names the recorded
  helper. Captured mail is listed (newest first, 50 by default) and cleared from
  the CLI; HTTP fixtures replay in file-name order with pass-through or strict
  mode. A one-time harness config controls both helpers, which stay inert on
  production unless the `wp_theme_kit_harness_enabled` filter opts in; an unsafe
  config is refused by `mail` and reported by `status`. JSON mode keeps stdout
  to one document.
- `shot` and `audit` accept `--cookie-file <json>` (and `preview.cookieFile`) to
  load session cookies for authenticated pages such as `/wp-admin/post-new.php`.
  Cookies are applied to every route before navigation, values never appear in
  output, and invalid fixtures exit 2 before the browser starts.
- `compare <expected.png> <actual.png>` compares two screenshots without a
  browser, failing when more than `--tolerance` (0..1) of pixels differ by more
  than `--channel` (0..255). `--out` writes a diff PNG with changed pixels in red
  and unchanged pixels faded, and refuses to overwrite an input; size mismatches
  exit 1 without a diff. Supports 8-bit non-interlaced gray, RGB, gray+alpha and
  RGBA PNGs up to 50 megapixels; palettes, 16-bit, interlacing and `tRNS`
  transparency are rejected.
- `audit` now asserts duplicate `id` attributes, links with no accessible name
  and form controls with no label, failing the run and listing each finding with
  its route. Names come from `aria-labelledby`, `aria-label`, visible text, image
  `alt`/SVG `title`, associated labels and `title`; `placeholder`, `name` and
  `value` never count, and hidden/`aria-hidden` content is skipped. JSON adds
  `duplicateIds`, `emptyLinks` and `unlabeledControls` per route. Disable with
  `preview.guards.accessibility: false` or `--no-guard`; findings are not
  baselineable. `shot` and its screenshot protection are unchanged.
- `audit --baseline <file>` accepts known console errors and exact horizontal
  overflow by URL, viewport and color scheme, preserving raw JSON observations
  and reporting suppression counts. Message/count/width changes still fail.
  `--update-baseline` atomically snapshots all routes; partial/unguarded updates
  and invalid files fail safely. Static baselines and screenshot guards remain
  separate; HTTP/network assets, images and selectors stay actionable. New theme
  templates exclude the default audit baseline from release artifacts.
- `release --notes [--since <ref>]` drafts grouped Markdown and JSON release
  notes from offline committed history. Automatic previous tags, explicit
  ancestor ranges, Conventional Commit groups, breaking markers and literal
  monorepo paths are supported. The heading uses the committed version; notes
  and ZIP share a pinned target. Missing/shallow history fails before replacing
  an artifact. Legacy release output and publishing boundaries remain intact.
- `theme-check --zip <file>` optionally checks an extracted artifact using local
  WP-CLI, WordPress libraries and Theme Check's official command class. Temporary
  core/checker links and static options isolate the scan from site config,
  database and theme PHP. Reports preserve checker findings/status; missing tools
  skip explicitly. Strict archive paths, isolated CLI config/cache and cleanup
  apply on success and failure. No runtime dependencies or downloads.
- `pot --merge` preserves existing POT header comments, manual metadata and
  custom fields while refreshing generated metadata and rebuilding source
  entries. Missing files use normal defaults; malformed/ambiguous headers or
  invalid UTF-8 fail before replacement. Supports quoted continuations and
  folded values; run the read-only `--check` separately.
- `package.subdir` selects a theme inside a Git repository for packaging,
  release preflight and artifact verification. Config may live at the Git root
  or selected theme root. Metadata, checks, POT/version, exclusions and default
  output use the theme root; only the committed subtree ships under its slug.
  Strict paths, physical-directory checks, non-tree rejection, isolated Git
  attributes, commit timestamps, atomic output and offline object reads preserve
  packaging invariants. Null/empty configuration keeps root-theme behavior.
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

- Audit JSON stays parseable on failures, and failed network assets remain
  independent failures even when their console messages are accepted.
- Duplicate-path preview routes retain their own configuration, including dark
  mode. Browser spawn errors now exit as environment failures and clean up the
  temporary profile instead of raising an unhandled process error. Profile
  removal retries temporary Windows file locks within a bounded interval.
- `release --rev <tag>` now requires the tag's commit to match repository HEAD
  before notes or ZIP creation, preserving existing artifacts on failure.
  Real lightweight/annotated tags of any name and explicit tag refs are
  recognized; ambiguous short names require an explicit ref regardless of Git
  warning settings. Full refs use exact namespaces; packaging pins the preflight
  commit. Detached HEAD and nested themes work; historical SHA/branch
  releases and `package` behavior remain available. Git reads stay offline.
- Recognize `?>` as the end of a PHP line comment so gettext fixes leave
  adjacent HTML and JavaScript unchanged, including when a real PHP call
  appears on the same line.
- Respect inline suppression on the opening `<body>` tag and `Tested up to`
  header line before planning or applying their mechanical fixes.
- Resolve suppression directives at their actual lines inside multiline CSS
  comments, including ordinary theme headers with LF or CRLF line endings.

### Verified

- `npm test`: 248 passing, 1 skipped on Windows (file-symlink privileges).
- Audit baseline: 13 CLI tests with real Chromium/local HTTP fixtures cover
  matching, regressions, profile isolation, independent guards, updates,
  malformed inputs, output preservation and screenshot protection.
  Real Yuki baseline update/read passed at 1200x900 (HTTP 200, no console errors
  or overflow), preserving source state and baseline bytes on the read pass.
- Release tag/HEAD gate: 10 CLI tests cover reference types/ambiguity, detached
  HEAD, nested themes, notes, artifact preservation and offline failures.
  Isolated Yuki rejected an old tag at current HEAD, then produced a verified
  40-entry ZIP with 13 note commits after checking out the tag's commit.
- Subdirectory packaging: 14 CLI tests cover ZIP paths/bytes, committed-only
  exclusions, tags/older commits, traversal/aliases/gitlinks, Git attributes,
  Unicode/spaces, theme types, preflight, release and verification, custom
  exclusions, legacy root behavior and missing partial-clone objects offline.
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
