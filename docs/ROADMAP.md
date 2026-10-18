# Roadmap

Status: v0.1.0 is complete. Work top to bottom unless a task says otherwise.
Each item is small enough for one agent session and has an acceptance command.

## v0.2: rule depth and fix loops

- [x] `check --fix` for a whitelist of mechanical issues:
  - add a missing `wp_body_open()` after `<body>`;
  - add a missing text domain when the call has exactly two arguments and the
    first is a literal;
  - normalize `Tested up to` to a numeric version.
  Acceptance: every fix has a positive fixture and a `--dry-run` test.
  Verified: `node --test tests/integration/check-fix.test.mjs` (22 pass, 1
  file-symlink privilege skip on Windows); `npm test` (97 pass, 1 skip).
- [x] `check --diff <ref>`: only report findings in changed files.
  Acceptance: a test creates a Git repo, changes one file, and asserts the
  unchanged file's findings are absent.
  Verified: `node --test tests/integration/check-diff.test.mjs` (14 pass on
  Windows); `npm test` (111 pass, 1 file-symlink privilege skip).
- [x] `check --explain <rule-id>`: print the rule's rationale and examples.
  Acceptance: `wptk check --explain php.unescaped-output` exits 0 and prints the
  rule catalogue entry.
  Verified: `node --test tests/integration/check-explain.test.mjs` (6 pass,
  covering all 38 current rules); `npm test` (117 pass, 1 Windows file-symlink
  privilege skip). Direct acceptance command exits 0.
- [x] Add a per-rule documentation link to JSON findings.
  Acceptance: `node --test tests/integration/check-documentation.test.mjs`
  verifies installed file URLs and stable anchors, diff/fix reports, existing
  baselines, internal diagnostics, and relocated paths.
  Verified: 6 pass; `npm test` (123 pass, 1 Windows file-symlink privilege skip).

## v0.2: block and PHP analysis

- [x] Validate block markup balance in `templates/` and `parts/`.
  Acceptance: a fixture with an unclosed block comment fails, a valid one passes.
  Verified: `node --test tests/integration/check-blocks.test.mjs` (11 pass);
  `npm test` (134 pass, 1 Windows file-symlink privilege skip).
- [x] Detect block attribute JSON that is syntactically invalid.
  Acceptance: `node --test tests/integration/check-block-attributes.test.mjs`
  covers invalid syntax and valid nesting/escaping, with existing check loops.
  Verified: 11 pass; `npm test` (145 pass, 1 Windows file-symlink privilege skip).
- [x] Recognize `get_template_part()` targets built from a literal array form.
  Acceptance: `node --test tests/integration/check-template-arrays.test.mjs`
  checks literal positional unpacks, candidate fallback, dynamic skips and
  JS/PHP agreement. Local WordPress runtime candidate lists also verified.
  Verified: 11 pass; `npm test` (156 pass, 1 Windows file-symlink privilege skip).
- [x] Add a PHP `token_get_all` rule for `printf` placeholder/argument count
  mismatches.
  Acceptance: `node --test tests/integration/check-printf.test.mjs` covers literal
  and translated formats, PHP counting semantics, conservative skips, JS/PHP
  parity and the existing pipeline; authored runtime fixtures confirm counts.
  Verified: 11 pass; `npm test` (167 pass, 1 Windows file-symlink privilege skip).
- [x] Add a rule for `wp_enqueue_script` in the footer argument that is not
  boolean.
  Acceptance: `node --test tests/integration/check-script-footer.test.mjs`
  covers boolean/WordPress 6.3+ options forms, final-value semantics, conservative
  skips, JS/PHP parity and the existing check pipeline.
  Verified: 10 pass; `npm test` (177 pass, 1 Windows file-symlink privilege skip).

## v0.2: packaging and release

- [x] Support a theme in a repository subdirectory via `package.subdir`.
  Acceptance: a monorepo fixture packages only that subdirectory with the correct
  top-level slug.
  Verified: `node --test tests/integration/package-subdir.test.mjs` (14 pass);
  `npm test` (191 pass, 1 Windows file-symlink privilege skip). Covers committed
  trees/ignores, attributes, strict paths, preflight/release/verify, offline
  partial clones, theme types and root compatibility.
- [x] `pot --merge` to preserve existing POT header metadata.
  Acceptance: `node --test tests/integration/pot-merge.test.mjs` (9 pass) covers
  manual/generated fields, comments, folded/escaped headers, repeatability,
  error protection, paths, source entry rebuilding and existing behavior.
  Verified: `npm test` (200 pass, 1 Windows file-symlink privilege skip);
  real Yuki POT copy (112 keys) independently imported by WordPress POMO.
