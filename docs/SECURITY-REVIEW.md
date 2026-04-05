# Security Review

## Scope

This review covers the Copilot-focused baseline implemented in this repository:

- `skills/` and generated `.github/skills/`
- `.github/` workspace customizations
- `plugins/` host adapters
- `manifests/` and installer scripts

Review date: 2026-04-05

## Current Strengths

- Workspace customizations are explicit files, not hidden automation.
- Riskier research capability remains opt-in at the profile level.
- Generated and authored content stay separate.
- Validation checks the install manifests and required Copilot customization files.

## Remaining Risks

- VS Code runtime discovery is validated structurally, not by interrogating the Chat Customizations diagnostics UI.
- Secret scanning remains heuristic.
- Scaffold targets are intentionally incomplete and should not be treated as production-ready.