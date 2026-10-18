# Context

Shared vocabulary for `wp-theme-kit`. One context for the whole repository.

## Harnesses

**AI harness** — An agent runtime that discovers and loads this repository's
skills: Claude Code, Codex, or DeepSeek Harness. Used by `wptk install
--harness ...`, the plugin manifests, and the skill pack.

**Runtime harness** — The WordPress-side test setup installed into a site so
end-to-end tests can observe behaviour. It is not an AI harness; it is the
thing the `wptk mu-plugin` command manages. Prefer “runtime harness” or
“mu-plugin helpers” over a bare “harness” when the AI sense is also in play.

## mu-plugin helpers

**mu-plugin helper** — One self-contained PHP file installed into
`wp-content/mu-plugins/` that changes site behaviour only for development and
testing. A helper carries an identifying header and a version.

**Mail capture** — The helper that intercepts outgoing mail, suppresses real
delivery, and records each message as a file plus one index entry.

**Upstream stub** — The helper that answers selected outbound HTTP requests
with a recorded fixture instead of contacting the real upstream.

**Fixture** — A JSON file describing one stubbed HTTP exchange: how to match a
request, and what response to return. Fixtures are replayed; the helper does
not record live responses.

**Harness directory** — The site directory that holds helper configuration,
captured mail, and fixtures. It is not part of a theme and must never ship in a
package.

**Install manifest** — The file that records which helper files this tool
installed, so `status` can report them and removal can avoid deleting files it
does not own.

**WP root** — The directory containing `wp-load.php`. Helpers are installed
relative to it, and it is resolved from configuration, the environment, or
discovery — never guessed from the theme directory.

## Files and ownership

**Marked file** — A file whose identifying header names this tool. Only marked
files recorded in the install manifest may be upgraded or removed.
