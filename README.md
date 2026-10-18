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
writes an install manifest, and supports `--uninstall`. The default is linking,
so the six skills are never duplicated; pass `--copy` only when links are not
usable.

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
| `wptk pot [--out file]` | Generate a POT file; `--merge` retains header metadata; `--check` compares msgids. |
| `wptk shot [route]` | Screenshot with a real viewport; `--all`, `--dark`, `--full-page`; `--cookie-file` for authenticated pages. |
| `wptk compare <expected> <actual>` | Pixel diff with `--tolerance`, `--channel`; `--out` writes a red/gray diff PNG. |
| `wptk audit [route]` | Console errors, failed assets, overflow, missing selectors, duplicate ids, empty links, unlabeled controls; `--cookie-file` for authenticated pages; `--baseline <file>` and `--update-baseline` accept known console/overflow findings. |
| `wptk preview [route]` | Open the route in the system browser. |
| `wptk version [bump patch|minor|major]` | Print or bump `style.css` and `package.json`. |
| `wptk package [out.zip] [--rev ref]` | Build from a committed revision. |
| `wptk verify-package <zip>` | Inspect an artifact without WordPress. |
| `wptk theme-check --zip <file>` | Run optional local Theme Check on an extracted artifact. |
| `wptk release [--rev ref]` | Local preflight, package, verify, and checklist; `--notes [--since ref]` drafts grouped notes. |
| `wptk install --harness ...` | Install skills and AGENTS.md entries. |
| `wptk mu-plugin <install\|status\|remove\|mail>` | Optional mail capture and HTTP stub helpers for local WordPress runs; `--wp-root`, `--helper`, `--force`, `--limit`, `--clear`. |

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
    "subdir": null,
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
    "guards": { "noHorizontalOverflow": true, "noConsoleErrors": true, "imagesLoaded": true, "accessibility": true }
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

## Audit baselines

```bash
wptk audit --update-baseline
wptk audit --baseline .wp-theme-kit-audit-baseline.json --json
wptk audit --baseline review/known-browser-issues.json --update-baseline
```

Baseline use is explicit: without these options, `audit` does not discover a
baseline automatically. Updating audits all configured routes, writes the current
enabled console/overflow findings atomically, and applies them on that run.
The default output is `.wp-theme-kit-audit-baseline.json` in the theme root;
explicit paths resolve relative to `--cwd`. Review the generated file before
accepting it. Static `check` baselines use a separate format and file.
New theme templates exclude the default audit baseline from packages. For an
existing theme or a custom baseline path, add its literal path to `.distignore`.

The version-1 JSON object contains a `findings` array. Each entry records `url`,
`viewport` (`width`, `height`), `colorScheme` (`light` or `dark`) and `kind`.
`console-error` entries add exact `message` text and a positive occurrence
`count`. `horizontal-overflow` entries add exact `scrollWidth`. Matching includes
the URL's origin/query and the actual viewport; extra error occurrences, changed
messages, new profiles and changed overflow widths remain failures. Repeated
route profiles record the maximum count from one visit, never the sum of visits.

JSON retains all observed facts, adds per-route `suppressed` counts/overflow
flags, and a top-level `baseline` object with `path`, `updated` and total
`suppressed`. Pretty output labels suppression alongside the raw counts.
HTTP status errors, HTTP/network asset failures, unloaded images and missing
selectors still fail. Disabled guards stay disabled and are excluded from
snapshots. Baselines never affect `shot` or its protection of existing images.

Reading never rewrites a baseline. Updates replace stale entries, require all
routes and enabled guarding, and reject a positional route or `--no-guard`.
Missing/invalid read files and malformed existing update files exit 2 before
opening a browser. Navigation/startup failures preserve existing baseline bytes.
Invalid JSON/UTF-8, unsupported versions/kinds, malformed entries and duplicate
identities are rejected. Audit JSON stdout stays parseable on failure.

`audit --baseline` 只接受精确匹配的已知控制台错误和溢出，原始观测仍保留。
通过 `--update-baseline` 显式更新全部路由；资源、图片和选择器失败仍须修复。

## Accessibility assertions

`wptk audit` also runs three DOM assertions that need no judgement call:

- **Duplicate ids.** Every `[id]` in document order; one finding per id with its
  use count. Empty ids are ignored.
- **Empty links.** `a[href]` and `area[href]` with no accessible name from
  `aria-labelledby`, `aria-label`, visible text, a descendant image `alt`, a
  descendant SVG `title`, or the `title` attribute. Text and images inside a
  `hidden` or `aria-hidden` descendant do not count.
