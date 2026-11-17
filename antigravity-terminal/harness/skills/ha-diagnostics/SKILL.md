---
name: ha-diagnostics
description: >-
  Diagnose Home Assistant errors, unavailable entities, broken automations, database
  bloat, integration issues, and configuration validation failures. Activate this skill when
  the user asks to fix an error, debug an integration, check logs, or audit their setup.
---

# Home Assistant Diagnostics & Troubleshooting Skill

This skill provides ultra-targeted diagnostics to identify and resolve Home Assistant issues with minimum log and token dumping.

## Golden Rules for Efficient Diagnostics
1. **Never fetch the entire error log raw**: Use `ha-api logs --tail 30 --level error` or grep for specific integrations.
2. **Target specific devices/integrations**: Filter directly rather than broad context scans.

---

## 1. Targeted Error Debugging by Integration or Device

### A. Debug an Error of a Specific Integration
To debug an issue with an integration (e.g. `zha`, `zigbee2mqtt`, `tuya`, `esphome`, `mqtt`, `telegram`):
```bash
# Filter recent logs specifically for that integration name:
ha-api logs --tail 40 | grep -i "<integration_name>"

# Or search live core log:
grep -i "<integration_name>" /homeassistant/home-assistant.log | tail -n 35
```

### B. Debug General Home Assistant Startup or System Errors
```bash
# Fetch only the last 30 error/warning messages:
ha-api logs --tail 30 --level error

# Validate YAML syntax and configuration:
ha-api check
```

---

## 2. Diagnosing Device & Entity Issues

### Find Offline / Unavailable Entities
```bash
awk -F'\t' '$2 == "unavailable" || $2 == "unknown" { print $1 " -> " $2 " (" $3 ")" }' /tmp/ha_entity_cache.tsv 2>/dev/null || ha-api states --compact | grep -E "unavailable|unknown"
```

### Check If an Entity is Referenced in Broken Automations/Scripts
```bash
rg "<entity_id>" /homeassistant/automations.yaml /homeassistant/scripts.yaml /homeassistant/configuration.yaml
```

---

## 3. Database & Performance Issues
If system is sluggish or disk space is running out:
```bash
# Check database file size:
ls -lh /homeassistant/home-assistant_v2.db*

# Find top 10 most frequent state changers:
sqlite3 -readonly /homeassistant/home-assistant_v2.db "SELECT sm.entity_id, COUNT(*) as cnt FROM states s JOIN states_meta sm ON s.metadata_id = sm.metadata_id GROUP BY s.metadata_id ORDER BY cnt DESC LIMIT 10;" 2>/dev/null || echo "SQLite check completed."
```
