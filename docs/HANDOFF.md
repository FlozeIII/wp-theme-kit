# Handoff

This document is the entry point for an agent continuing work on `wp-theme-kit`.
It does not assume access to any previous chat, plan file, or local session.

## Current state

- Version: `0.1.0`
- Status: usable; all four capability areas and the initial v0.2 rule depth
  and fix loop roadmap group are implemented.
- Tests: `npm test` -> 320 passing, 1 skipped (321 total) on Windows because file-symlink
  creation requires privileges. The combined fix fixture passes PHP lint.
- Dogfood against `yuki-theme`:
  - `wptk check`: 0 errors, 0 warnings, 8 info.
  - `wptk package --rev HEAD`: same entry list as the theme's existing packager.
  - `wptk pot`: 112 msgids, identical to `languages/yuki.pot`.
  - `wptk shot`: 1200x900 PNG.
  - Accessibility assertions were accepted with a local HTTP fixture in Edge
    (`tests/integration/accessibility.test.mjs`). Yuki has no `.wp-theme-kit.json`
    or site URL in this checkout, so `wptk audit` could not run against live
    WordPress pages; `wptk doctor` reports preview unavailable.
- Claude `plugin validate . --strict` passes.
- Claude and Codex plugin installs were smoke-tested in temporary config roots.
- CI: `.github/workflows/ci.yml` runs `node --test` on Ubuntu/Windows (Node
  22 and 24) and a separate browser job on Ubuntu/Windows/macOS (Node 24) that
  runs the five browser suites only when `findBrowser({})` finds a browser.
  GitHub execution is unverified: this checkout has no `git remote`.
- The initial baseline and `check --fix` implementation are recorded in Git.
  Inspect `git status` before starting the next roadmap item; commit only when
  asked.

## First commands

```bash
cd D:\Projects\wp-theme-kit
npm test
node bin/wp-theme-kit.mjs --help
node bin/wp-theme-kit.mjs doctor
claude plugin validate . --strict
```

Read `AGENTS.md`, this file, and `docs/ROADMAP.md` before changing code.

## Architecture map

```text
bin/wp-theme-kit.mjs
  -> src/cli.mjs                  global flags, command registry, exit codes
     -> src/commands/<name>.mjs   thin argument parsing and presentation
        -> src/check/             static analysis
        -> src/package/           git archive, verify, version
        -> src/theme-check/       optional static WordPress artifact inspection
        -> src/scaffold/          templates and code generation
        -> src/preview/           CDP screenshots, audits and PNG comparison
        -> src/mu-plugin/         helper install, fixture and mail parsing
        -> templates/mu-plugin/   mu-plugin helper templates
        -> src/i18n/              POT extraction and comparison
        -> src/install/           harness installation
        -> src/config.mjs         .wp-theme-kit.json + inference
        -> src/theme.mjs          theme type, header, slug, prefix
        -> src/env.mjs            PHP, WordPress, WP-CLI, browser discovery
        -> src/fs.mjs             walking, atomic writes, safe link removal
```

### Check engine

- `src/check/lexer-php.mjs` produces normalized tokens when PHP is unavailable.
- `src/check/analyzer.php` produces the same tokens with `token_get_all`.
- `src/check/analyze.mjs` picks one, batch-runs PHP, and falls back per file.
- `src/check/rules/{structure,php,assets}.mjs` contain the rules.
- `src/check/rules/enqueue.mjs` provides `php.script-footer`, a warning for known
  nonboolean fifth `wp_enqueue_script` arguments, and nonboolean final known
  `in_footer` values in literal short/long options arrays (WordPress 6.3+).
  Empty/missing options and unrelated fields are accepted. Unknown expressions,
  argument lists, array keys or array unpacking are skipped. Scalar/array type
  classification re-lexes only the reconstructed argument without evaluating it,
  so native partial string tokens and JS whole strings agree. Both analyzers
  preserve source. No automatic fix is offered; the existing pipeline applies.
  Acceptance: `tests/integration/check-script-footer.test.mjs` (10 CLI tests;
  native comparison skips without PHP). Local WordPress runtime fixtures also
  confirmed that string 'false' selects the footer in both parameter forms.
  Complex same-quote interpolations are skipped. Existing JS lexer limitation:
  heredoc/nowdoc closing labels followed by syntax on the same line can consume
  later source and hide later calls; PHP mode avoids that fallback limitation.
