# Super Skills for GitHub Copilot in VS Code

This workspace uses shared skills from `skills/` and generated GitHub Copilot artifacts from `.github/skills/`.

Apply these defaults in chat and agent mode:

- Treat `skills/` as the authored source of truth.
- Treat `.github/skills/` as generated output for GitHub Copilot discovery.
- Prefer the custom agents in `.github/agents/` for exploration, review, and documentation lookup tasks.
- Keep edits explicit, avoid hidden automation, and prefer the smallest safe change set.
- Do not add host-specific frontmatter or VS Code-only metadata to `skills/`.
- Keep research, browser, and external-tool usage opt-in.

When a task maps to an existing skill, load that skill before improvising a new workflow.