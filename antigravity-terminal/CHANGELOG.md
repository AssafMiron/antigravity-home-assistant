# Changelog

## 1.0.3

- Corrected Home Assistant configuration path from `/config` to `/homeassistant` across `GEMINI.md`, skills (`ha-automations`, `ha-dashboards`, `ha-diagnostics`), rules, and hooks, aligning with modern Home Assistant `homeassistant_config:rw` mount layout (with a `/config` symlink for backward compatibility).
- Fixed `ha-api states` failure on systems missing `column` by adding resilient TSV table formatting with `awk`/`printf` fallback and bundling `bsdextrautils` in `Dockerfile`.
- Added sandbox execution rule in `GEMINI.md` instructing Antigravity to run `ha-api` and `ha` commands with `BypassSandbox: true` immediately, eliminating sandbox socket resets and duplicate retry prompts.
- Added custom **Antigravity sidebar icon** (`agy:antigravity` vector arch logo) in the Home Assistant sidebar via both same-origin Ingress injection and automatic Lovelace frontend module registration (`/local/agy-ha-sidebar-icon.js`).
- Migrated container build parameters (`FROM` multi-arch base image selection and OCI `LABEL` metadata) directly into `Dockerfile` and removed the deprecated `build.yaml` file.
- Updated `config.yaml` folder mapping from legacy `addon_config:rw` to `app_config:rw` for Home Assistant 2026 Supervisor compatibility.

## 1.0.2

- Reverted browser auto-open (`xdg-open` / `$BROWSER`) and auto-copy-on-select behaviors that caused the CLI OAuth flow and Home Assistant UI to stall.
- Fixed Google OAuth authentication URL truncation in the web terminal (inspired by `heytcass/home-assistant-addons#122`):
  - Reconstructs hard-wrapped multi-line OAuth URLs in `ttyd` so clicking directly on any wrapped line of the URL in the terminal opens the complete, unbroken authorization link.
  - Added `agy-login-url` and background `login-url-watcher` to reassemble wrapped OAuth URLs from the `tmux` pane and deliver a clickable **"Antigravity login"** persistent notification in Home Assistant (clearing stale notifications on startup and after login).
- Added focus-preserving OSC 52 clipboard support (`registerOscHandler(52, ...)`) and explicit `Cmd+C` / `Ctrl+Shift+C` copy support with plain-HTTP fallback (`document.execCommand('copy')`).
- Moved Antigravity CLI auto-update checks to the background with closed `stdin` so add-on startup never blocks.

## 1.0.1

- Disabled `tmux` mouse-capture (`set -g mouse off`) so browser mouse selection works natively in `xterm.js`.
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
