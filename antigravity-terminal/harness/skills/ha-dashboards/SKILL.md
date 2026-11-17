---
name: ha-dashboards
description: >-
  Create, organize, and customize Home Assistant Lovelace dashboards, Sections views,
  dashboard pages, Tile cards, and widgets. Activate this skill when the user
  asks to build, create, or update a dashboard page, card, or widget.
---

# Home Assistant Lovelace Dashboards Skill

This skill provides direct recipes for creating and modifying Home Assistant dashboards, pages, and widgets with minimal token consumption.

## Step 1: Identify Dashboard Target (YAML vs Storage)
1. Check `/homeassistant/configuration.yaml` for `lovelace: mode: yaml`.
2. Inspect available dashboards:
   ```bash
   ha-api dashboards
   ```
   - **YAML dashboards**: `/homeassistant/ui-lovelace.yaml` or `/homeassistant/dashboards/*.yaml`
   - **Storage dashboards (Default UI)**: `/homeassistant/.storage/lovelace` or `/homeassistant/.storage/lovelace.<id>`

## Step 2: Instant Card & Widget Recipes

### 1. Tile Widget / Card (Modern Standard)
```yaml
type: tile
entity: light.living_room
name: "Living Room Light"
icon: mdi:lightbulb
color: amber
features:
  - type: light-brightness
```

### 2. Thermostat / Climate Widget
```yaml
type: tile
entity: climate.thermostat
name: "HVAC"
features:
  - type: climate-hvac-modes
    hvac_modes:
      - heat
      - cool
      - "off"
      - auto
  - type: target-temperature
```

### 3. Quick Toggle / Action Button Card
```yaml
type: button
name: "Toggle All Lights"
icon: mdi:power
tap_action:
  action: call-service
  service: light.toggle
  target:
    entity_id: all
```

### 4. Sensor Gauge Widget
```yaml
type: gauge
entity: sensor.outdoor_temperature
name: "Outdoor Temp"
min: -10
max: 45
needle: true
severity:
  green: 18
  yellow: 26
  red: 32
```

---

## Step 3: Creating a New Dashboard Page (Sections View)
A complete modern sections view for a room or functional page:

```yaml
title: "Living Room"
path: "living-room"
icon: mdi:sofa
type: sections
max_columns: 3
badges:
  - type: entity
    entity: sensor.living_room_temperature
  - type: entity
    entity: sensor.living_room_humidity
sections:
  - title: "Lighting"
    cards:
      - type: tile
        entity: light.living_room_main
        features:
          - type: light-brightness
      - type: tile
        entity: light.living_room_lamp
  - title: "Climate & Air"
    cards:
      - type: tile
        entity: climate.living_room_ac
        features:
          - type: climate-hvac-modes
  - title: "Media & Power"
    cards:
      - type: media-control
        entity: media_player.living_room_tv
```

## Step 4: Storage Dashboard Updates
When editing `.storage/lovelace*`:
1. Create a quick backup:
   ```bash
   cp /homeassistant/.storage/lovelace /data/backups/lovelace.$(date +%s).bak 2>/dev/null || true
   ```
2. Verify JSON integrity after edits:
   ```bash
   jq empty /homeassistant/.storage/lovelace
   ```
3. Reload Lovelace frontend:
   ```bash
   ha-api reload themes
   ```
