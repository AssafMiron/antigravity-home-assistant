---
name: ha-helpers
description: >-
  Create, configure, and manage Home Assistant Helpers (input_boolean toggles, input_number sliders,
  input_select dropdowns, timers, counters, template sensors). Activate this skill when the user
  wants to create a virtual toggle, helper switch, mode selector, or timer.
---

# Home Assistant Helpers Skill

This skill provides streamlined recipes for creating and managing Home Assistant Helpers (both via UI/Storage registries and YAML definitions) with minimal token usage.

## 1. Quick Recipes by Helper Type

### Toggle Helper (`input_boolean`)
Used for virtual switches, automation overrides, guest mode, holiday mode:
```yaml
# In /homeassistant/configuration.yaml or packages:
input_boolean:
  guest_mode:
    name: "Guest Mode"
    icon: mdi:account-multiple
  vacation_mode:
    name: "Vacation Mode"
    icon: mdi:airplane
```

### Dropdown Helper (`input_select`)
Used for house modes or state selectors:
```yaml
input_select:
  house_mode:
    name: "House Mode"
    options:
      - Home
      - Away
      - Night
      - Movie
    initial: Home
    icon: mdi:home-variant
```

### Slider / Number Helper (`input_number`)
Used for thermostat limits, duration settings, volume thresholds:
```yaml
input_number:
  target_room_temp:
    name: "Target Room Temperature"
    min: 16
    max: 28
    step: 0.5
    unit_of_measurement: "°C"
    icon: mdi:thermometer
```

### Timer Helper (`timer`)
Used for countdowns, bathroom fans, irrigation timers:
```yaml
timer:
  bathroom_fan_timer:
    name: "Bathroom Fan Timer"
    duration: "00:15:00"
    icon: mdi:timer-outline
```

---

## 2. Immediate Reload After Editing Helpers
Never restart Home Assistant when adding or updating YAML helpers!
Use the instant helper reload endpoint:
```bash
ha-api reload helpers
```

---

## 3. Controlling Helpers via CLI
To test or change helper values instantly:
```bash
# Toggle input_boolean:
ha-api toggle input_boolean.guest_mode

# Select input_select option:
ha-api call input_select.select_option '{"entity_id": "input_select.house_mode", "option": "Movie"}'

# Set input_number value:
ha-api call input_number.set_value '{"entity_id": "input_number.target_room_temp", "value": 22}'

# Start timer:
ha-api call timer.start '{"entity_id": "timer.bathroom_fan_timer"}'
```

