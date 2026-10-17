<!-- wp-theme-kit:begin -->
## WordPress theme development

This project uses `wp-theme-kit`. Before changing theme code:

- Read the relevant skill: `{{kitPath}}/skills/wp-theme-dev/SKILL.md`.
- Run `wptk check` after edits. If `wptk` is not on PATH, use
  `node {{kitPath}}/bin/wp-theme-kit.mjs`.
- Use `wptk shot` for visual changes and `wptk package` for releases.
- Never invent a second text domain or an unprefixed global function.
- Do not modify `style.css` version or package files unless the task is a release.

Project: {{projectName}} ({{projectType}}), text domain `{{textDomain}}`.
<!-- wp-theme-kit:end -->
