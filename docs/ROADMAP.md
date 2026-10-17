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
- [ ] `check --explain <rule-id>`: print the rule's rationale and examples.
  Acceptance: `wptk check --explain php.unescaped-output` exits 0 and prints the
  rule catalogue entry.
- [ ] Add a per-rule documentation link to JSON findings.

## v0.2: block and PHP analysis

- [ ] Validate block markup balance in `templates/` and `parts/`.
  Acceptance: a fixture with an unclosed block comment fails, a valid one passes.
- [ ] Detect block attribute JSON that is syntactically invalid.
- [ ] Recognize `get_template_part()` targets built from a literal array form.
- [ ] Add a PHP `token_get_all` rule for `printf` placeholder/argument count
  mismatches.
- [ ] Add a rule for `wp_enqueue_script` in the footer argument that is not
  boolean.

## v0.2: packaging and release

- [ ] Support a theme in a repository subdirectory via `package.subdir`.
  Acceptance: a monorepo fixture packages only that subdirectory with the correct
  top-level slug.
- [ ] `pot --merge` to preserve existing POT header metadata.
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
