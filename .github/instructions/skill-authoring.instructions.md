---
name: Skill Authoring Rules
description: Use when editing skill definitions or adding new skills to this repository.
applyTo: skills/**/SKILL.md
---

# Skill Authoring Rules

- Keep `skills/` host-neutral and portable.
- Use only source-skill frontmatter that is valid for Agent Skills: `name`, `description`, and optional `license` or `compatibility`.
- Make the description trigger-oriented and include concrete `Use when ...` or `Use for ...` phrasing.
- Keep detailed examples or large reference material in sibling files instead of bloating `SKILL.md`.
- Never add VS Code-specific, Claude-specific, or Codex-specific metadata to source skills.