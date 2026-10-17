# Issue tracker: Local Markdown

Issues and specs live as Markdown files under `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- One ticket per file: `.scratch/<feature-slug>/issues/NN-<slug>.md`,
  numbered from `01`.
- Record triage state near the top as `Status: <role>`, using
  `triage-labels.md`.
- Append discussion under `## Comments`.

When a skill says "publish to the issue tracker", create the appropriate
local file. When it says "fetch the relevant ticket", read that file.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, containing Notes, Decisions-so-far,
  and Fog.
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`.
- Record `Type: research|prototype|grilling|task`.
- For wayfinding tickets, use `Status: open|claimed|resolved` for execution
  state; record any separate triage role as `Triage: <role>`.
- Record dependencies as `Blocked by: NN, NN`.
- Select the first numbered open, unclaimed ticket whose blockers are resolved.
- Claim by saving `Status: claimed` before starting work.
- Resolve by appending `## Answer`, setting `Status: resolved`, and adding
  a summary plus link to the map's Decisions-so-far.
