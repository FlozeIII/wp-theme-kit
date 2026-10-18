# 0001 Name the WordPress-side installer `wptk mu-plugin`

Date: 2026-10-18
Status: accepted

## Context

The roadmap asks for a `wptk harness install` command that installs mu-plugin
observation helpers into a WordPress site. The repository already uses
“harness” for AI runtimes: `wptk install --harness claude|codex|deepseek`
selects where skills are installed, and `src/install/` is described as harness
installation. A second `harness` command would make `wptk` help read as though
it installed AI harnesses twice, and would overload the term in documentation.

The command is not shipped yet, so renaming costs nothing today. The thing it
installs is precisely a mu-plugin: files in `wp-content/mu-plugins/`.

## Decision

Name the command group `wptk mu-plugin` with `install`, `status`, `mail`, and
`remove` subcommands. Reserve “harness” for AI runtimes in CLI text, and use
“runtime harness” or “mu-plugin helpers” when the WordPress-side setup must be
named.

## Consequences

- `wptk mu-plugin install` is self-describing and cannot be confused with
  harness selection.
- The roadmap item and HANDOFF wording change from `wptk harness install`.
- The installer reuses the existing install conventions (marked files, an
  install manifest, `--force`, and a `remove` subcommand) rather than the
  skill-installation targets.
- A future “runtime harness” that adds more than mu-plugins can still expose
  its own command without reusing this name.