- `src/check/php-calls.mjs` holds the shared global-call resolution, namespace/
  import and attribute safeguards, plus known positional argument grouping.
  These helpers were extracted unchanged from the printf rule for both rules.
- `src/check/rules/printf.mjs` adds `php.printf-arguments`, a warning in all PHP
  files. `src/check/printf-format.mjs` computes minimum value counts for literal
  formats, positional reuse/mixing, `%%`, flags/padding and star width/precision.
  Singular gettext return wrappers expose source literals; translations are not
  loaded. Extra values are allowed. Dynamic/unresolved formats and argument
  lists are skipped, as are methods, constructors and attributes. Namespaced or
  imported files require explicitly global function/wrapper names. Neither
  analyzer evaluates source, and no fix is offered. Existing suppression,
  severity, baseline/diff, formats and fix rechecks remain independent.
  Acceptance: `tests/integration/check-printf.test.mjs` (11 CLI tests, native
  comparison skips without PHP; the runtime star oracle requires PHP 8+).
- `src/check/template-arguments.mjs` expands unkeyed literal positional arrays
  (`...[...]`, `...array(...)`) for `get_template_part` target checks. It accepts
  leading direct arguments, multiple unpacks, comments, trailing commas and
  third data arguments. Fully qualified global calls are supported. Expanded
  path slots must be exact single/double-quoted static strings;
  optional null/empty/omitted names use the generic target. Keyed/nested unpacks,
  dynamic paths and unknown spread sources are skipped, as are heredoc/nowdoc
  paths, namespace-qualified functions and expanded methods.
  No PHP is evaluated. The existing `php.template-part-missing` rule keeps its
  specialized/generic fallback, messages, pipeline and ordinary-call behavior.
  `splitArguments` accepts optional delimiter pairs for this array grouping;
  its default call behavior is unchanged.
  Acceptance: `tests/integration/check-template-arrays.test.mjs` (11 CLI tests;
  native PHP comparison skips when PHP is unavailable). WordPress's local
  `general-template.php` independently confirmed candidate ordering and lookup.
- `src/check/rules/blocks.mjs` adds the file-scoped `block.markup-balance`
  error rule for HTML under `templates/` and `parts/` in all theme types.
  Its comment scanner tracks a stack and delimiter lines, accepts self-closing
  blocks and core aliases, and reports unfinished comments, unclosed blocks,
  unexpected closes and closing-order errors. It does not parse attribute JSON.
  At a misnested ancestor close, report then drop that ancestor and its open
  children; unmatched closes leave the stack intact. HTML-comment suppression
  affects findings rather than stack state. No block fixes are planned.
  HTML sources read directives only from HTML comments; C/JS comment syntax in
  ordinary text cannot suppress findings.
  Acceptance: `tests/integration/check-blocks.test.mjs` (11 CLI tests).
- The same module provides `block.attribute-json`, an independent error rule
  using the shared delimiter generator. Nonempty attribute text on complete
  opening/self-closing comments must parse as JSON; valid values of any type
  are accepted without schema validation. Closing and unfinished comments are
  excluded. Error messages are stable across Node parse-error wording and
  point to the opening line. Messages include the one-based opening column
  in UTF-16 code units to distinguish same-name errors on one line.
  Balance state, ignores, baseline/diff, existing
  output formats and fix rechecks retain their separate behavior. JSON errors
  are not mechanically fixed.
  Acceptance: `tests/integration/check-block-attributes.test.mjs` (11 CLI tests).
- `src/check/index.mjs` discovers files, runs rules, applies severity overrides,
  inline ignores, and baselines, then renders the report.
