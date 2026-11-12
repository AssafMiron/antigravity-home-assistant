---
name: ha-diagnostics
description: >-
  Diagnose Home Assistant errors, unavailable entities, broken automations, database
  bloat, slow startups, and configuration validation failures. Activate this skill when
  the user asks to fix an issue, check logs, or audit their Home Assistant setup.
---

# Home Assistant Diagnostics & Troubleshooting Skill

## Step 1: Run Health Summary Script
Run the bundled diagnostic script to get an instant overview of Home Assistant health, configuration status, unavailable entities, and recent error log entries:
```bash
/root/.gemini/config/skills/ha-diagnostics/scripts/ha_health_report.sh
```

## Step 2: Targeted Investigation

### A. Configuration & YAML Errors
1. Validate configuration with Home Assistant Core:
   ```bash
   ha-api check
   # or
   ha core check
   ```
2. Run `yamllint` on modified YAML files to catch indentation or duplicate key issues:
   ```bash
   yamllint /config/automations.yaml
   ```

### B. Unavailable / Unknown Entities
1. Find all entities currently in `unavailable` or `unknown` state:
   ```bash
   ha-api states | awk '$2 == "unavailable" || $2 == "unknown"'
   ```
2. Cross-reference those entity IDs against `/config/automations.yaml`, `/config/scripts.yaml`, and dashboard files using `rg`:
   ```bash
   rg "<entity_id>" /config/*.yaml /config/automations* /config/dashboards*
   ```

### C. Error Log & Integration Troubleshooting
1. Fetch the live error log:
   ```bash
   ha-api error-log | tail -n 100
   ```
2. Filter for `ERROR` or `WARNING` lines in `/config/home-assistant.log`:
   ```bash
   rg -i "error|warning|exception" /config/home-assistant.log | tail -n 80
   ```

### D. Recorder Database Size & High-Frequency Entities
If the user reports slow history/logbook loading or disk space issues:
1. Check `/config/home-assistant_v2.db` size:
   ```bash
   ls -lh /config/home-assistant_v2.db*
   ```
2. Query top noisy entities in SQLite (read-only):
   ```bash
   sqlite3 -readonly /config/home-assistant_v2.db "SELECT sm.entity_id, COUNT(*) as cnt FROM states s JOIN states_meta sm ON s.metadata_id = sm.metadata_id GROUP BY s.metadata_id ORDER BY cnt DESC LIMIT 15;"
   ```
