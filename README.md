# wp-theme-kit

A cross-harness toolkit for developing WordPress themes. It ships one shared
skill pack and one zero-dependency Node CLI, usable from Claude Code, Codex,
DeepSeek Harness, or a plain terminal.

```bash
wptk check       # offline structure, PHP, block, i18n, and asset checks
wptk init        # classic, block, or hybrid theme scaffolding
wptk shot        # real-viewport screenshots and visual guards
wptk package     # reproducible zip from a committed Git revision
wptk pot         # translation template generation
```

## Why

Theme work repeats the same fragile steps on every project: checking escaping
and text domains, verifying template parts, packaging without development files,
taking a real screenshot, and keeping the POT current. This kit puts those
steps behind one CLI and one set of skills, so the harness does not matter and
the result is reproducible.

It was extracted from a working classic theme that already used zero-dependency
Node scripts, `git archive` packaging, and CDP screenshots. The yuki theme is
used as a dogfood target during development, but no yuki-specific selector,
text domain, or environment variable enters the core.

## Requirements

- Node.js 22.2 or newer.
- Git, for packaging and `check --diff`.
- Optional: PHP 7.4 or newer for the deeper `token_get_all` analyzer.
- Optional: a Chromium-family browser (Edge or Chrome) for screenshots.
- Optional: a running local WordPress site for preview and audit.

No `npm install` step. No Composer. No WP-CLI requirement.

## Install

### CLI

```bash
git clone <this-repo> wp-theme-kit
cd wp-theme-kit
npm link
```

`wptk` is now on PATH. Without `npm link`, run
`node <kit>/bin/wp-theme-kit.mjs <command>`.

### Claude Code

Native plugin:

```text
/plugin marketplace add <absolute path to wp-theme-kit>
/plugin install wp-theme-kit@wp-theme-kit
```

Or load it for one session:

```bash
claude --plugin-dir <absolute path to wp-theme-kit>
```

### Codex

```bash
codex plugin marketplace add <absolute path to wp-theme-kit>
codex plugin add wp-theme-kit@wp-theme-kit
```

Codex reads `AGENTS.md` as a fallback even when the plugin is not installed.

### DeepSeek Harness

DeepSeek discovers skills from `.agents/skills` and reads `AGENTS.md`. Install
them into a theme project or into your user-level directories:

```bash
node install.mjs --harness deepseek --project <theme-dir>
node install.mjs --harness deepseek --global
```

`install.mjs` creates directory junctions on Windows (falling back to copies),
writes an install manifest, and supports `--uninstall`.

### Project-level install for all three

```bash
wptk install --harness all --project <theme-dir>
```

This links skills into `.claude/skills`, `.agents/skills`, and `.codex/skills`,
copies Claude commands into `.claude/commands/wp-theme-kit`, and writes the
AGENTS.md block.

## Quick start

```bash
# Inspect the environment and the active theme
wptk doctor

# Check the current theme
wptk check
wptk check --format json --fail-on warning
wptk check --diff HEAD
wptk check --explain php.unescaped-output
wptk check --fix --dry-run
wptk check --fix

# Create a new theme
wptk init my-theme --type block --name "My Theme"
cd my-theme
wptk check
wptk shot --url http://localhost:8080

# Add code
wptk make module related-posts
wptk make block callout

# Translate
wptk pot
wptk pot --check

# Release
wptk version bump patch
wptk package --rev v0.2.0
wptk verify-package dist/my-theme.zip
```

## Commands

| Command | Purpose |
|---|---|
| `wptk doctor` | Report Node, Git, PHP, WordPress, WP-CLI, browser, and theme metadata. |
| `wptk init <slug>` | Create a classic, block, or hybrid theme. |
| `wptk adopt [dir]` | Add config and agent instructions to an existing theme. |
| `wptk check [dir]` | Run offline checks. `--format json` or `github`, `--baseline`, `--fail-on`, `--diff <ref>`, `--fix [--dry-run]`; `--explain <rule-id>` reads rule documentation. |
| `wptk make template|part|module|block|pattern <name>` | Generate a focused file. |
| `wptk pot [--out file]` | Generate a POT file; `--check` compares msgids. |
| `wptk shot [route]` | Screenshot with a real viewport; `--all`, `--dark`, `--full-page`. |
| `wptk audit [route]` | Console errors, failed assets, overflow, missing selectors. |
| `wptk preview [route]` | Open the route in the system browser. |
| `wptk version [bump patch|minor|major]` | Print or bump `style.css` and `package.json`. |
| `wptk package [out.zip] [--rev ref]` | Build from a committed revision. |
| `wptk verify-package <zip>` | Inspect an artifact without WordPress. |
| `wptk release [--rev ref]` | Local preflight, package, verify, and checklist. |
| `wptk install --harness ...` | Install skills and AGENTS.md entries. |