- A rule calls `ctx.add({ line, severity, message, hint, file })`.
- Rule IDs are stable API. Changing an ID changes baseline fingerprints.
- `src/check/documentation.mjs` resolves per-rule URLs into the installed
  catalogue. JSON report findings add `documentationUrl` after suppression and
  fix planning, so baseline identities/schema and non-JSON output stay intact.
  Explicit HTML anchors use rule IDs with dots replaced by hyphens. They cover
  all 42 registered checks plus the synthetic `meta.rule-error` diagnostic.
  URLs are installation-specific and require no network calls; use a Markdown
  viewer supporting explicit anchors, or read the entry through `--explain`.
  Acceptance: `tests/integration/check-documentation.test.mjs` (6 CLI tests).
- `src/check/explain.mjs` reads the rule entry directly from the shipped
  `skills/wp-theme-dev/references/checks.md` catalogue. All 42 current rules
  have rationale and before/after examples under exact level-three ID headings.
  Code fences protect example headings from section splitting. Explanation
  bypasses theme/configuration/tool discovery; scan flags and unsupported
  formats are rejected. Text is Markdown; JSON contains `rule` and
  `documentation`. Acceptance: `tests/integration/check-explain.test.mjs`
  (6 CLI tests).
- Inline ignores: `wptk-ignore`, `wptk-ignore-next-line`, `phpcs:ignore`.
- `src/check/diff.mjs` reads changed paths with offline Git commands.
  `--diff` filters concrete-file findings before baseline suppression and fix
  planning, while keeping full-theme scan context. Partial baseline updates
  are rejected. Partial clones never fetch missing objects; unavailable
  comparison objects exit 2 before edits. Concrete findings use the actual
  scanned paths, including ignores and Windows casing.
  Acceptance: `tests/integration/check-diff.test.mjs` (14 tests).
- `src/check/fix.mjs` plans whitelisted edits from visible findings and applies
  them atomically per file. Dry runs emit plans only; applied fixes reload theme
  metadata and run the checker again. See the README's Mechanical fixes section
  for the whitelist and CLI behavior. Acceptance fixtures live in
  `tests/integration/check-fix.test.mjs`.
- Fix regression coverage includes PHP closing tags inside line comments and
  source-line suppression for body-hook and version-header edits. Check the
  opening tag's line for multiline `<body>` markup. CSS directives use their
  actual lines within the comment, including normal multiline theme headers.

### Packaging pipeline

- `src/package/distignore.mjs` parses strict literal paths.
- `src/package/context.mjs` resolves optional `package.subdir` from the Git root,
  accepting config at the repository root or selected theme root. It rejects
  path traversal, patterns, invalid types and physical directory aliases.
  Package/release/verify re-infer theme metadata while preserving explicit
  config/overrides; other CLI commands retain their context behavior.
  Checks, POT/version, exclusion paths and default output are theme-relative.
- `src/package/archive.mjs` resolves a revision, reads `.distignore` from that
  revision, builds through a temporary bare repo with alternates, neutralizes
  attributes, and writes atomically. Subdirectory mode archives the selected
  committed tree directly under slug/, using the original commit timestamp
  (Git archive --mtime support required). Non-tree selections fail; all Git reads
  disable lazy fetch. The report revision remains the resolved commit ID.
- `src/package/verify.mjs` reads the zip's central directory and checks the
  artifact, not the worktree.
- `src/package/index.mjs` runs preflight checks and orchestrates.
- Release's clean-tree gate still covers the whole Git repository. Acceptance:
  `tests/integration/package-subdir.test.mjs` (14 CLI tests) covers monorepo
  isolation, old commits/tags, dirty files, strict locations, aliases/gitlinks,
  hostile attributes, offline partial clones, theme types, preflight and release,
  independent verification, custom exclusions and existing root behavior.
