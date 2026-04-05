# Copilot Customizations Test Plan and Execution

## Objective

Validate that workspace-level GitHub Copilot customizations are discoverable, structurally valid, and installable.

## Scope

- `.github/copilot-instructions.md`
- `.github/agents/*.agent.md`
- `.github/prompts/*.prompt.md`
- `.github/instructions/*.instructions.md`
- `.github/skills/*/SKILL.md`
- Installer and validation scripts under `scripts/`
- Installer manifests under `manifests/`

## Test Strategy

1. Structural validation
2. Installer validation
3. Security scan
4. Isolated install verification
5. Consistency checks between source and generated artifacts

## Test Cases

- T1: Build generated skills
  - Command: `node scripts/build-copilot-skills.js`
  - Expected: `.github/skills/` regenerated without error
- T2: Validate source skills
  - Command: `node scripts/validate-skills.js`
  - Expected: all source skills valid
- T3: Validate config and installer surface
  - Commands:
    - `node scripts/validate-configs.js`
    - `node scripts/install-validate.mjs --profile copilot --target copilot`
  - Expected: config and installer validation pass
- T4: Secret scan
  - Command: `node scripts/scan-secrets.js`
  - Expected: no secret-like literals
- T5: Source/generated parity
  - Check: directory count of `skills/` equals `.github/skills/`
  - Expected: counts match
- T6: Frontmatter sanity for customizations
  - Check: every `*.agent.md`, `*.prompt.md`, `*.instructions.md` has frontmatter and `description`
  - Expected: all files pass
- T7: Isolated install apply
  - Command: `node scripts/install-apply.mjs --profile copilot --target copilot --target-root <temp>`
  - Expected in temp target:
    - `.github/copilot-instructions.md`
    - `.github/agents/explorer.agent.md`
    - `.github/prompts/add-skill.prompt.md`
    - `.github/instructions/skill-authoring.instructions.md`
    - `.github/skills/`
    - `.super-skills/targets/copilot.json`
    - `.super-skills/install-state/copilot.json`

## Execution Record

Date: 2026-04-05
Environment: Windows PowerShell

- T1 PASS
- T2 PASS
- T3 PASS
- T4 PASS
- T5 PASS (source=24, generated=24)
- T6 PASS (checked files=7)
- T7 PASS

## Manual UI Verification (Recommended)

Because CLI tests cannot confirm VS Code UI rendering directly, perform these checks in VS Code:

1. Open Chat and confirm custom agents are selectable:
   - `explorer`
   - `reviewer`
   - `docs-researcher`
2. Confirm prompts are discoverable:
   - `verify-copilot-customizations`
   - `add-skill`
3. Confirm workspace instruction behavior from `.github/copilot-instructions.md` is applied in chat responses.

## Exit Criteria

All automated tests pass and manual UI verification confirms discovery of agents and prompts.
