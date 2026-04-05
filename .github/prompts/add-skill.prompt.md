---
name: add-skill
description: Add or update a skill and keep GitHub Copilot workspace artifacts in sync.
agent: agent
tools: [search, read, edit, execute]
argument-hint: Describe the skill or the workflow you want to add.
---

Add or update a skill for this repository.

Requirements:

- Treat `skills/` as the authored source of truth.
- If a new skill is added, make sure the directory name matches the `name` field.
- Keep the source skill host-neutral.
- Update any manifests, docs, prompts, or instructions that should change with the new skill.
- Regenerate `.github/skills/` and validate the repository after edits.

Return a concise summary of the changed workflow and the verification that was run.