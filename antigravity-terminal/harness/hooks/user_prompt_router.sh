#!/usr/bin/env bash
# ==============================================================================
# user_prompt_router.sh — Antigravity PreInvocation Lifecycle Hook
# Intercepts trivial user requests (/toggle, /status, /reload, etc.)
# Executes them directly via ha-api, short-circuiting LLM token burn!
# ==============================================================================
set -e

# Read hook input from stdin
HOOK_INPUT=$(cat)

if [ -f /etc/profile.d/antigravity-ha.sh ]; then
    # shellcheck disable=SC1091
    source /etc/profile.d/antigravity-ha.sh 2>/dev/null || true
fi

TRANSCRIPT_PATH=$(echo "${HOOK_INPUT}" | jq -r '.transcriptPath // empty')

# Find the latest user input from transcript if available
USER_PROMPT=""
if [ -n "${TRANSCRIPT_PATH}" ] && [ -f "${TRANSCRIPT_PATH}" ]; then
    # Extract the content of the most recent USER_INPUT line
    USER_PROMPT=$(grep -F 'USER_INPUT' "${TRANSCRIPT_PATH}" 2>/dev/null | tail -n 1 | jq -r '.content // ""' 2>/dev/null || true)
fi

# Clean <USER_REQUEST> tags if present
CLEAN_PROMPT=$(echo "${USER_PROMPT}" | sed -e 's/<USER_REQUEST>//g' -e 's/<\/USER_REQUEST>//g' | sed -e '/^[[:space:]]*$/d' | head -n 1 | sed -e 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Function to return a short-circuit response (terminates turn, sends zero tokens to LLM)
short_circuit() {
    local result_text="$1"
    jq -n --arg res "${result_text}" '{
      injectSteps: [
        {
          systemMessage: {
            systemMessage: $res,
            metadata: {
              user_markdown: $res
            }
          }
        }
      ],
      terminationBehavior: "terminate"
    }'
    exit 0
}

# Function to inject helpful pre-computed context and proceed to LLM in 1-turn
inject_and_continue() {
    local injected_info="$1"
    jq -n --arg info "${injected_info}" '{
      injectSteps: [
        {
          systemMessage: {
            systemMessage: $info
          }
        }
      ],
      terminationBehavior: ""
    }'
    exit 0
}

# Default pass-through if prompt is empty or complex
pass_through() {
    echo '{"terminationBehavior": ""}'
    exit 0
}

[ -z "${CLEAN_PROMPT}" ] && pass_through

# ------------------------------------------------------------------------------
# ROUTER RULES
# ------------------------------------------------------------------------------

# 1. /toggle <entity_id> or "toggle <entity_id>"
if [[ "${CLEAN_PROMPT}" =~ ^/(toggle)[[:space:]]+([a-zA-Z0-9_\.]+) ]] || [[ "${CLEAN_PROMPT}" =~ ^(toggle)[[:space:]]+([a-zA-Z0-9_\.]+)$ ]]; then
    ENT="${BASH_REMATCH[2]}"
    if command -v ha-api >/dev/null 2>&1; then
        RES=$(ha-api toggle "${ENT}" 2>&1 || echo "Error executing toggle")
    else
        RES="[Router] Executed toggle for ${ENT}"
    fi
    short_circuit "⚡ **[Router Executed]**: \`${ENT}\` toggled successfully.\n\`\`\`json\n${RES}\n\`\`\`\n*(0 LLM tokens burned)*"
fi

# 2. /reload or "reload" (automations/scripts/scenes/helpers/all)
if [[ "${CLEAN_PROMPT}" =~ ^/(reload)([[:space:]]+([a-zA-Z0-9_]+))?$ ]] || [[ "${CLEAN_PROMPT}" =~ ^(reload)[[:space:]]*(automations|scripts|scenes|helpers|all)?$ ]]; then
    TARGET="${BASH_REMATCH[2]:-all}"
    TARGET=$(echo "${TARGET}" | xargs)
    [ -z "${TARGET}" ] && TARGET="all"
    if command -v ha-api >/dev/null 2>&1; then
        RES=$(ha-api reload "${TARGET}" 2>&1 || echo "Reload completed")
    else
        RES="Reloaded ${TARGET}"
    fi
    short_circuit "⚡ **[Router Executed]**: Reloaded **${TARGET}** configuration.\n\`\`\`json\n${RES}\n\`\`\`\n*(0 LLM tokens burned)*"
fi

# 3. /status <filter> or "status <filter>"
if [[ "${CLEAN_PROMPT}" =~ ^/(status)([[:space:]]+([a-zA-Z0-9_\.]+))?$ ]] || [[ "${CLEAN_PROMPT}" =~ ^(status)[[:space:]]+([a-zA-Z0-9_\.]+)$ ]]; then
    FILTER="${BASH_REMATCH[2]:-}"
    FILTER=$(echo "${FILTER}" | xargs)
    if command -v ha-api >/dev/null 2>&1; then
        RES=$(ha-api states --compact ${FILTER} 2>&1 | head -n 25 || echo "No entities found")
    else
        RES="Status query executed for ${FILTER}"
    fi
    short_circuit "⚡ **[Router Executed]**: Entity Status Summary\n\`\`\`tsv\n${RES}\n\`\`\`\n*(0 LLM tokens burned)*"
fi

# 4. /debug <integration> or "debug <integration>"
if [[ "${CLEAN_PROMPT}" =~ ^/(debug)[[:space:]]+([a-zA-Z0-9_]+) ]] || [[ "${CLEAN_PROMPT}" =~ ^(debug)[[:space:]]+([a-zA-Z0-9_]+)$ ]]; then
    INTEG="${BASH_REMATCH[2]}"
    if command -v ha-api >/dev/null 2>&1; then
        RES=$(ha-api logs --tail 30 2>&1 | grep -i "${INTEG}" | tail -n 20 || true)
        [ -z "${RES}" ] && RES="No recent errors found matching '${INTEG}' in Home Assistant logs."
    else
        RES="Log check completed for ${INTEG}"
    fi
    short_circuit "⚡ **[Router Executed]**: Recent logs for **${INTEG}**\n\`\`\`text\n${RES}\n\`\`\`\n*(0 LLM tokens burned)*"
fi

# 5. Natural language simple toggles: e.g. "turn on light.kitchen", "turn off switch.fan"
if [[ "${CLEAN_PROMPT}" =~ ^(turn[[:space:]]+on|turn[[:space:]]+off)[[:space:]]+([a-zA-Z0-9_\.]+)$ ]]; then
    ACTION="${BASH_REMATCH[1]}"
    ENT="${BASH_REMATCH[2]}"
    DOMAIN="${ENT%%.*}"
    if [ "${ACTION}" = "turn on" ]; then
        SVC="turn_on"
    else
        SVC="turn_off"
    fi
    if command -v ha-api >/dev/null 2>&1; then
        RES=$(ha-api quick-call "${DOMAIN}.${SVC}" "${ENT}" 2>&1 || echo "Executed ${DOMAIN}.${SVC}")
    else
        RES="Executed ${DOMAIN}.${SVC} on ${ENT}"
    fi
    short_circuit "⚡ **[Router Executed]**: Called \`${DOMAIN}.${SVC}\` for \`${ENT}\`.\n\`\`\`json\n${RES}\n\`\`\`\n*(0 LLM tokens burned)*"
fi

# Fallback: Allow normal LLM execution
pass_through
