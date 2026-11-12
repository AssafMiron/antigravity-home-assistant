# Advanced Home Assistant Automation Patterns

## 1. Trigger IDs + `choose` (Multi-Path Automations)
Use `id:` on triggers paired with `condition: trigger` inside `choose:` to combine related triggers into one cohesive automation:

```yaml
- id: "climate_window_guard"
  alias: "Climate - Pause HVAC When Window Opens"
  description: "Turns off HVAC when window opens for 1 min and restores when closed"
  mode: restart
  triggers:
    - trigger: state
      entity_id: binary_sensor.bedroom_window
      to: "on"
      for: "00:01:00"
      id: "window_opened"
    - trigger: state
      entity_id: binary_sensor.bedroom_window
      to: "off"
      for: "00:00:30"
      id: "window_closed"
  actions:
    - choose:
        - conditions:
            - condition: trigger
              id: "window_opened"
          sequence:
            - action: scene.create
              data:
                scene_id: bedroom_hvac_before_window
                snapshot_entities:
                  - climate.bedroom
            - action: climate.set_hvac_mode
              target:
                entity_id: climate.bedroom
              data:
                hvac_mode: "off"
        - conditions:
            - condition: trigger
              id: "window_closed"
          sequence:
            - action: scene.turn_on
              target:
                entity_id: scene.bedroom_hvac_before_window
```

## 2. Template Triggers & Conditions
Always test templates first via `ha-api template '...'`.

```yaml
triggers:
  - trigger: template
    value_template: >
      {{ states('sensor.washing_machine_power') | float(0) < 3
         and is_state('input_boolean.washer_running', 'on') }}
    for: "00:03:00"
```

## 3. Actionable Mobile App Notifications
```yaml
actions:
  - action: notify.mobile_app_phone
    data:
      title: "Garage Door Left Open"
      message: "The garage door has been open for 30 minutes."
      data:
        tag: "garage_open_alert"
        actions:
          - action: "CLOSE_GARAGE"
            title: "Close Garage"
```
