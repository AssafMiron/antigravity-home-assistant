---
name: ha-device-control
description: >-
  Inspect device status, toggle states, call entity services, or verify device health
  with minimal token consumption. Activate this skill whenever the user asks to toggle,
  turn on/off, query status, or check device attributes or batteries.
---

# Home Assistant Device Control & Status Skill

This skill provides ultra-fast, token-efficient procedures to inspect and control Home Assistant devices and entities without exploratory guessing or large context dumps.

## Golden Rules for Low Token Usage
1. **Never dump all states without filtering**: Use `ha-api states --compact <filter>` to get only `entity_id` and `state`.
2. **Execute direct toggle/service calls immediately**: Use `ha-api toggle` or `ha-api quick-call` instead of multi-step querying when the target is obvious.
3. **Use cached entity lookups**: The harness maintains a local TSV cache at `/tmp/ha_entity_cache.tsv` updated automatically.

---

## 1. Quick Device Actions (Single-Turn Execution)

### Toggle Any Device
Works for lights, switches, input_booleans, covers, locks, fans, media players:
```bash
ha-api toggle <entity_id>
# Example:
ha-api toggle light.kitchen_ceiling
ha-api toggle switch.coffee_maker
```

### Turn On / Turn Off with Parameters
For direct on/off with custom attributes (brightness, color temp, volume):
```bash
# Direct call without payload:
ha-api quick-call light.turn_on light.living_room

# Direct call with JSON payload:
ha-api call light.turn_on '{"entity_id": "light.living_room", "brightness_pct": 50}'
ha-api call climate.set_temperature '{"entity_id": "climate.thermostat", "temperature": 21.5}'
ha-api call cover.set_cover_position '{"entity_id": "cover.living_room_blind", "position": 40}'
```

---

## 2. Checking Device & Entity Status

### Check Specific Entity Status
```bash
# Quick compact check (returns entity_id + current state):
ha-api states --compact <entity_keyword>

# Full detailed attributes (only when attributes like brightness/battery/temperature are needed):
ha-api state <entity_id>
```

### Check Battery Levels Across All Devices
Quickly identify low-battery devices using the cached TSV or template without burning context:
```bash
ha-api template '{% set ns = namespace(low=[]) %}{% for s in states.sensor if "battery" in s.entity_id and s.state | int(100) < 20 %}{% set ns.low = ns.low + [s.entity_id ~ ": " ~ s.state ~ "%"] %}{% endfor %}{{ ns.low | join(", ") if ns.low else "All batteries OK (>20%)" }}'
```

### Check Unavailable / Malfunctioning Devices
Find entities that dropped offline:
```bash
awk -F'\t' '$2 == "unavailable" || $2 == "unknown" { print $1 " (" $2 ")" }' /tmp/ha_entity_cache.tsv 2>/dev/null || ha-api states --compact | grep -E "unavailable|unknown"
```

---

## 3. Querying Devices by Area or Domain
To find all entities in a room or domain without loading large JSON payloads:
```bash
# Domain search:
ha-api entities light
ha-api entities climate

# Search by area / friendly name keyword:
grep -i "living room" /tmp/ha_entity_cache.tsv
```