Global flags: `--cwd <dir>`, `--json`, `--no-color`, `--quiet`.
Exit codes: `0` success, `1` check or gate failure, `2` usage or environment
error.

## Configuration

`.wp-theme-kit.json` at the theme root:

```json
{
  "slug": "my-theme",
  "type": "classic",
  "textDomain": "my-theme",
  "prefix": "my_theme",
  "kit": { "path": "/path/to/wp-theme-kit" },
  "wordpress": {
    "path": "/path/to/wordpress",
    "php": "/path/to/php",
    "url": "http://localhost:8080"
  },
  "checks": {
    "failOn": "error",
    "analyzer": "auto",
    "ignore": ["vendor/**"],
    "rules": { "php.abspath-guard": "off" }
  },
  "package": {
    "distignore": ".distignore",
    "output": "dist/{slug}.zip",
    "check": true,
    "checkPot": true
  },
  "preview": {
    "browser": null,
    "routes": [
      { "name": "home", "path": "/", "width": 1200, "height": 900, "waitFor": ".site-header", "expect": ["main"] }
    ],
    "guards": { "noHorizontalOverflow": true, "noConsoleErrors": true, "imagesLoaded": true }
  }
}
```

Environment overrides: `WPTK_WP_ROOT`, `WPTK_PHP`, `WPTK_SITE`, `WPTK_BROWSER`,
`WPTK_WP_CLI`, `WPTK_KIT`, `WPTK_DEBUG`, `WPTK_NO_COLOR`.

## How one skill pack serves three harnesses

```text
skills/<name>/SKILL.md        canonical skills, same file for all harnesses
.claude-plugin/plugin.json    Claude plugin manifest
.claude-plugin/marketplace.json
.codex-plugin/plugin.json     Codex plugin manifest, points at ./skills/
.agents/plugins/marketplace.json
.commands/*.md                Claude-only thin wrappers
AGENTS.md                     Codex and DeepSeek durable instructions
```

The SKILL.md frontmatter uses only keys accepted by all three: `name`,
`description`, `license`, and `metadata`. Claude-only syntax such as
`$ARGUMENTS` and `${CLAUDE_PLUGIN_ROOT}` stays in `commands/`. DeepSeek and
Codex sidecars live in `skills/<name>/agents/openai.yaml`.

## Safety and limits

- Packaging reads committed files only. Uncommitted and untracked changes never
  enter the artifact.
- `.distignore` supports root-relative literal paths only. Wildcards, negation,
  escapes, and traversal are rejected with a line number.
- Visual guards refuse to overwrite an existing screenshot when the layout is
  broken.
- `wptk release` never pushes, tags, or publishes.
- `check` is a fast offline gate, not a replacement for Theme Check or
  PHPCS-WordPress. Run those against the extracted artifact before release.
- The POT extractor handles literal gettext calls. Dynamic strings are skipped
  and counted; fix the call rather than editing the POT by hand.

## Literal array template arguments

`php.template-part-missing` recognizes positional arguments unpacked from
literal arrays in classic/hybrid themes:

```php
get_template_part( ...[ 'template-parts/card', 'single' ] );
get_template_part( ...array( 'template-parts/card', 'single' ) );
get_template_part( 'template-parts/card', ...[ 'single', [ 'value' => $data ] ] );
```

It checks `template-parts/card-single.php` and the generic fallback
`template-parts/card.php`, warning only when both are absent. Empty, `null`,
or omitted names use only the generic target. Multiple literal unpacks,
comments, trailing commas, and nested third data arguments are supported.
WordPress accepts a string slug; passing an array directly as the slug does
not define a list of template candidates.

Expanded global calls also accept `\get_template_part`. Slug/name must be exact
single/double-quoted static strings. Dynamic values, concatenation, interpolated
strings, heredoc/nowdoc paths, keyed arrays, nested array unpacking,
indexed expressions, unknown spread sources, namespace-qualified functions and object/static method calls
are conservatively skipped. No checked PHP is executed. Ordinary unspread
calls and other template APIs keep their existing behavior; ignores, severity,
baselines, diff, fix rechecks and output formats use the existing rule pipeline.

