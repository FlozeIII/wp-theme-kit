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
- Git, for packaging.
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
| `wptk check [dir]` | Run offline checks. `--format json` or `github`, `--baseline`, `--fail-on`. |
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