- `src/zip/read.mjs` has no dependencies.
- `src/package/notes.mjs` adds opt-in `release --notes [--since <ref>]` drafts.
  It excludes target tags when selecting Git's nearest reachable prior tag,
  resolves explicit ancestor boundaries, reads the committed theme version and
  collects non-merge commits in reverse topological order. Conventional types
  form stable groups; breaking markers lead, and unknown subjects remain whole.
  Markdown is escaped; JSON retains complete commit IDs and range metadata.
  Subdir histories use literal pathspecs; automatic tag selection is repo-wide.
  Notes are computed before packaging and pin it to the same commit. Missing
  objects never fetch; shallow histories fail clearly before output replacement.
  History reads disable replacement refs to match the archive's original objects;
  tag listings force a machine-safe format regardless of column/color settings.
  Without the option, JSON shape/checklist behavior remains intact.
  Acceptance: `tests/integration/release-notes.test.mjs` (15 CLI tests); isolated
  Yuki v1.2.0..v1.3.0 run retained all 13 non-merge commits, produced the verified
  40-entry ZIP, repeated identically and left the source worktree unchanged.
- Release preflight resolves real Git tag references instead of guessing from
  version spelling. Any direct lightweight/annotated tag must peel to repository
  HEAD, including full `refs/tags/` and `tags/` names. Mismatches fail with both
  commits and a detached-checkout hint before notes/checks/archive replacement.
  Ambiguous short names require explicit tag/branch refs even when Git warning
  settings disable ambiguity detection. Full refs use their exact namespace;
  packaging pins the preflight commit while retaining the user's requestedRev.
  SHA, branch and commit expressions
  retain historical behavior; `package` still accepts old tags.
  Acceptance: `tests/integration/release-tag.test.mjs` (10 CLI tests) covers notes,
  nested configs, detached HEAD, ref names, output preservation and offline
  missing/non-commit refs. Isolated Yuki rejected v1.3.0 at newer HEAD and then
  produced a verified 40-entry ZIP with 13 note commits at detached tag HEAD;
  the source repository's HEAD, tags and working tree were unchanged.

### Optional Theme Check

- `theme-check --zip` validates one slug directory and literal extraction paths
  before dependency discovery; malformed input exits 2 even without tooling.
- `src/theme-check/archive.mjs` materializes ZIP entries as regular files under
  a new temporary root, rejecting traversal, Windows device/short-name aliases,
  case collisions and file/directory conflicts.
- `src/theme-check/index.mjs` discovers local WordPress/PHP/WP-CLI and the
  installed Theme Check CLI adapter. Missing tooling returns a visible skip
  (`ok: null`, `skipped: true`, exit 0); invocation/output errors exit 2.
- `src/theme-check/run.php` runs through WP-CLI eval-file --skip-wordpress.
  It loads only static core libraries, supplies non-DB options and an in-memory
  cache, and invokes the official Theme_Check_Command. Site config, DB, active
  plugins and theme PHP are not loaded. Child-theme parent files are absent.
  Core/checker links, CLI config and cache are temporary; links are unlinked
  before recursive cleanup. Completed reports preserve checker status (0/1)
  and type/value findings. The subprocess is bounded to 60 seconds.
- Acceptance: `tests/integration/theme-check.test.mjs` (10 CLI tests on Windows;
  the missing-PHP/direct-launcher fixture is Windows-specific).
  Real WordPress 7.1.3 / Theme Check 20260901 / WP-CLI accepted classic Yuki
  (REQUIRED 1, WARNING 1, RECOMMENDED 5, INFO 5) and block/hybrid fixtures;
  theme PHP was never executed. Runtime compatibility errors remain visible.

### Preview pipeline

- `src/preview/browser.mjs` launches Edge/Chrome with a system CDP port and
  returns a small page client.
- The viewport is set before navigation. Do not switch to
  `--screenshot --window-size`; it renders at a wider layout and crops.
- `src/preview/capture.mjs` applies guards and writes images atomically.
- `src/preview/audit.mjs` reports console errors, failed assets, overflow,
  unloaded images, missing selectors, and (since v0.2) accessibility assertions.
