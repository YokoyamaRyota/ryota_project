# Host Compatibility

## Summary

This repository is now packaged primarily for GitHub Copilot in VS Code.

## Current Targets

| Surface | GitHub Copilot in VS Code | Repository stance |
|---------|----------------------------|-------------------|
| Source skills | `skills/<name>/SKILL.md` | Shared, host-neutral source of truth |
| Generated skill payload | `.github/skills/<name>/` | Generated from the same source |
| Agents | `.github/agents/*.agent.md` | Workspace-level custom agents |
| Instructions | `.github/copilot-instructions.md`, `.github/instructions/` | Primary instruction surface |
| Prompts | `.github/prompts/*.prompt.md` | Reusable task entrypoints |

## Integration Policy

- Keep source skills host-neutral.
- Keep GitHub Copilot workspace files in `.github/`.
- Do not reintroduce deleted host-specific metadata into `skills/`.