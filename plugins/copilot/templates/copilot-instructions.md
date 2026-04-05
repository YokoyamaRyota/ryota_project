# Super Skills for GitHub Copilot in VS Code

This workspace uses shared skills from `skills/` and generated GitHub Copilot artifacts from `.github/skills/`.

Apply these defaults in chat and agent mode:

- Treat `skills/` as the authored source of truth.
- Treat `.github/skills/` as generated output for GitHub Copilot discovery.
- Prefer the custom agents in `.github/agents/` for exploration, review, and documentation lookup tasks.
- Keep edits explicit, avoid hidden automation, and prefer the smallest safe change set.
- Do not add host-specific frontmatter or VS Code-only metadata to `skills/`.
- Keep research, browser, and external-tool usage opt-in.

### Delegated Research Policy

- For each task, the coordinator must decide: internal exploration, primary-source verification, and browser observation (true/false each).
- If any item is true, run the corresponding research step before final implementation/review output.
- When a delegated task needs local evidence gathering, use `explorer` first.
- When a delegated task needs primary-source external verification, use `docs-researcher`.
- When a delegated task needs real UI observation, run browser-enabled QA workflow when browser capability is enabled.
- If browser capability is not enabled, run non-browser fallback research and report `browser_unavailable` with remaining uncertainty.
- Before external research starts, define and preserve: research goal, scope boundary, acceptance checks, and stop conditions.
- Every research response must include: evidence source, confidence level, and unknowns.

### Instruction Reliability Rules

- Do not rely on cross-file indirection for critical rules.
- Keep review-critical constraints directly in instruction files.
- If `needs_browser_observation=true` and browser is unavailable, include `remaining_uncertainty` in output.

When a task maps to an existing skill, load that skill before improvising a new workflow.