- **Unlabeled controls.** `input`, `select` and `textarea` with no name from
  `aria-labelledby`, `aria-label`, an associated label, or `title`.
  `placeholder`, `name` and `value` never count. Hidden, submit, button, reset
  and image inputs are skipped.

Links and controls under `aria-hidden` or `hidden` are skipped as a whole. The
assertions ship with the same defaults as the other guards: a finding fails the
run and the CLI prints each finding with the route URL. They are not
baselineable, because a duplicate id or an unnamed link is always fixable.

Set `preview.guards.accessibility` to `false` to keep reporting the observations
without failing, or pass `--no-guard` to disable every audit gate for one run.
JSON adds `duplicateIds`, `emptyLinks` and `unlabeledControls` per route; pretty
output adds their counts. These are static DOM heuristics, not a WCAG audit:
they never replace keyboard, zoom and screen-reader review. `shot` does not run
them, so screenshot behavior is unchanged.

## Screenshot comparison

```bash
wptk shot --out dist/shots/home.png
wptk compare baseline/home.png dist/shots/home.png --tolerance 0.001 --channel 8
wptk compare baseline/home.png dist/shots/home.png --out dist/home.diff.png --json
```

`compare` decodes both PNGs and exits 1 when more than `--tolerance` (0..1,
default 0) of the pixels differ by more than `--channel` (0..255, default 0).
`--out` writes a diff PNG: changed pixels are red and unchanged pixels are the
expected image faded toward white. Sizes must match; a mismatch exits 1 with
`reason: "size-mismatch"` and writes no diff. `--out` must not point at an input
image. Bad arguments, unreadable files and unsupported PNGs exit 2.

The comparison is offline and browser-free, so it fits CI: capture with `shot`,
then diff against committed baselines. Only 8-bit non-interlaced gray, RGB,
gray+alpha and RGBA PNGs up to 50 megapixels are supported; Chromium screenshots
use that subset. Palettes, 16-bit images, interlacing and `tRNS` transparency are
rejected. JSON reports `changedPixels`, `totalPixels`, `changedRatio`,
`maxChannelDelta`, the effective options and the diff path.

## Editor screenshots and cookie fixtures

Admin screens such as `/wp-admin/post-new.php` need a logged-in session. Keep
the cookies in a JSON fixture outside version control and pass it to `shot` or
`audit`:

```json
{
  "cookies": [
    {
      "name": "wordpress_logged_in_abc123",
      "value": "user|...",
      "url": "http://localhost:8080"
    }
  ]
}
```

```bash
wptk shot /wp-admin/post-new.php --cookie-file .wp-theme-kit-cookies.json --out dist/editor.png
wptk audit /wp-admin/post-new.php --cookie-file .wp-theme-kit-cookies.json
```

`--cookie-file` overrides `preview.cookieFile`, which is resolved from the theme
root. Each cookie needs `name`, `value` and either `url` or `domain`; `path`
defaults to `/`, `httpOnly` to `true`, `secure` to `false` and `sameSite` to
`Lax`. Cookies are set on every route before the first request, so the initial
navigation is already authenticated. Values are never printed, and an invalid
fixture exits 2 before a browser starts. Keep the fixture out of Git and rotate
the session when you are done.

## Mu-plugin helpers

`wptk mu-plugin` installs two optional PHP helpers into a local WordPress site's
`wp-content/mu-plugins/`. They are development-time observation tools: they
never ship with a theme and must not be installed on production.

```bash
wptk mu-plugin install --wp-root ../wordpress
wptk mu-plugin status --wp-root ../wordpress
wptk mu-plugin mail --limit 5 --wp-root ../wordpress
wptk mu-plugin mail --clear --wp-root ../wordpress
wptk mu-plugin remove --wp-root ../wordpress
```

| File | Purpose |
| --- | --- |
| `wp-theme-kit-mail.php` | Captures `wp_mail()` into `.eml` files and `index.jsonl` instead of sending. |
| `wp-theme-kit-http-stub.php` | Replays JSON fixtures for outgoing HTTP requests. |

`--helper mail|http|all` limits `install` and `remove`. Each helper carries a
`WP-Theme-Kit-Helper` header and a `Version`, and
`wp-content/mu-plugins/.wp-theme-kit-harness.json` records what was installed.
Older helpers are upgraded; newer or unmarked files are refused unless
`--force` is passed, so a hand-edited or third-party file is never silently
replaced. A marked helper that is already current but missing from the manifest
is adopted on the next `install`. `remove` exits 1 when no manifest exists and
deletes only files whose marker names the helper it recorded; a file with a
different marker is reported and left alone.

