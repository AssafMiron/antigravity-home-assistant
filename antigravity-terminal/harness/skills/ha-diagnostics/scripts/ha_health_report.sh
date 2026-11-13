#!/usr/bin/env bash
# ==============================================================================
# ha_health_report.sh — Quick diagnostic summary of the Home Assistant instance
# ==============================================================================
set -e

echo "=================================================================="
echo "  Home Assistant Health & Diagnostics Report"
echo "=================================================================="

echo ""
echo "--- [1] Configuration Validation ---"
ha-api check 2>/dev/null || ha core check 2>/dev/null || echo "Could not run config check."

echo ""
echo "--- [2] Entity Summary ---"
TOTAL_ENTITIES=$(ha-api entities 2>/dev/null | wc -l | tr -d ' ')
UNAVAIL_COUNT=$(ha-api states 2>/dev/null | awk '$2 == "unavailable"' | wc -l | tr -d ' ')
UNKNOWN_COUNT=$(ha-api states 2>/dev/null | awk '$2 == "unknown"' | wc -l | tr -d ' ')
echo "Total Entities:       ${TOTAL_ENTITIES}"
echo "Unavailable Entities: ${UNAVAIL_COUNT}"
echo "Unknown Entities:     ${UNKNOWN_COUNT}"

echo ""
echo "--- [3] Storage & Database Usage ---"
HA_DIR="/homeassistant"
[ ! -d "${HA_DIR}" ] && [ -d "/config" ] && HA_DIR="/config"
df -h "${HA_DIR}" 2>/dev/null || true
ls -lh "${HA_DIR}"/home-assistant_v2.db "${HA_DIR}"/home-assistant.log 2>/dev/null || true

echo ""
echo "--- [4] Recent Errors in home-assistant.log (Last 20) ---"
if [ -f "${HA_DIR}"/home-assistant.log ]; then
    grep -E "ERROR|CRITICAL" "${HA_DIR}"/home-assistant.log | tail -n 20 || echo "No recent ERROR lines found."
else
    ha-api error-log 2>/dev/null | grep -E "ERROR|CRITICAL" | tail -n 20 || echo "No recent ERROR lines found."
fi
echo "=================================================================="