- `src/preview/accessibility.mjs` owns the DOM snapshot (`ACCESSIBILITY_EXPRESSION`)
  and pure analysis for duplicate ids, links with no accessible name and
  unlabeled form controls. Names prefer `aria-labelledby`, then `aria-label`,
  then visible text / associated label, then image `alt`/SVG `title`/`title`
  (links) or `title` (controls); `placeholder`/`name`/`value` never count.
  Entries under `aria-hidden` or `hidden` are skipped; hidden/submit/button/
  reset/image inputs are not labelable. Failure lines are capped at five
  identifiers but JSON keeps complete lists.
- `capture.mjs` accepts an optional `collect` hook so `audit` can snapshot
  accessibility data in the same browser visit; `shot` passes nothing, gets no
  `extra` result field, and is unchanged. The guard is
  `preview.guards.accessibility` (default true, so `--no-guard` and the config
  key both disable it); findings are not baselineable. Unlike the layout/console
  guards it is evaluated in `audit.mjs`, not `capture.guardFailures`, because
  shot must never collect the snapshot. JSON adds `duplicateIds`, `emptyLinks`
  and `unlabeledControls` per route; pretty output adds the counts.
- Acceptance: `tests/unit/accessibility.test.mjs` (7 name-resolution/analysis
  tests) and `tests/integration/accessibility.test.mjs` (7 CLI tests in real
  Chromium over a local HTTP server: defect facts, pretty counts, clean page,
  guard opt-out, `--no-guard`, baseline non-suppression, untouched `shot`).
  Hidden/`aria-hidden` text, image `alt` and SVG `title` are excluded. Ids are
  compared verbatim (empty ids only). The fixture serves a decodable 1x1 PNG
  because `minimalPng()` only satisfies header parsers and browsers reject it.
- `src/preview/png-codec.mjs` decodes the 8-bit non-interlaced PNG subset
  Chromium emits (gray, RGB, gray+alpha, RGBA; filters 0-4; IHDR first, IEND last,
  every chunk CRC checked) and encodes RGBA diff images with `node:zlib`. Palette,
  16-bit, interlaced, `tRNS` and images above 50 megapixels are rejected with
  exit 2. `png.mjs` still only reads the header for `shot`.
- `src/preview/compare.mjs` compares RGBA images: `channel` is the per-channel
  delta that marks a pixel changed, `tolerance` the allowed changed-pixel ratio
  (inclusive), and the diff image paints changed pixels red with unchanged
  pixels faded 80% toward white.
- `src/commands/compare.mjs` provides browser-free
  `wptk compare <expected> <actual>` with `--out`, `--tolerance`, `--channel`
  and `--json`; exit 0 within tolerance, 1 for a change or size mismatch, 2 for
  bad input. `--out` may not overwrite an input image. JSON keeps stdout
  parseable and suppresses pretty lines. Acceptance:
  `tests/unit/png-codec.test.mjs` (7), `tests/unit/compare.test.mjs` (6) and
  `tests/integration/compare.test.mjs` (2 CLI tests over real `shot` captures:
  identical copy, color change plus decoded diff, tolerance/channel, size
  mismatch, overwrite refusal and argument validation).
- `src/preview/cookies.mjs` validates `--cookie-file`/`preview.cookieFile`
  fixtures (JSON `{cookies:[...]}`; name/value required, exactly one of `url` or
  `domain`, defaults path `/`, httpOnly true, secure false, sameSite Lax, and
  `None` requires secure). `capture.mjs` applies them to every route before
  `goto`; `shot` and `audit` both accept the flag, and the config path is
  theme-root-relative. `resolveCookieFile` centralizes path resolution and
  rejects an empty flag or empty config instead of silently skipping
  authentication. Values are never printed and invalid fixtures exit 2 before
  the browser starts. Acceptance: `tests/unit/cookies.test.mjs` (6 validation
  tests) and `tests/integration/editor-cookie.test.mjs` (5 CLI tests: 4 in real
  Chromium covering 401 without cookies, 200/editor title on two routes,
  authenticated screenshot, and config/flag resolution; 1 browser-free
  validation test for bad fixtures). Live wp-admin acceptance still needs a
  running site and credentials.
