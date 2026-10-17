# Handoff

This document is the entry point for an agent continuing work on `wp-theme-kit`.
It does not assume access to any previous chat, plan file, or local session.

## Current state

- Version: `0.1.0`
- Status: usable; all four capability areas are implemented, with the first
  v0.2 roadmap item (`check --fix`) completed.
- Tests: `npm test` -> 93 passing, 1 skipped on Windows because file-symlink
  creation requires privileges. The combined fix fixture passes PHP lint.
- Dogfood against `yuki-theme`:
  - `wptk check`: 0 errors, 0 warnings, 8 info.
  - `wptk package --rev HEAD`: same entry list as the theme's existing packager.
  - `wptk pot`: 112 msgids, identical to `languages/yuki.pot`.
  - `wptk shot`: 1200x900 PNG.
- Claude `plugin validate . --strict` passes.
- Claude and Codex plugin installs were smoke-tested in temporary config roots.
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
        -> src/scaffold/          templates and code generation
        -> src/preview/           CDP screenshots and audits
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
- `src/check/index.mjs` discovers files, runs rules, applies severity overrides,
  inline ignores, and baselines, then renders the report.
- A rule calls `ctx.add({ line, severity, message, hint, file })`.
- Rule IDs are stable API. Changing an ID changes baseline fingerprints.
- Inline ignores: `wptk-ignore`, `wptk-ignore-next-line`, `phpcs:ignore`.
- `src/check/fix.mjs` plans whitelisted edits from visible findings and applies
  them atomically per file. Dry runs emit plans only; applied fixes reload theme
  metadata and run the checker again. See the README's Mechanical fixes section
  for the whitelist and CLI behavior. Acceptance fixtures live in
  `tests/integration/check-fix.test.mjs`.

### Packaging pipeline

- `src/package/distignore.mjs` parses strict literal paths.
- `src/package/archive.mjs` resolves a revision, reads `.distignore` from that
  revision, builds through a temporary bare repo with alternates, neutralizes
  attributes, and writes atomically.
- `src/package/verify.mjs` reads the zip's central directory and checks the
  artifact, not the worktree.
- `src/package/index.mjs` runs preflight checks and orchestrates.
- `src/zip/read.mjs` has no dependencies.

### Preview pipeline

- `src/preview/browser.mjs` launches Edge/Chrome with a system CDP port and
  returns a small page client.
- The viewport is set before navigation. Do not switch to
  `--screenshot --window-size`; it renders at a wider layout and crops.
- `src/preview/capture.mjs` applies guards and writes images atomically.
- `src/preview/audit.mjs` reports console errors, failed assets, overflow,
  unloaded images, and missing selectors.

### i18n

- `src/i18n/functions.mjs` is the single source for gettext signatures.
- `src/i18n/extract.mjs` extracts PHP literals and `wp.i18n` literals.
- `src/i18n/pot.mjs` writes and parses POT; comparison ignores references.
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
  and `.codex/skills`, and writes the AGENTS.md block.

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
- Packaging requires the theme root to be the Git root.
- Mechanical fixes cover only the documented whitelist. Ambiguous syntax,
  namespaced/imported gettext calls, and symlinked source files require manual
  edits. The mu-plugin E2E harness installer and npm publishing remain deferred.

## 中文摘要

交接时先提交基线，再让新 Agent 依次读 `AGENTS.md`、`docs/HANDOFF.md`、
`docs/ROADMAP.md`，跑 `npm test` 和 `claude plugin validate . --strict`。
架构是 `bin -> cli -> commands -> 领域模块`；检查规则在 `src/check/rules/`，
打包在 `src/package/`，预览在 `src/preview/`，技能在 `skills/`。
保持零运行时依赖、只从已提交快照打包、技能 frontmatter 三端兼容、不自动发布。
多 Agent 并行时一人一个分支/工作树，不要同时改同一个文件。
