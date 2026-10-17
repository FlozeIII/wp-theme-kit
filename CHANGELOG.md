# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `check --fix` for missing `wp_body_open()` in classic/hybrid headers,
  missing third text-domain arguments in eligible two-argument gettext calls,
  and numeric normalization of `Tested up to` header values.
- `check --fix --dry-run` previews edits without writing files. JSON reports
  include edit locations and replacements; applied fixes recheck the theme and
  use the remaining findings for the exit code. Suppressions and baselines are
  respected, while ambiguous syntax and symlinked files stay unchanged.
- Repository configuration for Matt Pocock engineering skills: local
  Markdown issue tracking, default triage labels, and domain-doc reading rules.

### Verified

- `npm test`: 93 passing, 1 skipped on Windows (file-symlink privileges).
- Combined fix fixture passes PHP syntax validation; Yuki dry run proposes no
  edits and reports 0 errors, 0 warnings, 8 info findings.

## [0.1.0] - 2026-10-17

### Added

- Zero-dependency `wptk` CLI with `init`, `adopt`, `check`, `doctor`, `make`,
  `package`, `verify-package`, `release`, `version bump`, `pot`, `shot`,
  `audit`, `preview`, and `install`.
- Static checks for classic, block, and hybrid WordPress themes.
- Scaffolding templates for classic, block, and hybrid themes.
- CDP-based screenshots and route audits using the system Edge or Chrome.
- Reproducible packaging from a committed Git revision with strict
  `.distignore` semantics.
- Offline POT generation for PHP and JavaScript gettext calls.
- Shared agent skills for Claude Code, Codex, and DeepSeek Harness.

### Verified

- `node --test`: 75 tests pass, including unit, package, scaffold, i18n, install,
  and browser tests.
- Dogfood against `yuki-theme` on 2026-10-17:
  - `wptk check`: 0 errors, 0 warnings, 8 info findings.
  - `wptk package --rev HEAD`: 34 files, with the same entry list as the
    theme's existing packager.
  - `wptk pot`: 112 msgids, matching `languages/yuki.pot` exactly.
  - `wptk shot`: a 1200x900 PNG from the local WordPress site.
- `claude plugin validate . --strict` passes.
- Claude `plugin marketplace add` and `plugin install` succeed against a
  temporary `CLAUDE_CONFIG_DIR`.
- Codex `plugin marketplace add` and `plugin add` succeed against a temporary
  `CODEX_HOME`; the plugin cache contains all six skills.