- `src/preview/baseline.mjs` implements opt-in `audit --baseline <file>` and
  atomic `--update-baseline`. Profiles match exact URL, actual viewport and
  color scheme; console entries match text/count, overflow exact scrollWidth.
  Raw facts stay in JSON with per-route/total suppression metadata. Default
  updates write `.wp-theme-kit-audit-baseline.json` in the theme root; explicit
  paths are cwd-relative. No automatic discovery or static-check baseline reuse.
  New theme templates exclude the default audit baseline via `.distignore`;
  existing themes/custom paths need the corresponding literal exclusion.
  Updates snapshot enabled guards across all routes and replace stale entries;
  partial/unguarded updates are rejected. Invalid files fail before browser
  startup; incomplete scans preserve output. HTTP/network asset, image and
  selector failures remain independent. Screenshot guards remain unchanged.
  Capture's guard evaluator is shared with audit; configured duplicate paths
  retain their distinct profiles. Browser spawn errors clean up and exit 2;
  profile removal uses bounded retries for temporary Windows file locks.
  Acceptance: `tests/integration/audit-baseline.test.mjs` (13 CLI tests, real
  Chromium/local HTTP; browser-dependent cases skip when unavailable).
  Real Yuki at localhost:8080 passed baseline update/read at 1200x900: HTTP 200,
  no console errors or overflow, no remaining failures. Source HEAD/worktree
  stayed unchanged; the temporary local PHP process was stopped afterward.

### Mu-plugin helpers

- `wptk mu-plugin install|status|remove|mail` (ADR 0001; replaces the earlier
  undefined `wptk harness install` idea). `src/mu-plugin/index.mjs` owns helper
  filenames/version, the manifest (`.wp-theme-kit-harness.json` in
  `wp-content/mu-plugins/`), config paths, install planning, mail index parsing
  and deletion; `src/commands/mu-plugin.mjs` performs atomic writes with
  rollback and presents results. `src/mu-plugin/fixtures.mjs` validates fixture
  documents; the HTTP matcher lives only in the PHP stub, so the schema has one
  implementation.
- Install copies `templates/mu-plugin/wp-theme-kit-mail.php` and
  `wp-theme-kit-http-stub.php` atomically with rollback on failure. Older marked
  helpers upgrade; newer or unmarked files are blocked unless `--force`, and a
  current marked helper missing from the manifest is adopted. The harness config
  (`wp-content/wp-theme-kit-harness/wp-theme-kit-harness.json`) is written once
  and never overwritten; `mail/`, `http/` and `index.php` are created alongside.
  All four actions require `wp-content` and exit 2 on a non-WordPress root.
- Mail capture hooks `pre_wp_mail`, writes a single-part (plain or HTML) RFC822
  `.eml` named `Ymd-His-<sha1(recipients)[0..8]>.eml` plus one JSON line in
  `mail/index.jsonl`, copies readable attachments beside it under a hashed name
  (never embedded), and returns true. The HTTP stub hooks `pre_http_request`,
  replays the first valid fixture whose method matches and whose URL regex
  matches the full URL, and supports `body`, `json`, `bodyFile` (relative,
  <=5 MiB) or `base64`; `delayMs` is capped at 10000 ms. Unmatched requests pass
  through unless `http.strict` is true (then a `wptk_no_fixture` `WP_Error`),
  and `http.hosts` limits stubbed hosts. Both helpers are inert on
  `wp_get_environment_type() === 'production'` unless the
  `wp_theme_kit_harness_enabled` filter opts in, and neither prints values.
- `mail` lists newest-first (default 50) with `--limit`, and `--clear` deletes
  only indexed `.eml`/attachment files plus the index; an unsafe or malformed
  config is refused (exit 2). `remove` needs a manifest (exit 1 otherwise) and
  deletes only regular files whose marker names the helper it recorded; a
  mismatch is reported and exits 1. `status` reports helpers with per-helper
  state (`unchanged`/`update`/`blocked`), root, directories, config error and
  invalid fixtures without printing contents.
