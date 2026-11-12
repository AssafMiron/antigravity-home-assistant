---
name: ha-automations
description: >-
  Design, write, refactor, and debug Home Assistant automations, scripts, scenes,
  and blueprints. Activate this skill whenever the user asks to create or modify an
  automation, trigger, schedule, notification, script, or smart-home behavior.
---

# Home Assistant Automations & Scripts Skill

Follow this workflow whenever creating, editing, or troubleshooting Home Assistant automations or scripts.

## Step 1: Discover Live Entities & Services
Before writing any YAML, discover the exact entities and services in the user's setup:
1. Search relevant entities:
   ```bash
   ha-api states <keyword>
   ```
2. Inspect full attributes of target entities (e.g. supported color modes, climate presets, sensor device_class):
   ```bash
   ha-api state <entity_id>
   ```
3. Verify service parameters if needed:
   ```bash
   ha-api services <domain>
   ```

## Step 2: Check Existing Automation Structure
1. Inspect `/config/configuration.yaml` to see how `automation:` and `script:` are included (e.g. `automation: !include automations.yaml` vs split directories/packages).
2. Read existing entries in `/config/automations.yaml` (or the relevant package file) to avoid duplicate `id` or `alias` values and to see the user's conventions.

## Step 3: Author Using Modern Home Assistant Syntax
Read [references/automation_patterns.md](references/automation_patterns.md) for advanced patterns (trigger IDs, `choose`, `wait_for_trigger`, timers, and blueprints).

### Modern Automation Template (2024.10+ / 2025 / 2026+)
```yaml
- id: "unique_snake_case_id_or_timestamp"
  alias: "Clear Human-Readable Name"
  description: "Explains what this automation does and why"
  mode: single # single | restart | queued | parallel
  triggers:
    - trigger: state
      entity_id: binary_sensor.hallway_motion
      from: "off"
      to: "on"
      id: "motion_detected"
    - trigger: state
      entity_id: binary_sensor.hallway_motion
      from: "on"
      to: "off"
      for:
        minutes: 5
      id: "motion_cleared"
  conditions: []
  actions:
    - choose:
        - conditions:
            - condition: trigger
              id: "motion_detected"
            - condition: numeric_state
              entity_id: sensor.hallway_illuminance
              below: 50
          sequence:
            - action: light.turn_on
              target:
                entity_id: light.hallway
              data:
                brightness_pct: 80
        - conditions:
            - condition: trigger
              id: "motion_cleared"
          sequence:
            - action: light.turn_off
              target:
                entity_id: light.hallway
```

### Best Practices Checklist
- **Prefer Entity IDs over Device IDs**: Use `state` or `numeric_state` triggers with `entity_id` rather than opaque `device_id` triggers wherever possible, so automations survive device replacement.
- **Consolidate Related Turn-On / Turn-Off Automations**: Use `id:` on each trigger and a `choose:` block in `actions:` so a single automation manages both activation and deactivation cleanly.
- **Choose the Right `mode`**:
  - Motion-activated lights that reset a timeout: `mode: restart` (if using `wait_for_trigger` or `delay`), or `mode: single` with separate `on`/`off` triggers.
  - Notification or alert queues: `mode: queued` or `mode: parallel`.
- **Survive Home Assistant Restarts**: Avoid long `delay:` steps (> 15 minutes). Instead, use `timer` helpers, `for:` durations on state triggers, or `input_datetime` triggers.

## Step 4: Validate & Hot-Reload
1. Check configuration validity:
   ```bash
   ha-api check
   ```
2. Hot-reload automations or scripts immediately so changes take effect without restarting Home Assistant:
   ```bash
   ha-api reload automations
   ```
3. Check `/config/home-assistant.log` or `ha-api error-log` to confirm zero warnings or errors from the reload.