The WordPress root comes from `--wp-root`, then `wordpress.path` in
`.wp-theme-kit.json`, `WPTK_WP_ROOT`, or an ancestor containing `wp-load.php`.
`install` writes `wp-content/wp-theme-kit-harness/wp-theme-kit-harness.json`
once; later runs keep an existing file:

```json
{
  "version": 1,
  "enabled": { "mail": true, "http": true },
  "mailDir": "mail",
  "httpDir": "http",
  "http": { "strict": false, "hosts": [] }
}
```

`wptk mu-plugin mail` lists captured messages newest first, 50 by default;
`--limit n` narrows the list and `--clear` deletes indexed `.eml` files,
attachments and `index.jsonl` while leaving unrelated files alone. Everything
stays under `wp-content/wp-theme-kit-harness/mail/`. A config whose
`mailDir`/`httpDir` is absolute or contains `..` is refused by `mail` and
reported by `status`; the helpers stay disabled in that case rather than
falling back to another directory.

Drop HTTP fixtures as `*.json` files in `wp-content/wp-theme-kit-harness/http/`.
They are evaluated in file-name order and the first match wins:

```json
{
  "match": { "method": "GET", "url": "^https://api\\.example\\.com/v1/" },
  "status": 200,
  "headers": { "content-type": "application/json" },
  "json": { "ok": true }
}
```

`match.method` is an uppercase method or `*`; `match.url` is a regular
expression over the full URL. Exactly one of `body` (text), `json` (encoded
JSON), `bodyFile` (relative file, at most 5 MiB) or `base64` supplies the
response body. `status` defaults to 200 and `delayMs` to 0; a delay is capped
at 10000 ms so a fixture cannot stall a request for longer. Unmatched requests
pass through to the network; set `http.strict` to `true` to return a
`wptk_no_fixture` `WP_Error` instead, and use `http.hosts` to limit which hosts
are stubbed. `wptk mu-plugin status` reports invalid fixtures without printing
file contents.

Both helpers stay inert when `wp_get_environment_type()` is `production` unless
the `wp_theme_kit_harness_enabled` filter returns true. They write only inside
`wp-content/wp-theme-kit-harness/`, never deliver captured mail, and never print
cookie or credential values.

With `--json`, stdout carries one JSON document and errors go to stderr. Keys:
`install` returns `root`, `helpers`, `changed[]` and `config{path,created}`;
`status` returns `root`, `installed[]{helper,file,version,state,reason?}`,
`dirs{muPlugins,harness,mail,http}`, `config{exists,path,error}` and
`fixtures{total,valid,invalid}`; `remove` returns `root`, `helpers`,
`changed[]`, `config` and `installed[]`; `mail` returns `dir`, `total`, `count`
and `messages[]`, or `{cleared}` with `--clear`. `changed[]` entries carry
`helper`, `file` and `action` (`install`, `update`, `adopted`, `unchanged`,
`removed`, `absent`, `skipped`).

## POT header metadata

```bash
wptk pot --merge
wptk pot --merge --out languages/my-theme.pot
wptk pot --check
```

`--merge` reads the existing output file and retains its header comments,
translator/team details, revision date, bug-report address and custom fields.
Empty values are retained; missing fields receive normal defaults.
`Project-Id-Version`, `POT-Creation-Date`, `X-Generator`, `X-Domain` and
`Content-Type` are refreshed from normal generation. Output is UTF-8; set
`SOURCE_DATE_EPOCH` for a reproducible creation timestamp.

All message entries, references and empty translations are regenerated from
current source. Removed strings and old entry comments/translations are dropped.
This merges header metadata rather than translations from PO files.

A missing output file is generated normally. An existing file must be UTF-8
with a parseable header; malformed/duplicate header entries and duplicate field
names (ignoring case) exit 2 before writing. Fix the header or use ordinary `wptk pot` to replace
it. Quoted continuations, BOM/CRLF, folded field values and escaped quotes,
backslashes, tabs, newlines and carriage returns are supported. Logical CRLF
header line endings normalize to LF. Other escapes are rejected.
`--merge` and `--check` are mutually exclusive; `--check` remains read-only.
Without `--merge`, generation keeps its previous behavior.

## Themes in repository subdirectories

Set `package.subdir` to the theme's literal path from the Git repository root:

