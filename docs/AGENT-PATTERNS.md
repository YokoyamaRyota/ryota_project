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

## Design Rules

- Prefer role-specific agents over vague personas.
- Keep tool access narrow when the task is read-only.
- Use prompts for one-off task entrypoints and agents for persistent operating modes.