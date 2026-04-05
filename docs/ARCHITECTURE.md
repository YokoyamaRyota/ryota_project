# Architecture

## Overview

Super Skills keeps workflow logic in host-neutral source skills and packages that logic into GitHub Copilot workspace customizations.

## Layers

### 1. Source skills

`skills/<name>/SKILL.md` is the canonical source for each skill.

### 2. Generated Copilot skills

`.github/skills/<name>/` is generated from `skills/` for GitHub Copilot discovery.

### 3. Workspace customizations

GitHub Copilot workspace guidance is installed into:

- `.github/copilot-instructions.md`
- `.github/instructions/`
- `.github/prompts/`
- `.github/agents/`

### 4. Installation model

`manifests/` and `scripts/install-*` define how a subset of the repository is installed into a target environment.

## Build Flow

1. Author or update `skills/<name>/SKILL.md`
2. Run `node scripts/build-copilot-skills.js`
3. Generated files appear in `.github/skills/<name>/`
4. Run `node scripts/validate-skills.js`
5. Run `node scripts/validate-configs.js`