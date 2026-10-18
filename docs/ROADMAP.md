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
- [ ] Theme Check helper: `wptk theme-check --zip <file>` that extracts into a
  temporary WordPress root and invokes WP-CLI when available.
  Acceptance: skips cleanly when WP-CLI or Theme Check is absent.
- [ ] `release --notes` to draft grouped release notes from Git history.
- [ ] Validate that the tag's commit is `HEAD` when releasing from a tag.

## v0.2: preview and audit

- [ ] `audit --baseline` for known console errors or overflow.
- [ ] Accessibility assertions: duplicate IDs, empty links, form labels.
- [ ] Screenshot comparison with a tolerance and a diff image.
- [ ] Editor screenshots (`/wp-admin/post-new.php`) with a cookie fixture.
- [ ] A `wptk harness install` command for the mu-plugin observation helpers
  (mail capture, upstream stub) described in the original design notes.

## v0.3: harness adapters

- [ ] Add a first-class DeepSeek Harness install path that does not require
  copying skills.
- [ ] Add a `wptk install --uninstall` test for global installs.
- [ ] Add a Windows/macOS/Linux CI job that runs browser tests when a browser is
  available.
- [ ] Publish to npm and add a Claude/Codex marketplace entry.
  Requires an explicit user decision and a real repository URL.

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
