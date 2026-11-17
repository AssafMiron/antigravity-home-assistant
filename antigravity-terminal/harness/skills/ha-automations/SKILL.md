---
name: ha-automations
description: >-
  Design, write, refactor, and debug Home Assistant automations, scripts, scenes,
  and blueprints. Activate this skill whenever the user asks to create or modify an
  automation, trigger, schedule, notification, script, or smart-home behavior.
---

# Home Assistant Automations & Scripts Skill

Follow this token-efficient workflow whenever creating, editing, or troubleshooting Home Assistant automations or scripts.

## Step 1: Discover Live Entities Quickly
Never dump full state objects. Run compact discovery:
```bash
# Fast compact entity search:
ha-api states --compact <keyword>

# Check cached entities in zero API calls:
awk -F'\t' -v k="<keyword>" '$1 ~ k || $3 ~ k' /tmp/ha_entity_cache.tsv
```

## Step 2: Check Existing Automation Structure
1. Inspect `/homeassistant/configuration.yaml` to see how `automation:` and `script:` are included (`!include automations.yaml` vs split directories/packages).
2. Avoid duplicate `id` or `alias` values in `/homeassistant/automations.yaml`.

## Step 3: Fast Pre-Packaged Automation Recipes

### Recipe 1: Motion-Activated Toggle / Light with Auto-Off
```yaml
- id: "motion_light_hallway"
  alias: "Hallway Light Motion Toggle"
  description: "Turn on hallway light with motion, turn off after 5 minutes clear"
  mode: restart
  triggers:
    - trigger: state
      entity_id: binary_sensor.hallway_motion
      from: "off"
      to: "on"
      id: "motion_on"
    - trigger: state
      entity_id: binary_sensor.hallway_motion
      from: "on"
      to: "off"
      for:
        minutes: 5
      id: "motion_off"
  conditions: []
  actions:
    - choose:
        - conditions:
            - condition: trigger
              id: "motion_on"
          actions:
            - action: light.turn_on
              target:
                entity_id: light.hallway
        - conditions:
            - condition: trigger
              id: "motion_off"
          actions:
            - action: light.turn_off
              target:
                entity_id: light.hallway
```

### Recipe 2: Sync Two Switches / Toggles (Master -> Follower)
```yaml
- id: "sync_switches_toggle"
  alias: "Sync Lamp Switch with Ceiling Light"
  description: "Keeps desk lamp in sync with main office light"
  mode: single
  triggers:
    - trigger: state
      entity_id: light.office_ceiling
  actions:
    - action: homeassistant.toggle
      target:
        entity_id: switch.desk_lamp
```

### Recipe 3: Schedule-Based Automation (Time & Sunset/Sunrise)
```yaml
- id: "evening_porch_lights"
  alias: "Porch Lights on at Sunset"
  description: "Turns on porch light at sunset and off at 23:00"
  mode: single
  triggers:
    - trigger: sun
      event: sunset
      offset: "-00:15:00"
      id: "sunset"
    - trigger: time
      at: "23:00:00"
      id: "night"
  actions:
    - choose:
        - conditions:
            - condition: trigger
              id: "sunset"
          actions:
            - action: light.turn_on
              target:
                entity_id: light.porch
        - conditions:
            - condition: trigger
              id: "night"
          actions:
            - action: light.turn_off
              target:
                entity_id: light.porch
```

## Step 4: Validate and Hot-Reload
Always validate and hot-reload immediately without restarting Core:
```bash
ha-api check
ha-api reload automations
```
