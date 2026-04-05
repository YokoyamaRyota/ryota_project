# Super Skills

Super Skills is a unified skill framework for GitHub Copilot in VS Code.

## What This Repository Provides

- authored source skills in `skills/`
- generated GitHub Copilot skill artifacts in `.github/skills/`
- workspace instructions in `.github/copilot-instructions.md`
- file-based instructions in `.github/instructions/`
- reusable prompts in `.github/prompts/`
- custom agents in `.github/agents/`
- installer manifests and validation scripts in `manifests/` and `scripts/`

## Design Goal

- author workflow logic once
- package it for GitHub Copilot first
- keep workspace customizations explicit and reviewable
- keep risky capabilities opt-in

## Quick Start

Build generated artifacts:

```bash
node scripts/build-copilot-skills.js
```

Validate repository state:

```bash
node scripts/validate-skills.js
node scripts/build-mcp-config.js --validate
node scripts/validate-configs.js
node scripts/scan-secrets.js
```

Preview an install:

```bash
node scripts/install-plan.mjs --profile copilot --target copilot
```

Apply an install into a target root:

```bash
node scripts/install-apply.mjs --profile copilot --target copilot --target-root /path/to/target
```

## GitHub Copilot Usage Model

GitHub Copilot consumes:

- generated skills from `.github/skills/`
- always-on instructions from `.github/copilot-instructions.md`
- file instructions from `.github/instructions/`
- prompts from `.github/prompts/`
- custom agents from `.github/agents/`

Typical flow:

1. Author or update a skill in `skills/`
2. Run `node scripts/build-copilot-skills.js`
3. Verify `.github/skills/`, `.github/agents/`, `.github/instructions/`, and `.github/prompts/`
4. Run the validation scripts

## Current Customizations

- `explorer`: read-only evidence gathering
- `reviewer`: findings-first correctness and security review
- `docs-researcher`: primary-source documentation verification
- `verify-copilot-customizations`: prompt for checking workspace discovery surfaces
- `add-skill`: prompt for extending the skill set safely

## VS Code Discovery Check

After opening this workspace in VS Code with GitHub Copilot enabled:

1. Open Chat and verify custom agents are available:
	- `explorer`
	- `reviewer`
	- `docs-researcher`
2. Open prompts and verify:
	- `verify-copilot-customizations`
	- `add-skill`
3. Confirm these files exist:
	- `.github/copilot-instructions.md`
	- `.github/instructions/*.instructions.md`
	- `.github/prompts/*.prompt.md`
	- `.github/skills/*/SKILL.md`
4. If discovery seems stale, run:

```bash
node scripts/build-copilot-skills.js
node scripts/validate-configs.js
```

## Notes

- MCP catalog files are still maintained in `mcp/`, but runtime enablement is not wired into the Copilot installer.
- Generated artifacts in `.github/skills/` should be refreshed after every source skill change.