#!/usr/bin/env bash
# ==============================================================================
# pre_edit_backup.sh — Antigravity PreToolUse Hook
# 1. Protects sensitive Home Assistant core registry files from accidental edits
# 2. Creates a timestamped backup in /data/backups/ before modifying existing files
# ==============================================================================

PAYLOAD=$(cat)

TARGET_PATH=$(echo "${PAYLOAD}" | jq -r '.toolCall.args.Path // .toolCall.args.TargetFile // empty' 2>/dev/null || true)

if [ -z "${TARGET_PATH}" ]; then
    echo '{"decision": "allow"}'
    exit 0
fi

# Prompt user confirmation if editing secrets.yaml or core .storage registries
case "${TARGET_PATH}" in
    */.storage/core.entity_registry|*/.storage/core.device_registry|*/.storage/core.config_entries)
        jq -n --arg reason "Modifying internal Home Assistant registry (${TARGET_PATH}) while Core is running can corrupt state. Please confirm." \
            '{decision: "force_ask", reason: $reason}'
        exit 0
        ;;
    */secrets.yaml)
        jq -n --arg reason "Confirm before modifying /config/secrets.yaml." \
            '{decision: "ask", reason: $reason}'
        exit 0
        ;;
esac

# Create automatic timestamped backup if file exists and auto_backup is enabled
if [ "${HA_AUTO_BACKUP:-true}" = "true" ] && [ -f "${TARGET_PATH}" ]; then
    BACKUP_ROOT="${HA_BACKUP_ROOT:-/data/backups}"
    BACKUP_DIR="${BACKUP_ROOT}/$(date +%Y-%m-%d)"
    mkdir -p "${BACKUP_DIR}" 2>/dev/null || true
    SAFE_NAME=$(echo "${TARGET_PATH#/}" | tr '/' '_')
    TIMESTAMP=$(date +%H%M%S)
    cp -p "${TARGET_PATH}" "${BACKUP_DIR}/${TIMESTAMP}_${SAFE_NAME}.bak" 2>/dev/null || true
fi

echo '{"decision": "allow"}'
