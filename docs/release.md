# Release runbook

This is the checklist for publishing `wp-theme-kit` to npm and refreshing the
plugin marketplaces. Run every step from the repository root, on a clean
checkout of the branch you intend to release.

Never commit an npm token, an OTP, or a `.npmrc` containing credentials.

## 1. Prepare

1. Bump the version in all four places. `npm run release:check` verifies they
   agree:

   - `package.json`
   - `src/version.mjs`
   - `.claude-plugin/plugin.json`
   - `.codex-plugin/plugin.json`

2. Move the `## [Unreleased]` section of `CHANGELOG.md` to
   `## [<version>] - <YYYY-MM-DD>`.
3. Update `README.md` and `README.zh-CN.md` if a command or behaviour changed.
4. Update `docs/HANDOFF.md` (`Version:` and the published-package line) and
   tick the matching item in `docs/ROADMAP.md`.
5. Run the full suite once:

   ```bash
   npm run test:ci
   claude plugin validate . --strict
   ```

6. Commit the release preparation, then check everything:

   ```bash
   npm run release:check -- --online
   ```

   The check covers version agreement, the CHANGELOG section, a clean working
   tree, upstream sync, the release tag, the npm registry, and (with
   `--online`) `npm whoami`.

## 2. Publish to npm

`npm publish` needs an interactive terminal because npm may prompt for a
one-time password:

```bash
npm publish --access public
```

If it prints a URL, open it in the browser and complete the check; the command
continues on its own. If it exits with `EOTP`, rerun it interactively (or pass
`--otp=<code>` from the authenticator).

Verify the registry result:

```bash
npm view wp-theme-kit version
tmp="$(mktemp -d)" && npm i --prefix "$tmp" "wp-theme-kit@$(node -p "require('./package.json').version")"
node "$tmp/node_modules/wp-theme-kit/bin/wp-theme-kit.mjs" --version
```

The install must add exactly one package (no runtime dependencies) and print
the new version.

## 3. Tag and push

```bash
git tag -a "v$(node -p "require('./package.json').version")" -m "wp-theme-kit $(node -p "require('./package.json').version")"
git push origin HEAD
git push origin "v$(node -p "require('./package.json').version")"
```

On this Windows host Git may fail with `CRYPT_E_NO_REVOCATION_CHECK`. Use the
system Git with the revocation check disabled for that one push:

```bash
"/c/Program Files/Git/cmd/git.exe" -c http.schannelCheckRevoke=false push origin HEAD
```

Alternatively set `git config --global http.schannelCheckRevoke false`. That is
a local TLS/CRL workaround, not a repository setting.

## 4. GitHub Release

```bash
gh release create "v<version>" --title "wp-theme-kit <version>" --notes-file <section>
```

`docs/ROADMAP.md` and the previous release show the shape: the notes are the
matching `CHANGELOG.md` section, not a new summary.

## 5. Refresh installed plugins

Claude Code caches the marketplace clone, so a published plugin manifest change
is picked up only after an explicit update:

```bash
claude plugin marketplace update wp-theme-kit
claude plugin update wp-theme-kit@wp-theme-kit
claude plugin list   # confirm the new version
```

Restart Claude Code to apply a plugin update.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm login` shows a CNPM / npmmirror URL | The npm registry is a mirror | `npm config set registry https://registry.npmjs.org/` |
| `E404 Not Found - PUT .../wp-theme-kit` | Stale or invalid token; npm masks auth failures as 404 | `npm whoami`; if it fails, `npm login` |
| `E401 Unauthorized` on `whoami` | Expired token | `npm login` |
| `EOTP` on publish | npm account has two-factor auth enabled | Run `npm publish` in a terminal and complete the browser or OTP prompt |
| `CRYPT_E_NO_REVOCATION_CHECK` on push/clone | Windows Schannel cannot reach the CRL endpoint | `git -c http.schannelCheckRevoke=false <command>` |
| `Repository not found` on push although the repo exists | The remote is wrong, private, or not created yet | `gh repo view <owner>/<repo>` and `git remote -v` |
| Plugin still reports the old version | Marketplace clone is cached | `claude plugin marketplace update` then `claude plugin update` |
