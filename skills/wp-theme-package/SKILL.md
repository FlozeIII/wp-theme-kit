---
name: wp-theme-package
description: Package, verify, and prepare a WordPress theme release. Use for version bumps, installable zip creation, .distignore review, package verification, Theme Check on a ZIP, release preflight, or when the user asks to ship a theme without pushing or publishing.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Package and Release a Theme

Packaging reads a committed Git revision. Uncommitted and untracked files never
enter the artifact. This is deliberate.

## Commands

```bash
wptk version
wptk version bump patch
wptk version bump minor --dry-run
wptk package
wptk package dist/my-theme-1.2.0.zip --rev v1.2.0
wptk package --no-check
wptk verify-package dist/my-theme.zip
wptk theme-check --zip dist/my-theme.zip --wp-root /path/to/wordpress
wptk release --rev v1.2.0
wptk release --notes --since v1.1.0
```

## Repository subdirectories

For a theme inside a larger Git repository, set package.subdir in the repository
root config or the selected theme's own config:

```json
{ "package": { "subdir": "themes/my-theme" } }
```

The path is Git-root-relative, literal and uses forward slashes. Use real
directories; absolute paths, dot segments, patterns and directory links stop
packaging. Empty or null keeps repository-root-only packaging.

Package, release and verify-package select that theme. Their metadata, checks,
POT/version files, exclusion paths and default output are theme-relative;
explicit output arguments retain normal CLI path resolution. Other commands
keep their existing context selection. Read the requested commit's theme-local
.distignore. The resulting ZIP contains only slug/ and that subtree's files.
Release requires the whole repository to be clean. Subtree archives require
Git with archive --mtime support to preserve the original commit's timestamp.

## Preflight

`wptk package` runs static checks and a POT freshness check by default. It also
warns when `style.css` and `package.json` versions disagree. `wptk release`
additionally requires a clean working tree and consistent versions.

If preflight fails, fix the cause. `--no-check` exists for diagnosing packaging,
not for shipping around a failing check.

## .distignore

`.distignore` is the only exclusion list. It supports theme-root-relative literal
paths and a trailing slash for directories. Wildcards, negation, escapes, and
absolute paths are rejected with a line number.

Commit a `.distignore` that excludes at least: tests, docs, `.scratch`, `.git`,
`.gitignore`, `.distignore`, `.wp-theme-kit.json`, `.wp-theme-kit-install.json`, `AGENTS.md`, `CLAUDE.md`,
`.agents`, `.claude`, and `.codex-plugin`.

## Verification

`wptk verify-package` checks the artifact, not the worktree:

- every entry is under `<slug>/`;
- no backslashes or `..`;
- required files exist for the theme type;
- development paths did not leak;
- `style.css` header fields are complete and `Tested up to` is numeric;
- `theme.json` is valid and uses version 2 or 3;
- `screenshot.png` is a readable PNG no larger than 1200x900.

For optional WordPress Theme Check, run `wptk theme-check --zip <file>`.
Use `--wp-root` or configured WordPress discovery to select local core and an
installed Theme Check CLI adapter. The helper checks only the extracted ZIP in
a temporary WordPress layout; it loads static core libraries without the site's
configuration, database or theme PHP. Parent files for child themes are not
provided. Temporary directory links are removed before cleanup.

Read the result: exit 0 means pass or a clearly stated missing-tool skip, 1 is a
Theme Check failure, and 2 is invalid input/runtime failure. JSON skips have
`skipped: true` and `ok: null`; they do not establish a passing Theme Check.
No tools are downloaded or installed. Review the official findings as part of
release acceptance, even when some are intentional for a self-hosted theme.

## Release notes draft

Run `wptk release --notes` to add grouped Markdown notes to the release output;
`--json` includes a structured `notes` object. Add `--since <ref>` for an explicit
ancestor boundary. Otherwise the base is the nearest reachable tag excluding
target tags, or the beginning of history when no prior tag exists.

The range excludes the base, includes the exact packaged commit, and omits merge
commits. Conventional subjects are grouped by type; `!` and `BREAKING CHANGE:` /
`BREAKING-CHANGE:` body markers lead the breaking group. Unknown subjects stay
whole in Other Changes. For `package.subdir`, only theme-directory commits are
included; automatic tags are repository-wide. Shallow/missing history fails
offline before artifact creation. No separate notes file is written.

Review the draft for accuracy and user impact before reusing it. The heading
comes from the target's committed version; the normal release preflight still
uses its existing clean-tree and version consistency checks.

## Release boundary

`wptk release` is local only. Never push, move a tag, or publish a release
without an explicit instruction from the user. The printed checklist covers the
human steps: verify the artifact commit, run Theme Check on the extracted
artifact, write release notes, upload the produced zip, and do not move a
released tag.

## 中文摘要

打包只认已提交的 Git 快照，未提交和未跟踪文件不会进包。`.distignore` 是唯一
排除清单，只支持根目录相对字面路径。默认先跑静态检查和 POT 新鲜度检查；失败
就修原因，不要用 `--no-check` 绕过。`verify-package` 验的是产物不是工作区。
`release` 只做本地准备并打印清单，绝不自动 push、打标签或发布。
`theme-check --zip` 在临时目录用本机工具检查产物，不加载站点配置或数据库；
缺少工具会明确跳过，跳过不能视为检查通过。
`release --notes` 从已提交历史生成分组草稿；可用 `--since` 指定起点，
发布前仍须人工审核，不会自动写文件、打标签或发布。