```json
{ "package": { "subdir": "themes/my-theme" } }
```

Place the config at the repository root or the selected theme root. `package`,
`release` and `verify-package` then infer metadata from that theme. Other
commands keep their existing context selection. Checks, POT/version files,
`.distignore` paths and default output are theme-relative: the default ZIP in
this example is `themes/my-theme/dist/<slug>.zip`. Explicit output arguments
retain their existing CLI resolution.

The ZIP contains only `<slug>/` and the selected committed subtree. Its exclusion
list comes from the same revision inside that theme; root/sibling files and
uncommitted data stay outside. Attribute isolation and atomic writes still apply.
Git object reads stay offline. Release requires the whole repository to be clean.

Use forward-slash literal paths; Unicode and spaces work. Absolute paths, dot
segments, glob/pathspec syntax and symlink/junction directory aliases are
rejected. The subtree must exist as a directory in the requested commit.
Null/empty `package.subdir` preserves repository-root-only packaging. Subtree
archives require Git with `archive --mtime` support for stable commit timestamps.

## Theme Check on a ZIP

```bash
wptk theme-check --zip dist/my-theme.zip --wp-root /path/to/wordpress
wptk theme-check --zip dist/my-theme.zip --json
```

This optional helper uses an existing local WordPress core, PHP/WP-CLI and the
Theme Check plugin's official CLI adapter at
`wp-content/plugins/theme-check/wp-cli/class-theme-check-cli.php`.
WordPress discovery uses `--wp-root`, `wordpress.path` in the kit config,
`WPTK_WP_ROOT`, or an installation above the working directory. PHP and WP-CLI
use the same discovery as `doctor` (including `WPTK_PHP` and `WPTK_WP_CLI`).
Nothing is downloaded or installed.

The helper validates the ZIP and extracts it as
`<temporary-root>/wp-content/themes/<slug>/`. It invokes WP-CLI `eval-file
--skip-wordpress` with WordPress's theme/formatting libraries and the official
Theme Check command class. It uses static options and an in-memory cache,
without loading a site's configuration, database, plugins or theme PHP.
Core/checker directory links are removed before the temporary root is cleaned,
including after failed checks. WP-CLI configuration and cache are temporary.
This is an isolated static inspection, not a live-site runtime test; child-theme
parent files are not supplied. The local runtime acceptance used WordPress 7.1.3
and Theme Check 20260901.

Exit codes are `0` for a completed pass or an explicit tooling skip, `1` for a
Theme Check failure, and `2` for invalid input or tool/runtime errors. A skip
prints its reason; JSON distinguishes it with `skipped: true` and `ok: null`.
Completed JSON reports contain `skipped: false`, boolean `ok`, and the checker's
`findings` rows with `type` and `value`. Recommendations and warnings retain
Theme Check's own pass/fail policy. Missing tools do not hide a malformed ZIP.
Archives require a single slug directory and `style.css`; traversal, Windows
device/short-name aliases, case collisions and file/directory conflicts are
rejected before extraction. Entries are materialized as ordinary files.

## Release tag preflight

`wptk release --rev <tag>` requires the tag's commit to equal the repository's
`HEAD`. Lightweight and annotated tags of any name count, including full
`refs/tags/<name>` and `tags/<name>` references. A mismatch fails before notes
or packaging and preserves an existing ZIP. Check out the reported commit with
`git switch --detach <commit>` and retry; keep released tags immutable.

Use explicit `refs/tags/<name>` or `refs/heads/<name>` when a short name is
ambiguous. Full refs use their exact namespace, and the ZIP uses the preflight's
resolved commit. A version-shaped branch alone is still a branch. SHA, branch and
commit-expression revisions retain historical release behavior; `wptk package`
also continues to accept historical tags. The gate applies with `--notes` and
`package.subdir`, and all Git reads stay offline.

通过标签执行 `release` 时，标签提交必须等于当前 HEAD；不一致时保留原 ZIP。
可检出提示的提交后重试；历史产物仍可通过 `package --rev <tag>` 构建。

## Release notes drafts

```bash
wptk release --notes
wptk release --rev v1.2.0 --notes --since v1.1.0 --json
```

`--notes` adds a Markdown draft to the normal local release output. JSON adds a
`notes` object containing `from` (ref and commit, or null), `to` (the packaged
commit), `subdir`, grouped commit records and `markdown`. The draft heading uses
the target commit's `style.css` version. Nothing is written to a separate notes
file, tagged, pushed or published; the checklist asks you to review the draft.

