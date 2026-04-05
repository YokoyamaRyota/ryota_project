---
name: Installer Surface Rules
description: Use when editing manifests or installer scripts that control Copilot packaging.
applyTo: manifests/**
---

# Installer Surface Rules

- Treat GitHub Copilot workspace customizations under `.github/` as the primary install surface.
- Keep install manifests explicit about target paths and generated operations.
- Prefer full support for the `copilot` target and mark incomplete targets as scaffold only.
- Do not reintroduce deleted Codex or Claude target modules without also restoring validation and documentation.