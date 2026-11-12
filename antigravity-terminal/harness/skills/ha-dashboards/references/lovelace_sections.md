# Modern Home Assistant Lovelace `sections` & `tile` Reference

## Complete `sections` View Example (YAML)

```yaml
title: Home
views:
  - title: Overview
    path: overview
    icon: mdi:home-outline
    type: sections
    max_columns: 3
    badges:
      - type: entity
        entity: sensor.outdoor_temperature
        name: Outside
      - type: entity
        entity: binary_sensor.front_door
        name: Front Door
    sections:
      - type: grid
        cards:
          - type: heading
            heading: Living Room
            heading_style: title
            icon: mdi:sofa
          - type: tile
            entity: light.living_room_main
            name: Main Lights
            features:
              - type: light-brightness
          - type: tile
            entity: climate.living_room
            name: Thermostat
            features:
              - type: target-temperature
              - type: climate-hvac-modes
                hvac_modes:
                  - "off"
                  - heat
                  - cool
                  - heat_cool
            grid_options:
              columns: 12
              rows: 2

      - type: grid
        cards:
          - type: heading
            heading: Security & Access
            heading_style: title
            icon: mdi:shield-home
          - type: tile
            entity: lock.front_door
            name: Front Door Lock
          - type: tile
            entity: cover.garage_door
            name: Garage Door
            features:
              - type: cover-open-close
```

## Conditional Visibility Example
```yaml
- type: tile
  entity: binary_sensor.water_leak_kitchen
  name: Kitchen Water Leak!
  color: red
  visibility:
    - condition: state
      entity: binary_sensor.water_leak_kitchen
      state: "on"
```
