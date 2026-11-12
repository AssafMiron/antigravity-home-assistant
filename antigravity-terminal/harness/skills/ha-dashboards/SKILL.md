---
name: ha-dashboards
description: >-
  Create, organize, and customize Home Assistant Lovelace dashboards, Sections views,
  Tile cards, badges, and custom HACS frontend cards. Activate this skill when the user
  asks to build, redesign, or fix a Home Assistant dashboard or UI view.
---

# Home Assistant Lovelace Dashboards Skill

## Step 1: Identify Dashboard Mode (YAML vs Storage)
Before creating or modifying a dashboard, determine how the user's dashboards are managed:
1. Check `/config/configuration.yaml` for a `lovelace:` block:
   - `mode: yaml` or custom YAML dashboards defined under `dashboards:`.
2. Run `ha-api dashboards` or inspect:
   - YAML dashboards: `/config/ui-lovelace.yaml` or `/config/dashboards/*.yaml`
   - UI-Managed (Storage) dashboards: `/config/.storage/lovelace` and `/config/.storage/lovelace.<dashboard_key>`
   - Dashboard registry: `/config/.storage/lovelace_dashboards`
3. Check installed custom cards (HACS / resources):
   - Inspect `/config/www/community/` and `/config/.storage/lovelace_resources` to see which custom cards (e.g. `mushroom`, `button-card`, `mini-graph-card`, `card-mod`, `apexcharts-card`) are actually installed before using any `custom:*` card type!

## Step 2: Gather Live Entities by Area or Domain
Never invent entity IDs for dashboard cards. Query live entities first:
```bash
ha-api states
```
Group entities logically by room/area (`Living Room`, `Kitchen`, `Bedroom`) or function (`Security`, `Climate`, `Energy`, `Network`).

## Step 3: Design Modern Lovelace Views (`sections` & `tile` Cards)
Modern Home Assistant (2024.3+ / 2025 / 2026+) uses the **Sections (`type: sections`)** view layout and **Tile (`type: tile`)** cards as the primary standard.
Read [references/lovelace_sections.md](references/lovelace_sections.md) for complete examples of Sections views, Grid options, Tile features, and conditional visibility.

### Key Dashboard Design Principles
1. **Prefer `type: sections` Views**:
   - Sections views provide responsive multi-column grids (`max_columns: 3` or `4`) with clean section headers and drag-and-drop grid sizing.
2. **Prefer `type: tile` Cards**:
   - Tile cards support built-in interactive `features:` (brightness sliders, climate HVAC mode selectors, cover open/close buttons, media playback controls) without requiring third-party plugins.
3. **Top-of-View Badges**:
   - Use view `badges:` at the top of the view for quick at-a-glance status indicators (temperature, humidity, people home, doors/windows open, security alarm state).
4. **Dynamic Visibility (`visibility:`)**:
   - Use card or section `visibility:` conditions to surface alerts (e.g. only show "Open Windows" or "Low Batteries" when active).

## Step 4: Safe Application of Dashboard Changes
- **For YAML Dashboards**:
  - Edit or create the `.yaml` file (e.g., `/config/dashboards/overview.yaml`) and register it under `lovelace: -> dashboards:` in `configuration.yaml` if new.
- **For Storage Dashboards (`.storage/lovelace*`)**:
  - Always back up the `.storage/lovelace*` file to `/data/backups/` before modifying it.
  - Validate that the resulting file is strictly valid JSON using `jq empty <file>`.