## Block markup balance

`block.markup-balance` reports errors for unclosed blocks, unexpected or
misnested closing delimiters, and unterminated block comments in HTML files
recursively under `templates/` and `parts/`. It runs for every theme type and
uses the actual file and delimiter line, including CRLF sources.

Nested, sibling, and self-closing blocks are supported. Bare core names such
as `wp:group` match `wp:core/group`; custom namespaces remain distinct.
Ordinary comments and escaped markup do not affect nesting. After a misnested
close matching an ancestor, the checker drops that ancestor and its open
children to continue; unmatched closes leave existing opens intact.

Rule overrides, path ignores, baselines, diff scope, and fail-on thresholds
apply normally. HTML comments can suppress findings, for example
`<!-- wptk-ignore-next-line block.markup-balance -->` before an opening block.
Suppression does not skip parsing. `--fix` leaves block markup unchanged and
reports remaining block errors after applying other mechanical fixes.

This checks delimiter balance; it does not validate HTML, registered block
types, or attribute JSON syntax. Read the rationale and examples with
`wptk check --explain block.markup-balance`.

## Block attribute JSON

`block.attribute-json` reports invalid JSON in complete opening and self-closing
block comments in HTML under `templates/` and `parts/`, in every theme type.
It shares the delimiter scanner with the balance rule and points to the opening
comment's actual file and line, including multiline attributes and CRLF sources.
Messages include the one-based opening column (UTF-16 code units) so identical
invalid blocks on the same line remain separate findings.

The text after the block name, excluding the final self-closing slash, must be
valid JSON when nonempty. Missing attributes are allowed. This is syntax
validation: valid JSON objects, arrays, strings, numbers, booleans and `null`
are accepted without checking attribute types, schemas, or block registration.

Closing comments are excluded. Unterminated comments are reported by
`block.markup-balance`; a complete delimiter with invalid JSON still participates
in balance checking. The two rules can be configured and suppressed independently.
Existing ignores, baseline, diff, formats and fail-on options apply normally.
`--fix` does not rewrite attributes and retains these errors after other fixes.
Use `wptk check --explain block.attribute-json` for examples.

## JSON finding documentation

Every entry in a check report's `findings` array includes `documentationUrl`,
an absolute `file:` URL to its explanation in the installed rule catalogue.
For example, `php.unescaped-output` links to
`skills/wp-theme-dev/references/checks.md#php-unescaped-output` inside the kit.
Explicit anchors use the rule ID with dots replaced by hyphens; the internal
`meta.rule-error` diagnostic also has an entry.

These links work offline and refer to the installation that produced the
report, independently of the theme or working directory. Paths are URL-encoded,
including spaces and Unicode. A Markdown viewer must support explicit HTML
anchors to navigate the fragment; `wptk check --explain <rule-id>` can also read
the entry directly.

The field is additive in `--json` and `--format json`, including `--diff`,
fix previews, and post-fix reports. Counts, exit codes, baseline fingerprints,
and baseline file contents retain their existing behavior. Pretty output and
GitHub annotations do not include link metadata.

## Rule explanations

