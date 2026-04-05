# GitHub Copilot Adapter

Status: implemented workspace adapter.

This directory holds thin templates for VS Code GitHub Copilot workspace customization files.

## Scope

- host-facing notes only
- opt-in setup guidance only
- no hidden behavior
- shared skills, not forked skills
- workspace instructions and custom agents

## Constraints

- No auto-approval
- No telemetry
- No background execution
- No core workflow logic

## Install Shape

The installer should treat GitHub Copilot support as:

- `full` for `.github/skills`
- `full` for `.github/copilot-instructions.md`
- `full` for `.github/agents/*.agent.md`

## Included Files

- `templates/copilot-instructions.md`
- `templates/agents/*.agent.md`