---
name: wp-theme-scaffold
description: Create and extend WordPress themes with deterministic scaffolding. Use when starting a classic, block, or hybrid theme, adding a template, template part, PHP module, custom block, or block pattern, or adopting an existing theme into the kit.
license: MIT
metadata:
  author: FlozeIII
  version: "0.1.0"
---

# Scaffold a WordPress Theme

Scaffolding writes files; it should not invent architecture beyond the project
conventions.

## Commands

```bash
wptk init my-theme --type classic
wptk init my-theme --type block --name "My Theme" --author "Name"
wptk init my-theme --type hybrid --dir ./themes/my-theme

wptk adopt
wptk adopt . --agents --distignore

wptk make template category
wptk make part hero
wptk make module related-posts
wptk make block callout
wptk make pattern cta
```

## Rules

- `init` writes a new directory. It refuses a non-empty directory unless
  `--force` is passed.
- `adopt` only writes `.wp-theme-kit.json` and, when asked, `.distignore` and
  the AGENTS.md block. It never rewrites theme code.
- `make module` writes `inc/<name>.php` and inserts an explicit
  `require_once get_template_directory() . '/inc/<name>.php';`. Do not add glob
  includes.
- `make block` is for block and hybrid themes. It writes
  `blocks/<name>/block.json`, `render.php`, and `style.css`, then registers the
  block in `functions.php`.
- `make part` writes `template-parts/<name>.php` for classic and hybrid themes,
  and `parts/<name>.html` for block themes.
- Names are lowercase kebab-case. Existing files are not overwritten without
  `--force`.

## After scaffolding

1. Run `wptk check`.
2. Read the generated files before editing; they carry the project prefix and
   text domain.
3. Add behavior in the new file, not by expanding a shared template.
4. For a block, verify `block.json` points at real files and that the render
   callback escapes output.

## 中文摘要

脚手架只负责按项目约定落文件。`init` 建新主题，`adopt` 只补配置和 agent
入口，`make` 生成模板、部件、PHP 模块、区块或 pattern。模块必须用显式
`require_once` 接入，不要 glob。生成后先跑 `wptk check`，再在对应文件里改行为，
不要把所有逻辑塞回 `functions.php`。
