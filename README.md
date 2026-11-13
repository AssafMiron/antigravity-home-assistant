# <img src="antigravity-terminal/icon.png" width="36" height="36" align="top" alt="Antigravity Icon" /> Antigravity for Home Assistant (`antigravity-home-assistant`)

[![Home Assistant Add-on](https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5?logo=home-assistant)](https://github.com/assafmiron/antigravity-home-assistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Bring **Google Antigravity CLI (`agy`)** directly into your Home Assistant sidebar!

Inspired by [`heytcass/home-assistant-addons`](https://github.com/heytcass/home-assistant-addons) for Claude, this repository provides the **Antigravity Terminal** add-on for Home Assistant, equipped with a built-in **Home Assistant Harness** (Rules, Skills, Lifecycle Safety Hooks, and Live HA API tools) so Antigravity natively understands your smart home, entities, automations, and Lovelace dashboards.

---

## ✨ Features

- **🖥️ Embedded Web Terminal via Ingress**: Open Antigravity directly from your Home Assistant sidebar (`ttyd` + `tmux` persistent sessions that survive browser tab refreshes).
- **🔑 Connect Your Google AI Plan**: Authenticate interactively via Google OAuth right inside the terminal (or optionally pass a `GEMINI_API_KEY` in the add-on settings).
- **🧠 Built-in Home Assistant Harness (`~/.gemini/config/`)**:
  - **Clean `/config` Workspace**: The harness lives inside `~/.gemini/config/` (persisted in `/data`), keeping your `/config` directory clean while still allowing optional custom overrides in `/config/.agents/`.
  - **HA Domain Rules (`GEMINI.md` & `rules/`)**: Enforces modern Home Assistant YAML syntax (`triggers:`, `actions:`, safe Jinja2 templating, `!include` awareness, and `.storage` protection).
  - **Specialized HA Skills (`skills/`)**:
    - `ha-automations`: End-to-end workflow for discovering live entities, writing modern multi-path automations (`choose`, trigger IDs, blueprints), validating, and hot-reloading.
    - `ha-dashboards`: Builds modern Lovelace `sections` views and `tile` cards tailored to your actual rooms and installed HACS resources.
    - `ha-diagnostics`: Runs health audits, identifies `unavailable`/`unknown` entities, inspects error logs, and checks SQLite recorder database bloat.
  - **Safety & Backup Hooks (`hooks.json`)**:
    - `SessionStart`: Automatically injects your live Home Assistant Core version and total entity count into the session context.
    - `PreToolUse`: Automatically backs up any existing YAML file to `/data/backups/<YYYY-MM-DD>/` before Antigravity modifies it, and prompts before touching `secrets.yaml` or core `.storage` registries.
- **⚡ Pre-Authenticated `ha` & `ha-api` CLI Tools**:
  - Includes the official Home Assistant `ha` Supervisor CLI and a fast `ha-api` REST helper pre-wired with `SUPERVISOR_TOKEN` to query live entity states, render Jinja2 templates against live data, validate configs, and hot-reload automations without restarting Home Assistant.

---

## 🚀 Installation

1. In Home Assistant, navigate to **Settings → Apps** and click **Install App**.
2. Click the **⋮ (three dots)** menu in the top-right corner and select **Repositories**.
3. Paste the following repository URL and click **Add**:
   ```text
   https://github.com/assafmiron/antigravity-home-assistant
   ```
4. Find **Antigravity Terminal** in the store and click **Install**.
5. Enable **Show in sidebar**, click **Start**, and open **Antigravity** from your sidebar!

---

## 🛠️ Example Prompts to Try in Antigravity

Once you open the **Antigravity** panel in Home Assistant and sign in:

- *"Check all my entities in the living room and create an automation that turns on the living room lights at 70% brightness when motion is detected after sunset, and turns them off after 10 minutes of no motion."*
- *"Build a new modern Sections dashboard view for my Climate, Security, and Energy entities using Tile cards."*
- *"Run a health check on my Home Assistant setup, find any automations referencing unavailable entities, and help me fix them."*
- *"Audit my `home-assistant_v2.db` to see which sensors are writing the most state changes."*

---

## 📂 Repository Structure

```text
antigravity-home-assistant/
├── repository.yaml                         # Home Assistant Add-on repository metadata
├── README.md
└── antigravity-terminal/                   # Antigravity Terminal Add-on
    ├── config.yaml                         # Add-on manifest, Ingress, permissions & schema
    ├── icon.png                            # Add-on store & dashboard icon
    ├── logo.png                            # Add-on detail page logo
    ├── build.yaml                          # Multi-arch base image definitions (amd64, aarch64)
    ├── Dockerfile                          # Container build with ttyd, tmux, ha CLI, yq, and agy
    ├── DOCS.md                             # In-app Add-on documentation
    ├── CHANGELOG.md                        # Release history
    ├── translations/
    │   └── en.yaml                         # UI labels for Add-on configuration tab
    ├── harness/                            # Home Assistant Antigravity Harness (~/.gemini/config)
    │   ├── GEMINI.md                       # Core Home Assistant system instructions
    │   ├── hooks.json                      # Lifecycle safety & context hooks
    │   ├── rules/
    │   │   └── ha-yaml-standards.md        # YAML & Jinja2 templating standards
    │   ├── skills/
    │   │   ├── ha-automations/             # Automations, scripts & blueprints skill
    │   │   ├── ha-dashboards/              # Lovelace Sections & Tile dashboards skill
    │   │   └── ha-diagnostics/             # Health reports, logs & DB diagnostics skill
    │   └── hooks/
    │       ├── session_start.sh            # Injects live HA version & entity count
    │       ├── pre_edit_backup.sh          # Auto-backups YAML files to /data/backups
    │       └── post_edit_check.sh          # Post-edit verification hook
    └── rootfs/
        ├── etc/cont-init.d/
        │   └── 00-setup-antigravity.sh     # Persistent storage & harness installer
        ├── etc/services.d/ttyd/
        │   ├── run                         # ttyd Ingress service runner
        │   └── finish
        ├── usr/local/bin/
        │   ├── agy-entrypoint              # Terminal welcome banner, tmux & agy launcher
        │   ├── agy-login-url               # Extracts & unwraps OAuth login URL from tmux
        │   ├── ha-api                      # Live Home Assistant REST API CLI helper
        │   ├── login-url-watcher           # Delivers OAuth login URL as HA notification
        │   └── prepare-ttyd-ui             # Injects multi-line URL & OSC 52 helper into ttyd UI
        └── usr/share/ttyd/
            └── agy-ttyd-helper.js          # Multi-line OAuth link & OSC 52 clipboard helper
```

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
