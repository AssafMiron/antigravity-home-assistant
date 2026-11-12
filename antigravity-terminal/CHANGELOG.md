# Changelog

## 1.0.1

- Fixed Google OAuth authentication URL handling in the web terminal:
  - Added multi-line wrapped URL detection and link provider in `ttyd` so clicking any line of the wrapped OAuth link opens the complete, unbroken OAuth URL.
  - Added a floating **Google Sign-In Detected** helper bar when an OAuth prompt is active, with one-click **Open Sign-In Link**, **Copy Link**, and **Submit Code** controls.
  - Added a container `xdg-open` / `$BROWSER` handler that captures the full unbroken URL from `agy` and forwards it to the web terminal via OSC 52 / OSC 777.
- Fixed terminal text selection and clipboard copying:
  - Disabled `tmux` mouse-capture (`set -g mouse off`) so browser mouse selection works natively in `xterm.js` without swallowing selections.
  - Added an HTTP clipboard fallback (`document.execCommand('copy')`) so copy-on-select and `Ctrl+C` / `Cmd+C` work on plain HTTP origins (e.g., `http://homeassistant.local:8123`), automatically unwrapping multi-line URLs when copied.
- Fixed terminal `fontFamily` configuration in `ttyd` that caused fallback serif rendering, wide character spacing, and right-edge line clipping.

## 1.0.0

- Initial release of **Antigravity Terminal** for Home Assistant.
- Integrated `ttyd` web terminal with Ingress and persistent `tmux` session support.
- Added automatic installation and update support for Google Antigravity CLI (`agy`).
- Bundled the **Home Assistant Antigravity Harness** (`~/.gemini/config/`):
  - `GEMINI.md` and `rules/ha-yaml-standards.md` for modern HA 2025/2026 YAML & Jinja2 best practices.
  - `ha-automations`, `ha-dashboards`, and `ha-diagnostics` skills.
  - `hooks.json` with `SessionStart` live HA metadata injection and `PreToolUse` automatic file backups (`/data/backups/`).
- Added `ha-api` CLI helper and official `ha` Supervisor CLI for live entity, service, template, and reload operations.
