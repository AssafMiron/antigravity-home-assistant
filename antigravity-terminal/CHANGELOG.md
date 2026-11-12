# Changelog

## 1.0.0

- Initial release of **Antigravity Terminal** for Home Assistant.
- Integrated `ttyd` web terminal with Ingress and persistent `tmux` session support.
- Added automatic installation and update support for Google Antigravity CLI (`agy`).
- Bundled the **Home Assistant Antigravity Harness** (`~/.gemini/config/`):
  - `GEMINI.md` and `rules/ha-yaml-standards.md` for modern HA 2025/2026 YAML & Jinja2 best practices.
  - `ha-automations`, `ha-dashboards`, and `ha-diagnostics` skills.
  - `hooks.json` with `SessionStart` live HA metadata injection and `PreToolUse` automatic file backups (`/data/backups/`).
- Added `ha-api` CLI helper and official `ha` Supervisor CLI for live entity, service, template, and reload operations.
