#!/usr/bin/env bash
# ==============================================================================
# session_start.sh — Antigravity SessionStart Hook
# Injects a concise snapshot of the live Home Assistant environment at startup
# and warms up the entity index cache for ultra-fast, zero-token lookups.
# ==============================================================================

# Read hook input from stdin
cat >/dev/null || true

if [ -f /etc/profile.d/antigravity-ha.sh ]; then
    # shellcheck disable=SC1091
    source /etc/profile.d/antigravity-ha.sh 2>/dev/null || true
fi

HA_VERSION="unknown"
ENTITY_COUNT="unknown"
CACHE_FILE="${HA_CACHE_FILE:-/tmp/ha_entity_cache.tsv}"

if [ -n "${SUPERVISOR_TOKEN}" ]; then
    HA_VERSION=$(curl -fsSL -m 3 -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/core/api/config 2>/dev/null | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")
    
    # Warm up local entity cache in background or quick fetch
    RAW_STATES=$(curl -fsSL -m 4 -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/core/api/states 2>/dev/null || echo "[]")
    ENTITY_COUNT=$(echo "${RAW_STATES}" | jq 'length' 2>/dev/null || echo "unknown")
    
    if [ "${ENTITY_COUNT}" != "unknown" ] && [ "${ENTITY_COUNT}" -gt 0 ]; then
        echo "${RAW_STATES}" | jq -r '
            .[] | "\(.entity_id)\t\(.state)\t\(.attributes.friendly_name // "")"
        ' 2>/dev/null > "${CACHE_FILE}.tmp" && mv -f "${CACHE_FILE}.tmp" "${CACHE_FILE}" 2>/dev/null || true
        touch -t 200001010000 "${CACHE_FILE}" 2>/dev/null || true
    fi
fi

HA_CONF_DIR="/homeassistant"
[ ! -d "${HA_CONF_DIR}" ] && [ -d "/config" ] && HA_CONF_DIR="/config"

MSG="Connected to live Home Assistant instance (Core version: ${HA_VERSION}, Total Entities: ${ENTITY_COUNT}, Config Dir: ${HA_CONF_DIR}). Entity cache warmed in ${CACHE_FILE}. Note: 'ha-api' and 'ha' CLI commands require BypassSandbox: true for network access. To minimize tokens: use 'ha-api states --compact <filter>', 'ha-api toggle <entity_id>', 'ha-api quick-call <domain.svc> [entity_id]', and 'ha-api logs --tail 30 --level error'."

jq -n --arg msg "${MSG}" '{
  injectSteps: [
    {
      systemMessage: {
        systemMessage: $msg
      }
    }
  ]
}'
