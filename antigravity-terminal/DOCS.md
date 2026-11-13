# Home Assistant Add-on: Antigravity Terminal

## Overview

**Antigravity Terminal** embeds Google's **Antigravity CLI (`agy`)** inside Home Assistant via Ingress, pre-configured with a specialized **Home Assistant Harness** (`~/.gemini/config/`) so Antigravity understands your entities, automations, scripts, Lovelace dashboards, and logs out of the box.

## First-Time Setup & Authentication

1. Start the add-on and click **Open Web UI** (or click **Antigravity** in your Home Assistant sidebar).
2. When `agy` launches for the first time, follow the interactive prompt in the terminal to sign in with your **Google account / Google AI plan** via OAuth:
   - Click directly on the OAuth URL displayed in the terminal (any wrapped line of the URL will open the complete, unbroken sign-in link), or click the link in the **"Antigravity login"** Home Assistant persistent notification (bell icon in your sidebar).
   - After signing in, paste the authorization code back into the terminal prompt.
   - *Fallback*: You can also run `agy-login-url` in a second `tmux` window to write the full unwrapped URL to `/config/agy-login-url.txt`.
   - *Alternative*: If you prefer to use a Google AI Studio API Key instead of interactive OAuth, enter your key in the **Configuration** tab under `gemini_api_key` and restart the add-on.
3. Your login credentials and conversation history are persisted across add-on restarts and updates in `/data/.gemini`.

## Configuration Options

| Option | Default | Description |
| :--- | :--- | :--- |
| `auto_launch_agy` | `true` | Automatically start the `agy` CLI when opening the web terminal. |
| `agy_auto_update` | `true` | Automatically check for and install the latest `agy` CLI on add-on startup. |
| `use_tmux` | `true` | Keep your terminal session persistent in `tmux` so closing or refreshing the browser tab does not interrupt Antigravity. |
| `working_directory` | `/config` | Default directory where the terminal and Antigravity start. |
| `execution_mode` | `default` | Initial execution mode (`default`, `accept-edits`, `auto`, or `plan`). Press `Shift+Tab` inside `agy` to cycle modes anytime. |
| `enable_safety_hooks` | `true` | Enable Home Assistant lifecycle hooks (`SessionStart` context injection + `PreToolUse` YAML backup & registry protection). |
| `auto_backup_before_edit` | `true` | Automatically save timestamped backups of modified files under `/data/backups/YYYY-MM-DD/`. |
| `gemini_api_key` | `""` | Optional Google AI Studio API key (`GEMINI_API_KEY`). Leave empty for interactive OAuth login. |

## Built-in CLI Helpers (`ha-api` & `ha`)

Inside the terminal, both you and Antigravity can use `ha-api` to interact with the live Home Assistant Core API:

```bash
# List all entities or filter by domain/keyword
ha-api entities light
ha-api states kitchen

# Inspect full JSON state & attributes of an entity
ha-api state climate.living_room

# Test a Jinja2 template against live Home Assistant state
ha-api template '{{ states("sensor.outdoor_temperature") }}'

# Validate configuration and hot-reload automations without restarting HA
ha-api check
ha-api reload automations
```

## Restoring Automatic Backups

Whenever Antigravity edits an existing file in `/config`, a timestamped backup is automatically saved to `/data/backups/<YYYY-MM-DD>/` inside the add-on container before the edit is applied.
