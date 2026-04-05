# Runtime Guidance

## Instructions And Prompts

Keep workspace-level instructions lean and durable.

- keep `.github/copilot-instructions.md` focused on stable repository rules
- place file-specific guidance in `.github/instructions/`
- place repeatable task entrypoints in `.github/prompts/`
- avoid burying deterministic rules in one giant instruction file

## Permissions

Default stance:

- safe by default
- explicit escalation
- no auto-approval assumptions

## Context Management

- plan before broad implementation
- use role-specific agents to isolate review and exploration work
- keep prompts focused and reusable