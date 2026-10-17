# wp-theme-kit

A cross-harness toolkit for WordPress theme development. The repository is both
a Claude Code plugin and a Codex plugin, and it ships skills that DeepSeek
Harness discovers from `.agents/skills` and Codex also reads from
`.codex/skills` when installed at project level.

For a full handoff, read `docs/HANDOFF.md` first, then `docs/ROADMAP.md` for
the next task. Those files do not assume any previous chat context.

## What is here

- `bin/wp-theme-kit.mjs` and `src/`: the zero-dependency `wptk` CLI.
- `skills/`: the shared skill pack. `wp-theme-dev` is the router.
- `commands/`: thin Claude Code slash commands.
- `templates/`: scaffolding templates for classic, block, and hybrid themes.
- `tests/`: `node --test` unit and integration tests.
- `install.mjs`: project or user-level skill installation for harnesses that do
  not use a plugin manifest.

## Working on this repository

- Node 22.2 or newer. No runtime npm dependencies; keep it that way.
- Run `npm test` after every change.
- Run `claude plugin validate . --strict` after touching a manifest or skill.
- Keep `skills/<name>/SKILL.md` frontmatter limited to `name`, `description`,
  `license`, and `metadata`. Codex rejects harness-specific keys.
- Keep skill resources inside the skill directory. Shared references live under
  `skills/wp-theme-dev/references/`.
- CLI commands must work without an LLM. Skills orchestrate; they do not
  implement capabilities.
- Do not add telemetry, network calls, or automatic publishing.
- The packaging path reads a committed Git revision. Uncommitted files must
  never enter an artifact.
- Use `spawn` with an argument array, never a shell string.

## Theme work

When using this kit on a theme:

1. Read `.wp-theme-kit.json`.
2. Run `wptk doctor` if the environment is unknown.
3. Use the `wp-theme-dev` skill to route to check, scaffold, preview, package,
   or i18n.
4. Never push, tag, or publish without an explicit instruction.

## Layout conventions

- Theme slug is lowercase kebab-case and equals the deployed directory name.
- Text domain equals the slug.
- Prefix global PHP symbols with the slug using underscores.
- Prefer new files plus explicit `require_once` over editing shared files.
- Escape at output; sanitize on input; verify nonces and capabilities.