- [x] Theme Check helper: `wptk theme-check --zip <file>` that extracts into a
  temporary WordPress root and invokes WP-CLI when available.
  Acceptance: skips cleanly when WP-CLI or Theme Check is absent.
  Verified: `node --test tests/integration/theme-check.test.mjs` (10 pass on Windows);
  `npm test` (210 pass, 1 Windows file-symlink privilege skip). Tests cover
  explicit skips, artifact isolation, findings/status, malformed output, safe
  extraction, cleanup and config/CLI behavior. Real local WordPress/Theme Check
  runs verified Yuki and block/hybrid artifacts without loading theme PHP.
- [x] `release --notes` to draft grouped release notes from Git history.
  Acceptance: `node --test tests/integration/release-notes.test.mjs` (15 pass)
  covers tag/explicit ranges, groups/breaking markers, monorepos, empty histories,
  errors/offline behavior, target versions, legacy output and identical ZIPs.
  Verified: `npm test` (225 pass, 1 Windows file-symlink privilege skip);
  isolated Yuki history retained 13 commits and produced a verified 40-entry ZIP.
- [x] Validate that the tag's commit is `HEAD` when releasing from a tag.
  Acceptance: `tests/integration/release-tag.test.mjs` (10 CLI tests) covers real
  tag refs/ambiguity, detached HEAD, historical SHA/branches, notes, nested
  themes, artifact preservation and offline missing/non-commit refs.
  Verified: `npm test` (235 pass, 1 Windows file-symlink privilege skip);
  isolated Yuki rejects the old tag at newer HEAD and releases at detached tag
  HEAD with the verified 40-entry ZIP and 13 note commits.

## v0.2: preview and audit

- [x] `audit --baseline` for known console errors or overflow.
  Acceptance: `tests/integration/audit-baseline.test.mjs` (13 CLI tests) covers
  exact matches/count regressions, URL/viewport/color isolation, full updates,
  independent guards, schema/errors, file preservation and screenshot safety.
  Verified: `npm test` (248 pass, 1 Windows file-symlink privilege skip).
  Real Yuki baseline update/read passed at 1200x900 without changing its source.
- [x] Accessibility assertions: duplicate IDs, empty links, form labels.
  Acceptance: `tests/integration/accessibility.test.mjs` (7 CLI tests in real
  Chromium over a local HTTP server) covers exact JSON observations, pretty
  counts and stderr details, a clean page, `preview.guards.accessibility: false`,
  `--no-guard`, non-baselineable findings surviving `--update-baseline`, and
  unchanged `shot` behavior. `tests/unit/accessibility.test.mjs` (7 tests) pins
  name precedence, label rules, hidden/aria-hidden skips, malformed snapshots
  and capped failure text.
  Verified: `npm test` (262 pass, 1 Windows file-symlink privilege skip);
  `node bin/wp-theme-kit.mjs audit --help`; defect and clean fixture pages
  exercised through the real CLI in Edge.
  Yuki has no site URL configured, so live WordPress acceptance remains pending
  for the next browser session with a running site.
- [x] Screenshot comparison with a tolerance and a diff image.
  Acceptance: `wptk compare <expected> <actual>` exits 0 within
  `--tolerance`/`--channel`, 1 for a change or size mismatch, 2 for bad input;
  `--out` writes a decodable diff PNG (changed pixels red); JSON stays
  parseable; `shot` is untouched.
  Unit: 7 PNG-codec tests (color-type expansion, Sub/Up/Average/Paeth filters,
  round-trip, known-good fixture, rejected variants, chunk ordering) and 6
  comparison tests (ratio, channel threshold, inclusive tolerance, size
  mismatch, diff colors).
  Integration: 2 CLI tests over real `shot` captures in Chromium (identical
  copy passes, color change fails with a decoded diff, tolerance/channel, size
  mismatch, overwrite refusal, atomic write failure, argument and input errors).
  Verified: `npm test` (277 pass, 1 Windows skip); `compare --help`.
- [x] Editor screenshots (`/wp-admin/post-new.php`) with a cookie fixture.
  Acceptance: `shot`/`audit --cookie-file <json>` and `preview.cookieFile` set
  session cookies on every route before navigation; values never printed; bad
  fixtures exit 2 before the browser starts.
  Unit: 6 cookie validation tests. Integration: 5 CLI tests (4 in real Chromium
  over a local HTTP server: 401 without cookies, editor 200/title on two routes,
  authenticated screenshot, config/flag resolution; 1 browser-free invalid
  fixture test).
  Verified: `npm test` (288 pass, 1 Windows skip); `shot --help`, `audit --help`,
  `claude plugin validate . --strict`.
  Live wp-admin acceptance is pending a running WordPress site and admin
  credentials; record it here when available rather than committing secrets.
