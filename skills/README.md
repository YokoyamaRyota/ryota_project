# Skills

This directory is the authored source of truth for unified skills.

Each skill directory should contain:

- `SKILL.md` required
- `references/` optional
- `scripts/` optional
- `assets/` optional

Required `SKILL.md` frontmatter:

- `name`
- `description`

Optional `SKILL.md` frontmatter:

- `license`
- `compatibility`

Run `node scripts/build-copilot-skills.js` to generate GitHub Copilot-facing skill copies in `.github/skills/`.