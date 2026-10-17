---
name: wp-theme-dev
description: Develop and maintain WordPress themes with a reproducible CLI workflow. Use when the user asks to create, check, preview, translate, package, or release a classic, block, or hybrid WordPress theme, or when a theme task needs template hierarchy, escaping, text-domain, screenshot, or release guidance.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# WordPress Theme Development

This skill is the router for `wp-theme-kit`. The CLI is the source of truth:
every check, scaffold, screenshot, package, and POT command runs without an
LLM, so the same workflow works in Claude Code, Codex, and DeepSeek Harness.

## Before you touch a theme

1. Find the theme root. It is the nearest directory with `style.css` or
   `theme.json`, and usually the directory containing `.wp-theme-kit.json`.
2. Read `.wp-theme-kit.json` if it exists. It defines the slug, type, text
   domain, prefix, site URL, routes, and rule overrides.
3. Run `wptk doctor` when the environment is unknown. It reports Node, Git,
   PHP, WordPress, WP-CLI, the browser, and which capabilities are available.
4. Decide the theme type:
   - classic: `style.css` plus PHP templates such as `index.php`.
   - block: `theme.json` plus `templates/index.html`.
   - hybrid: both systems are present.

## Route the task

| Task | Skill |
|---|---|
| Static checks, acceptance, fixing findings | `wp-theme-check` |
| New theme, templates, parts, modules, blocks, patterns | `wp-theme-scaffold` |
| Screenshots, visual audit, local preview | `wp-theme-preview` |
| Version bump, package, verify, release | `wp-theme-package` |
| POT generation and translation freshness | `wp-theme-i18n` |

If several apply, run them in this order: scaffold, check, preview, i18n,
package.

## Find the CLI

Prefer the `wptk` command. If it is not on PATH:

1. Use `WPTK_KIT` if set.
2. Read `kit.path` from `.wp-theme-kit.json` and run
   `node <kit.path>/bin/wp-theme-kit.mjs`.
3. Ask the user to run `npm link` in the kit repository.

Never run a theme command through a shell string. Pass paths as separate
arguments.

## Non-negotiable rules

- One text domain per theme, exactly the value in `style.css`. Use it in every
  gettext call.
- Prefix global functions, classes, constants, options, meta keys, and CSS
  classes with the project prefix.
- Escape at the output site. Sanitize on input. Verify nonces and capabilities
  before state-changing requests.
- Prefer a new file plus an explicit `require_once` over editing a shared file.
  Do not use glob-based includes.
- Do not overwrite user files without `--force`, and do not rewrite unrelated
  code while fixing a finding.
- Never push, tag, or publish. `wptk release` stops at a local checklist.
- If a check finding is intentional, suppress it narrowly with
  `wptk-ignore` or a baseline entry, and explain why.

## References

- [Template hierarchy](references/template-hierarchy.md)
- [Escaping and security](references/escaping-security.md)
- [Block themes](references/block-theme.md)
- [Project conventions](references/conventions.md)
- [Check rule catalog](references/checks.md)
- [Release checklist](references/release-checklist.md)
- [Environment](references/environment.md)

## 中文摘要

本技能是 wp-theme-kit 的总入口。先读 `.wp-theme-kit.json`，用 `wptk doctor`
确认环境，再按任务路由到 check、scaffold、preview、package、i18n 子技能。
CLI 是唯一的能力来源；技能只负责编排。不要自动 push、打标签或发布，也不要
在未确认时覆盖用户文件。所有输出都要按主题的文本域、前缀和转义约定处理。