- JSON mode keeps stdout to one JSON document; on error paths usage text and
  hints go to stderr.
- Acceptance: `tests/unit/mu-plugin.test.mjs` (10 tests for validation, load,
  manifest, planning, index, mail read/clear/default limit),
  `tests/integration/mu-plugin-install.test.mjs` (15 CLI tests over a fake
  WordPress root, including adoption, marker-checked removal, status drift and
  config errors, JSON purity, plus `php -l` when PHP exists) and
  `tests/integration/mu-plugin-behavior.test.mjs` (5 PHP tests against stub
  WordPress functions: capture with `.eml` naming and single-part layout,
  fixture replay, invalid-fixture skipping, pass-through/strict, production
  guard; skipped when PHP is unavailable).
- Live acceptance against a running WordPress install has not been done here;
  record it when a site is available.

### i18n

- `src/i18n/functions.mjs` is the single source for gettext signatures.
- `src/i18n/extract.mjs` extracts PHP literals and `wp.i18n` literals.
- `src/i18n/pot.mjs` writes and parses POT; comparison ignores references.
- `src/i18n/pot-header.mjs` merges maintained header comments/metadata into a
  fresh POT for `pot --merge`. Five generated fields always refresh:
  Project-Id-Version, POT-Creation-Date, X-Generator, X-Domain and Content-Type.
  Existing manual/custom fields (including empty values) override defaults.
  UTF-8 decoding is strict; malformed/duplicate headers or duplicate field names fail
  before atomic output. Only the header is validated. Entries/translations are
  regenerated; absent output files use normal generation. `--check` remains
  separate and read-only. Acceptance: `tests/integration/pot-merge.test.mjs`
  (9 CLI tests); a real Yuki POT copy retained all 112 keys and was independently
  imported by WordPress POMO with manual metadata intact.
- `style.css` `Description` is treated as a translatable string.

### Scaffolding

- `templates/common`, `templates/classic`, `templates/block` are composed.
- `templates/partials` backs `wptk make`.
- `src/scaffold/index.mjs` renders placeholders in one pass, refuses overwrites
  without `--force`, and inserts explicit `require_once` calls.

### Harness adapters

- `skills/<name>/SKILL.md` is the canonical skill for all harnesses.
- Frontmatter is limited to `name`, `description`, `license`, `metadata`.
- `skills/<name>/agents/openai.yaml` is Codex-side metadata.
- `.claude-plugin` and `.codex-plugin` are thin manifests.
- `AGENTS.md` is the shared durable instruction file for Codex and DeepSeek.
- `src/install/index.mjs` links skills into `.claude/skills`, `.agents/skills`,
  and `.codex/skills`, and writes the AGENTS.md block. Project installs use the
  theme root; `--global` uses the harness homes (`CLAUDE_CONFIG_DIR`,
  `DSH_AGENTS_HOME`, `CODEX_HOME`, `DSH_HOME`, else `~`). Acceptance covers both:
  `tests/integration/install.test.mjs` removes a project install and a global
  install, checks that unrelated user files (`skills/keep.txt`, user text in
  `AGENTS.md`) survive, and runs `--uninstall` twice. The DeepSeek route has its
  own acceptance in the same file: project and global installs must be links
  (`"type": "link"` in the manifest), never copies unless `--copy` is passed.

## Invariants

1. No npm runtime dependencies. `dependencies` must stay empty.
2. Packaging reads a committed revision only. Never include worktree state.
3. `.distignore` stays strict: root-relative literal paths, no wildcards.
4. Never push, tag, or publish automatically.
5. Skill frontmatter stays portable. Do not add `whenToUse`,
   `disable-model-invocation`, `user-invocable`, or `${CLAUDE_PLUGIN_ROOT}` to a
   shared `SKILL.md`.
6. Keep skill resources inside the skill directory.
7. Use `spawn`/`spawnSync` with argument arrays; never build shell strings.
8. Remove junctions with `unlink`/`rmdir`, never recursive delete.
9. A visual guard failure must not overwrite an existing screenshot.
10. Update `CHANGELOG.md` for user-visible changes.

