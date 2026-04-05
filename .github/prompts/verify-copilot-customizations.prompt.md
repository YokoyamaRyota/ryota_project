---
name: verify-copilot-customizations
description: Verify that workspace-level GitHub Copilot skills, instructions, and custom agents are wired correctly.
agent: explorer
tools: [search, read]
argument-hint: Optional focus area such as skills, agents, instructions, or prompts.
---

Check this workspace for GitHub Copilot customization health.

Focus on these items:

- `.github/copilot-instructions.md` exists and matches the current workspace direction.
- `.github/agents/*.agent.md` files are present, coherent, and reference sensible tools.
- `.github/skills/*/SKILL.md` exists for every source skill.
- `.github/instructions/*.instructions.md` and `.github/prompts/*.prompt.md` are valid and discoverable by location.

Return:

1. concrete findings first
2. missing files or mismatched locations
3. any probable discovery risks in VS Code