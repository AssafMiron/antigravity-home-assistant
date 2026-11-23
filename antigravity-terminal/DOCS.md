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
| `working_directory` | `/homeassistant` | Default directory where the terminal and Antigravity start. |
| `execution_mode` | `default` | Initial execution mode (`default`, `accept-edits`, `auto`, or `plan`). Press `Shift+Tab` inside `agy` to cycle modes anytime. |
| `enable_safety_hooks` | `true` | Enable Home Assistant lifecycle hooks (`SessionStart` context injection + `PreToolUse` YAML backup & registry protection). |
| `auto_backup_before_edit` | `true` | Automatically save timestamped backups of modified files under `/data/backups/YYYY-MM-DD/`. |
| `gemini_api_key` | `""` | Optional Google AI Studio API key (`GEMINI_API_KEY`). Leave empty for interactive OAuth login. |

## Built-in CLI Helpers (`ha-api` & `ha`)

Inside the terminal, both you and Antigravity can use `ha-api` to interact with the live Home Assistant Core API with minimal token consumption:

```bash
# Direct fast toggle (lights, switches, helpers, covers, locks)
ha-api toggle light.kitchen

# Direct quick service call
ha-api quick-call light.turn_on light.living_room

# Compact entity states (entity_id and state only)
ha-api states --compact light

# Inspect full JSON state & attributes of an entity
ha-api state climate.living_room

# Filtered error logs (default: last 30 lines)
ha-api logs --tail 30 --level error

# Test a Jinja2 template against live Home Assistant state
ha-api template '{{ states("sensor.outdoor_temperature") }}'

# Validate configuration and hot-reload without restarting HA
ha-api check
ha-api reload automations # or: scripts, scenes, helpers, all
```

## Built-in Skills & Token-Efficient Workflows

The harness includes 6 dedicated skills optimized for low-token, single-turn execution:
- **`ha-device-control`**: Fast toggles, service calls, battery level checks, unavailable device scans.
- **`ha-notifications`**: Telegram bot and Mobile App push alert setup and message dispatching.
- **`ha-helpers`**: Creating and configuring `input_boolean`, `input_select`, `input_number`, and `timer` helpers.
- **`ha-automations`**: Motion toggles, switch synchronization, and schedule-based automations with instant hot-reload.
- **`ha-dashboards`**: Lovelace Sections views, Tile cards, climate controls, and widget generators.
- **`ha-diagnostics`**: Integration-specific error grepping, system startup checks, and database health audits.

## Recommended Slash Commands & Shortcuts

Inside the `agy` CLI, use these shortcuts or prompt patterns for immediate, low-cost execution:
- `/toggle <entity_id>`: Instantly toggles an entity (`ha-api toggle <entity_id>`).
- `/status [filter]`: Displays a compact summary of matching entities without querying all states.
- `/debug [integration]`: Tails only the relevant error log entries for that integration.
- `/helper <type> <name>`: Scaffolds and reloads an input helper without restart.
- `/reload`: Hot-reloads automations, scripts, scenes, and helpers.

To reduce token costs by up to 70-80%, keep your active model set to **Gemini Flash** for routine daily commands, only escalating to larger models for intricate blueprints or complex Jinja2 architecture.

## Scrolling & Mobile Terminal Controls

The terminal retains up to **50,000 lines** of conversation and command history (both with `use_tmux: true` and `use_tmux: false`):

- **Desktop**: Use your mouse wheel or trackpad to scroll up through earlier prompts and full YAML diffs; scrolling back down to the bottom automatically exits scroll mode (`SCROLL` badge in the status bar disappears). Hold `Option` (macOS) or `Shift` (Windows/Linux) while dragging to select text natively, or drag normally to copy via OSC 52.
- **Mobile Touch & Zoom**: Swipe up/down with one finger to scroll smoothly (swiping down to read older output automatically hides the on-screen keyboard so more lines fit on screen). Mobile devices default to a compact `11px` font size and remember your zoom preference per device.
- **Floating Controls (`↕`)**: Use the collapsible top-right toolbar for **Page Up (`▲`)**, **Page Down (`▼`)**, **Jump to Bottom (`⤓`)**, **Zoom (`A−`/`A+`)**, **`Ctrl+O`** (expand/collapse tool and diff output inside `agy`), **`⇧Tab`**, **`Esc`**, arrow/Enter keys, and keyboard toggle (`⌨`).

## Restoring Automatic Backups

Whenever Antigravity edits an existing file in `/homeassistant`, a timestamped backup is automatically saved to `/data/backups/<YYYY-MM-DD>/` inside the add-on container before the edit is applied.
