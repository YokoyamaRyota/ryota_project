# Plugins

Plugins are host adapters, not workflow sources.

## Repository Shape

- `plugins/copilot/`

## Philosophy

- Keep adapters thin.
- Keep execution opt-in.
- Keep core workflow semantics in `skills/`, `docs/`, and `manifests/`, not in host glue.
- Prefer explicit user actions over hidden automation.