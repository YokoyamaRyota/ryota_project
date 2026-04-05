# Agent Patterns

## Summary

Agent roles in Super Skills should be narrow, evidence-oriented, and easy to compose in GitHub Copilot.

## Core Roles

### `explorer`

Use for read-only codebase discovery and evidence gathering before edits.

### `reviewer`

Use for correctness, regression, and security review with findings-first output.

### `docs-researcher`

Use for primary-source API and documentation verification.

## Research Decision Pattern

Coordinator decides three flags per task before implementation:

- `needs_internal_exploration`
- `needs_primary_source_verification`
- `needs_browser_observation`

Execution rules:

- If `needs_internal_exploration=true`, delegate to `explorer`.
- If `needs_primary_source_verification=true`, delegate to `docs-researcher`.
- If `needs_browser_observation=true`, run browser QA workflow when browser capability is enabled.
- If browser capability is unavailable, perform fallback research and return `browser_unavailable` with uncertainty notes.

## Research Reliability Pattern

- Record research requirements in task contract before implementation.
- Track execution in `state.research_state` (`*_done`, `browser_unavailable`, `remaining_uncertainty`).
- Emit evidence in a structured report with source, confidence, unknowns.
- Use hook-based warnings at `UserPromptSubmit` and `Stop` to catch missing research decisions or missing uncertainty notes.

## Design Rules

- Prefer role-specific agents over vague personas.
- Keep tool access narrow when the task is read-only.
- Use prompts for one-off task entrypoints and agents for persistent operating modes.