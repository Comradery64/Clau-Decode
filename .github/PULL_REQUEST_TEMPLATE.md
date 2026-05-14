<!--
Thanks for the PR! Fill out the sections below. Delete any that don't apply.
Title should follow Conventional Commits (feat:, fix:, chore:, docs:, refactor:, test:, ci:).
-->

## Summary

<!-- One or two sentences: what does this PR do? -->

## Motivation

<!-- Why are we making this change? Link the issue this PR closes:
     Closes #123
-->

## Changes

<!-- Bullet list of the meaningful changes. Avoid restating the diff line-by-line. -->

-

## Screenshots

<!-- For UI changes, drop before/after screenshots or short clips here.
     Delete this section if not applicable. -->

## Testing

<!-- What did you run, and what was the result?

```
make test
cd frontend && npm test
```
-->

## Checklist

- [ ] Tests pass locally (`make test` and `cd frontend && npm test`)
- [ ] `ruff` is clean (`uv run ruff check .` and `uv run ruff format --check .`)
- [ ] TypeScript builds (`cd frontend && npm run build`)
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if user-visible
- [ ] Docs updated if behavior, CLI flags, or config changed
- [ ] No telemetry, no remote network calls — data stays on the user's machine