The default starting point is the nearest reachable tag selected by
`git describe --tags`, excluding all tags pointing directly to the target.
Annotated and lightweight tags count. Without a preceding tag, all history is
included. `--since` selects an explicit ancestor commit/tag and requires
`--notes`; the range excludes that base and includes the target. Equal endpoints
produce an explicit no-changes draft. Shallow or unavailable history fails
before the ZIP is replaced; Git never fetches missing objects. History reads
ignore replacement refs, matching the archive's original commit objects, and
tag discovery is independent of Git's column/color display configuration.

Non-merge commits are listed oldest first within each group:

| Group | Commit convention |
|---|---|
| Breaking Changes | `type!:` / `type(scope)!:`, or a body line starting `BREAKING CHANGE:` / `BREAKING-CHANGE:` |
| Added | `feat` |
| Fixed | `fix` |
| Changed | `perf`, `refactor`, `style` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `test`, `revert` |
| Other Changes | Other subjects, retained in full |

Scopes and the first line of breaking-change details are retained. Markdown and
HTML in Git text are escaped. Empty groups are omitted. For `package.subdir`,
commit history is restricted to that literal theme directory; automatic tag
selection remains repository-wide, so use `--since` for theme-specific tags.
Existing release gates and behavior without `--notes` remain unchanged.

## Script footer argument types

`php.script-footer` checks the fifth argument of `wp_enqueue_script()`. Use
`true`/`false`, or a WordPress 6.3+ options array such as
`[ 'strategy' => 'defer', 'in_footer' => true ]`. A string such as `'false'`
is truthy in WordPress and still selects the footer.

Known string/numeric/null fifth arguments warn. For literal short/long arrays,
the rule checks the final known `in_footer` entry; string/numeric/null/array
values warn. Booleans, omitted arguments, empty arrays and other options are
accepted. Comments, parentheses, nested values and trailing commas work.

Complex string interpolations with nested same-quote expressions are skipped.
Unresolved expressions, named arguments, call unpacking and arrays with unknown
keys or unpacking are skipped, as are heredoc/nowdoc and binary strings. Escaped
numeric/Unicode array keys are unresolved. Only global enqueue-script calls are
checked; methods/classes and namespace-qualified calls are excluded, and files
with namespaces/imports require explicitly global names. Inspected PHP is never
executed. Existing severity, suppression, baseline, diff and fix-recheck behavior
applies; the rule does not choose a footer value or automatically fix it.
The existing JS fallback may miss later calls after a heredoc closing label
with following syntax on the same line; use the PHP analyzer for these files.

## printf argument counts

`php.printf-arguments` warns when a literal PHP `printf()` format needs more
values than the call supplies. For example, `printf( '%s: %d', 'Posts' )` needs a
second value. Exact single/double-quoted formats and source literals in singular
WordPress gettext return wrappers are supported in every theme type.

The count follows PHP: `%%` needs no value, repeated positional references reuse
values, and star width/precision consume arguments (including positional stars
in PHP 8+). Flags, ASCII padding, literal width/precision and standard conversions
are supported. Extra values are legal and do not produce warnings.

Dynamic/concatenated/interpolated formats, heredoc/nowdoc, numeric/Unicode escapes
in double-quoted formats, binary-prefixed strings, plural/unknown wrappers, named arguments and unpacking
are skipped. Methods, constructors, attributes and namespace-qualified names are
excluded; files with namespaces/imports require explicitly global function and
wrapper names. Bare/global names are case-insensitive. Unsupported format syntax
is skipped, and no PHP source is evaluated. The rule has no automatic fix and
retains the existing severity, ignore, baseline, diff and fix-recheck pipeline.

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
before/after examples. All 42 current rules have entries in the shipped
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
  图片加载与选择器检查；用 cookie 夹具截取登录后的编辑页，并对比两张截图的
  差异（容差 + diff 图）。
- **本地观测**：`mu-plugin` 把邮件捕获与 HTTP stub 助手装进本地
  `wp-content/mu-plugins/`，记录清单、只更新旧版本，生产环境默认不生效。
- **打包与发布**：按已提交的 Git 快照出包，严格的 `.distignore`，包内容验收，
  版本号检查，POT 新鲜度检查，发布清单。
- **国际化**：从 PHP 与 JS 的字面量 gettext 调用生成 POT，并可做 msgid 集合比对。
  `pot --merge` 保留已有头部的人工及自定义信息，同时更新版本等自动字段和词条。

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