- [x] `wptk mu-plugin` commands for the mu-plugin observation helpers (mail
  capture, HTTP stub). The name intentionally differs from the earlier
  `wptk harness install` idea; see ADR 0001 for the naming conflict with AI
  harnesses.
  Acceptance: `install|status|remove|mail` install marked helpers into
  `wp-content/mu-plugins/`, write a one-time harness config, upgrade older
  helpers and refuse newer or unmarked files without `--force`; mail capture
  writes an `.eml` plus `index.jsonl` and suppresses delivery; the HTTP stub
  replays the first matching fixture, passes through by default and fails with
  `wptk_no_fixture` in strict mode; both helpers are inert on production unless
  the `wp_theme_kit_harness_enabled` filter opts in; values never printed.
  Adoption, marker-checked removal, per-helper status drift, config-error
  refusal, single-part `.eml` naming and JSON-pure stdout are covered too.
  Unit: 10 fixture/manifest/mail tests. Integration: 15 CLI tests plus 5 PHP
  behavior tests against stub WordPress functions (skipped without PHP).
  Verified: `npm test` (318 pass, 1 Windows skip, 319 total);
  `mu-plugin --help`; `claude plugin validate . --strict`.
  Live acceptance against a running WordPress install is pending; record it
  here when available.

## v0.3: harness adapters

- [x] Add a first-class DeepSeek Harness install path that does not require
  copying skills.
  Already shipped by `install --harness deepseek` (`.agents/skills` plus a
  marked `AGENTS.md`, or `~/.agents/skills` plus `~/.dsh/AGENTS.md` with
  `--global`); default is a link/junction and `--copy` is opt-in. Local evidence
  that DSH scans that directory: `~/.agents/skills/reverse-engineer-anything`
  appears in the DSH skill catalog while absent from `~/.dsh/skills`.
  Acceptance: `tests/integration/install.test.mjs` now asserts project and
  global DeepSeek installs are links and the manifest records `type: "link"`,
  the AGENTS.md block appears, and `--uninstall` removes both.
  Verified: `npm test` (320 pass, 1 Windows skip, 321 total).
- [x] Add a `wptk install --uninstall` test for global installs.
  Acceptance: `tests/integration/install.test.mjs` now also installs
  `--harness all --global` into a temporary home, proves skills (symlinked),
  commands, AGENTS.md blocks and the home-root manifest exist, then
  `--uninstall` removes them, keeps an unrelated `skills/keep.txt` and user text
  in `~/.dsh/AGENTS.md`, and a second `--uninstall` exits 0.
  Verified: `npm test` (320 pass, 1 Windows skip, 321 total).
- [x] Add a Windows/macOS/Linux CI job that runs browser tests when a browser is
  available.
  Acceptance: `.github/workflows/ci.yml` adds a `browser` job on
  `ubuntu-latest`, `windows-latest` and `macos-latest` (Node 24) that detects a
  Chromium-family browser through `findBrowser({})`, runs the five browser
  suites (`preview`, `audit-baseline`, `accessibility`, `compare`,
  `editor-cookie`) when found, serialized with `--test-concurrency=1` to avoid
  launching several browsers on small runners, and prints a skip notice
  otherwise.
  Verified: the exact command runs 30/30 locally in Edge; the workflow YAML
  parses. GitHub execution remains unverified: this checkout has no `git remote`
  and pushing is out of scope.
- [x] Publish to npm and add a Claude/Codex marketplace entry.
  Published 2026-10-18 as `wp-theme-kit@0.2.0` from the public repository
  `FlozeIII/wp-theme-kit`, with the user's explicit decision recorded in this
  session.
  Acceptance: `npm publish --access public`; the registry serves `0.2.0` as
  `latest`; a temporary project install (`npm i wp-theme-kit@0.2.0`) adds
  exactly one package, and both `node node_modules/wp-theme-kit/bin/wp-theme-kit.mjs
  --version` and `node_modules/.bin/wptk --version` print `0.2.0`;
  `claude plugin marketplace add FlozeIII/wp-theme-kit` clones, validates and
  lists the marketplace.
  Verified: 2026-10-18 against the public registry and GitHub. The git tag and
  GitHub Release remain manual follow-ups. On this Windows host, cloning through
  Git's Schannel backend needs `http.schannelCheckRevoke=false` (or
  `GIT_SSL_NO_VERIFY=true`); that is a local TLS/CRL issue, not a plugin defect.

## Deferred / not planned

- A WordPress admin-side PHP plugin. This is a development-time tool.
- A replacement for Theme Check or PHPCS.
- Automatic pushing, tagging, or publishing.
- Bundling a PHP runtime or a browser.

## How to claim work

1. Pick the first unchecked item.
2. Create a branch or worktree.
3. Write a short spec in the issue or PR description: inputs, outputs, error
   cases, and the acceptance command.
4. Implement, test, update `CHANGELOG.md`.
5. Run `node --test` and `claude plugin validate . --strict`.
6. Mark the item checked only after the acceptance command passes.

## 中文摘要

v0.2 优先做 `check --fix`、`check --diff`、block 结构校验、monorepo 打包、
Theme Check 辅助和截图回归。v0.3 再做 DeepSeek 一等安装、CI 浏览器测试和发布。
每项都写清验收命令；完成前必须跑全量测试与插件校验。
