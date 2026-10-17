# Release Checklist

Run these steps in order. Stop when a step fails.

## 1. Confirm the starting point

```bash
git status --short
git fetch origin
git log --oneline origin/main..HEAD
git rev-parse HEAD
git tag -l
```

The tree must be clean. The release commit must not contain unrelated work.
Never move a tag that was already published.

## 2. Bump the version

```bash
wptk version bump patch
```

This updates `style.css` and `package.json` when present. Commit the result.

## 3. Tag and push

```bash
git tag -a v1.2.0 -m "Theme 1.2.0"
git push origin main
git push origin v1.2.0
git rev-parse HEAD
git rev-parse 'v1.2.0^{commit}'
```

The last two commands must print the same commit.

## 4. Build from the tag

```bash
wptk package dist/theme-1.2.0.zip --rev v1.2.0
wptk verify-package dist/theme-1.2.0.zip
```

`wptk release --rev v1.2.0` does both after a clean-tree and version check.

## 5. Verify behavior

```bash
wptk check
wptk audit
wptk shot
```

Run the project's own acceptance scripts as well. Record the pass counts.

## 6. Theme Check the artifact

Run Theme Check against the **extracted artifact**, not the worktree. The theme
directory name must equal the text domain. Development files in the worktree
produce findings that are not present in the package.

## 7. Release notes

```bash
git log --oneline v1.1.0..v1.2.0
```

Group by user-visible change: added, fixed, behavior changes. Mention required
upgrade actions.

## 8. Publish

Upload the zip produced in step 4. Do not use GitHub's auto-generated source
zip: its top-level directory and contents are wrong for a theme.

## 9. Record

Record the tag, release commit, zip path, acceptance counts, Theme Check counts
with dispositions, and the release URL.