Run `wptk check --explain php.unescaped-output` for a rule's rationale and
before/after examples. All 40 current rules have entries in the shipped
[rule catalogue](skills/wp-theme-dev/references/checks.md#rule-explanations),
which is also the CLI's explanation source. Rule IDs are exact and case-sensitive.

Explanation works offline outside a theme, without loading configuration or
discovering Git/PHP. An optional theme directory does not change the static
entry. Default/`--format pretty` output is Markdown; `--json` or `--format json`
returns `{ "rule": "<id>", "documentation": "<Markdown entry>" }`.

Unknown, empty, repeated, or missing IDs exit 2. Scan options (`--fix`,
`--dry-run`, `--diff`, baseline flags, `--analyzer`, and `--fail-on`) cannot be
combined with explanation. Unsupported formats, including `github`, also exit 2.
Run a separate ordinary `check` to inspect the theme.

## Changed-file checks

`wptk check --diff <ref>` reports findings only in files changed between one
committed Git ref and the current worktree. This includes staged and unstaged
edits plus non-ignored untracked files. Commit hashes, tags, and refs such as
`HEAD~1` work; invalid refs or missing Git exit 2 without writing files.
Git never automatically fetches missing objects in a partial clone; if the
comparison needs unavailable objects, the command exits 2 without applying fixes.

Themes may live inside a larger repository. Paths are relative to the theme,
with rename destinations included and deleted files excluded. Existing check
ignores, inline suppression, baselines, output formats, and failure thresholds
apply to the scoped findings. Windows path matching handles case-only renames.

The checker still scans the complete theme for cross-file context. JSON adds
`diff.ref` and `diff.files` (changed source files within the check scope);
`summary.files` remains the total number of scanned source files. Findings with
no concrete file, shown as `(theme)`, are omitted, including theme-wide header
and classic-markup findings. Use an ordinary `check` for complete theme validation.

With `--fix [--dry-run]`, only scoped findings can generate edits, and the
post-fix report keeps the same diff scope. `--diff --update-baseline` is rejected
so a partial report cannot replace the full baseline.

## Mechanical fixes

Preview changes with `wptk check --fix --dry-run`, then apply them with
`wptk check --fix`. The whitelist covers:

- A missing `wp_body_open()` after one unambiguous opening `<body>` in
  `header.php` for classic and hybrid themes.
- A missing third text-domain argument in gettext calls with exactly two
  arguments and a literal first argument, such as `_x('Label', 'context')` or
  `_n_noop('One', 'Many')`. Existing domains and other signatures stay unchanged.
- A `Tested up to` header containing one numeric version with a `WP`,
  `WordPress`, or `v` prefix, such as `WordPress v7.1` -> `7.1`.

Fixes respect disabled rules, ignored paths, inline suppression, and baselines.
Ambiguous syntax and symlinked files are skipped. Files retain their BOM and line
endings. Applied fixes trigger another check; its remaining findings determine the
exit code. Dry runs report the original findings and exit code without writing.
`--dry-run` requires `--fix`; update baselines in a separate invocation.
With `--json`, `fixes.edits` lists the rule, file, line, replacement, and
zero-based UTF-16 `start`/`end` offsets in the original file (end exclusive).

## Development

```bash
npm test                    # node --test
npm run test:unit
npm run test:integration
claude plugin validate . --strict
```

The test suite uses Node built-ins only. Browser tests skip when no browser is
found. See `AGENTS.md` for repository conventions.

## License

MIT. Themes generated by the kit default to GPL-2.0-or-later, as is customary in
the WordPress ecosystem; change the license with `wptk init --license`.

---

## 中文说明

`wp-theme-kit` 是一套跨 harness 的 WordPress 主题开发工具：一份共享技能包 +
一个零依赖 Node CLI，可在 Claude Code、Codex、DeepSeek Harness 或普通终端里使用。

### 能力

- **检查**：主题结构、`style.css` 头、模板引用、转义、文本域、SQL、nonce、
  全局前缀、block 模板与 `theme.json`、HTML/JS/CSS 常见问题。
- **脚手架**：新建 classic / block / hybrid 主题，生成模板、模板部件、PHP 模块、
  自定义区块与 block pattern。
- **预览与截图**：真实视口截图、批量路由截图、控制台错误、失败资源、横向溢出、
  图片加载与选择器检查。
- **打包与发布**：按已提交的 Git 快照出包，严格的 `.distignore`，包内容验收，
  版本号检查，POT 新鲜度检查，发布清单。
- **国际化**：从 PHP 与 JS 的字面量 gettext 调用生成 POT，并可做 msgid 集合比对。

### 安装

```bash
git clone <repo> wp-theme-kit
cd wp-theme-kit
npm link
```

Claude Code：

```text
/plugin marketplace add <wp-theme-kit 绝对路径>
/plugin install wp-theme-kit@wp-theme-kit
```

Codex：

```bash
codex plugin marketplace add <wp-theme-kit 绝对路径>
codex plugin add wp-theme-kit@wp-theme-kit
```

DeepSeek：

```bash
node install.mjs --harness deepseek --project <主题目录>
```

三个 harness 也可以统一用：

```bash
wptk install --harness all --project <主题目录>
```

### 快速开始

```bash
wptk doctor
wptk check
wptk init my-theme --type classic
wptk pot
wptk shot --url http://localhost:8080
wptk package --rev v0.2.0
wptk verify-package dist/my-theme.zip
```

### 约定

- 主题 slug 用小写 kebab-case，并与部署目录、文本域一致。
- PHP 全局函数、类、常量、option/meta key 使用项目前缀。
- 输出处转义；输入处清洗；写操作前验证 nonce 与权限。
- 新功能优先放新文件，用显式 `require_once` 接入，不要 glob。
- 打包只认已提交内容；`release` 不会自动 push、打标签或发布。
