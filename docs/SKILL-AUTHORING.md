# Skill Authoring

## Source Contract

Every source skill lives in:

```text
skills/<skill-name>/
  SKILL.md
  references/...   optional
  scripts/...      optional
  assets/...       optional
```

`SKILL.md` must include:

- `name`
- `description`

Optional keys:

- `license`
- `compatibility`

Rules:

- `name` must match the directory name.
- `description` must read like an invocation trigger.
- keep host-specific metadata out of source skills.

## Generator Responsibilities

- `scripts/build-copilot-skills.js` copies the source skill tree into `.github/skills/`.
- `scripts/validate-skills.js` enforces the source contract and blocks host-specific frontmatter drift.