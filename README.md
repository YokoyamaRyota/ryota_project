# Super Skills

## 0. Document Metadata
- document_id: DOC-README-001
- classification: normative
- status: active
- owner: coordinator
- last_reviewed: 2026-04-07
- supersedes: none

Super Skills is a unified skill framework for GitHub Copilot in VS Code.

## What This Repository Provides

- authored source skills in `copilot-system/src/skills/`
- generated GitHub Copilot skill artifacts in `.github/skills/`
- workspace instructions in `.github/copilot-instructions.md`
- file-based instructions in `.github/instructions/`
- reusable prompts in `.github/prompts/`
- custom agents in `.github/agents/`
- local validation and memory scripts in `copilot-system/src/scripts/`

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
node copilot-system/src/scripts/validate-skills.js
node copilot-system/src/scripts/validate-configs.js
node copilot-system/src/scripts/scan-secrets.js
```

Run full local check:

```bash
npm run check
```

## GitHub Copilot Usage Model

GitHub Copilot consumes:

- generated skills from `.github/skills/`
- always-on instructions from `.github/copilot-instructions.md`
- file instructions from `.github/instructions/`
- prompts from `.github/prompts/`
- custom agents from `.github/agents/`

Typical flow:

1. Author or update a skill in `copilot-system/src/skills/`
2. Run `node copilot-system/src/scripts/build-copilot-skills.js`
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
node copilot-system/src/scripts/build-copilot-skills.js
node copilot-system/src/scripts/validate-configs.js
```

## Notes

- Generated artifacts in `.github/skills/` should be refreshed after every source skill change.