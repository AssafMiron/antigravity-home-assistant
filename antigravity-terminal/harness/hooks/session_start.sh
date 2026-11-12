#!/usr/bin/env bash
# ==============================================================================
# session_start.sh — Antigravity SessionStart Hook
# Injects a concise snapshot of the live Home Assistant environment at startup.
# ==============================================================================

# Read hook input from stdin
cat >/dev/null || true

if [ -f /etc/profile.d/antigravity-ha.sh ]; then
    # shellcheck disable=SC1091
    source /etc/profile.d/antigravity-ha.sh 2>/dev/null || true
fi

HA_VERSION="unknown"
ENTITY_COUNT="unknown"

if [ -n "${SUPERVISOR_TOKEN}" ]; then
    HA_VERSION=$(curl -fsSL -m 3 -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/core/api/config 2>/dev/null | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
    ENTITY_COUNT=$(curl -fsSL -m 3 -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/core/api/states 2>/dev/null | jq 'length' 2>/dev/null || echo "unknown")
fi

MSG="Connected to live Home Assistant instance (Core version: ${HA_VERSION}, Total Entities: ${ENTITY_COUNT}, Config Dir: /config). Use 'ha-api' to query live entity states/services and 'ha-api reload <target>' after editing YAML."

jq -n --arg msg "${MSG}" '{
  injectSteps: [
    {
      systemMessage: {
        systemMessage: $msg
      }
    }
  ]
}'