## How to add a check rule

1. Add the rule to the right file under `src/check/rules/`.
2. Give it a stable ID, a default severity, a scope, and a `run(ctx)` function.
3. Add positive and negative fixtures under `tests/integration/check.test.mjs`
   or a new test file.
4. Document it in `skills/wp-theme-dev/references/checks.md`.
   Include its default severity, rationale, and before/after examples under a
   level-three heading containing the exact backticked ID for `--explain`.
   Add an explicit HTML anchor with dots in the ID replaced by hyphens for
   JSON `documentationUrl`; preserve existing anchors when editing wording.
5. Run `node --test` and `wptk check` against a real theme.

## How to add a command

1. Create `src/commands/<name>.mjs` exporting `run({ argv, globals, out })`.
2. Parse options with `parseArgs`; do not add a dependency.
3. Register it in `src/cli.mjs` with a one-line summary.
4. Add an integration test that spawns the CLI and checks output and exit code.
5. Add it to the command table in `README.md`.

## How to add or change a skill

1. Edit `skills/<name>/SKILL.md`.
2. Keep the frontmatter portable and the description free of `<` and `>`.
3. Update or add `agents/openai.yaml`.
4. Run `claude plugin validate . --strict`.
5. Update `README.md` if the skill's public workflow changed.

## Working with more than one agent

- Commit a baseline first. Each task gets a branch and, ideally, a worktree:
  `git worktree add ../wp-theme-kit-<task> -b feat/<task>`.
- Keep one owner per area: check rules, packaging, preview, scaffold, i18n,
  skills/adapters. Do not edit the same file from two sessions.
- Before merging, run `node --test` and `claude plugin validate . --strict`.
- Record decisions in `docs/adr/` when a choice constrains future work.

## Prompt to give another agent

```text
You are continuing work on D:\Projects\wp-theme-kit, a cross-harness WordPress
theme development toolkit.

Read, in this order:
1. AGENTS.md
2. docs/HANDOFF.md
3. docs/ROADMAP.md

Then run:
  npm test
  node bin/wp-theme-kit.mjs --help
  claude plugin validate . --strict

Pick the first unchecked item in docs/ROADMAP.md unless I name a task.
Before changing code, state which files you will touch and why.
Keep the invariants in docs/HANDOFF.md. Do not add npm runtime dependencies.
Run the tests after each logical change and update CHANGELOG.md.
Do not commit, push, tag, or publish unless I explicitly ask.
```

For Codex and DeepSeek, the same prompt works; `AGENTS.md` is loaded
automatically. For Claude Code, paste the prompt after starting in the
repository root.

## Known limitations

- Static checks are heuristics, not Theme Check or PHPCS.
- The POT extractor handles literal calls; dynamic strings are skipped.
- Block template validation is structural, not a block registry.
- Nested themes require explicit `package.subdir`; directories must exist in
  the worktree and requested commit. Subtree archives require Git archive --mtime.
- Mechanical fixes cover only the documented whitelist. Ambiguous syntax,
  namespaced/imported gettext calls, and symlinked source files require manual
  edits. The mu-plugin helpers are covered by PHP stub tests, not a live
  WordPress site; npm publishing remains deferred.

## 中文摘要

交接时先提交基线，再让新 Agent 依次读 `AGENTS.md`、`docs/HANDOFF.md`、
`docs/ROADMAP.md`，跑 `npm test` 和 `claude plugin validate . --strict`。
架构是 `bin -> cli -> commands -> 领域模块`；检查规则在 `src/check/rules/`，
打包在 `src/package/`，预览在 `src/preview/`，mu-plugin 在 `src/mu-plugin/`
与 `templates/mu-plugin/`，技能在 `skills/`。
保持零运行时依赖、只从已提交快照打包、技能 frontmatter 三端兼容、不自动发布。
多 Agent 并行时一人一个分支/工作树，不要同时改同一个文件。
