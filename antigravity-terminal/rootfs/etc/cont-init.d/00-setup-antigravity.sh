#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Add-on: Antigravity Terminal
# Configures persistent storage, installs/updates Antigravity CLI (`agy`),
# and links the Home Assistant harness into ~/.gemini/config/
# ==============================================================================

bashio::log.info "Initializing Antigravity Terminal for Home Assistant..."

# 1. Set up persistent directories on /data
mkdir -p /data/.gemini/config
mkdir -p /data/.gemini/antigravity-cli
mkdir -p /data/.local/bin
mkdir -p /data/backups
mkdir -p /root/.local

# Link /root/.gemini and /root/.local/bin to persistent /data storage
if [ ! -L /root/.gemini ]; then
    rm -rf /root/.gemini
    ln -s /data/.gemini /root/.gemini
fi

if [ ! -L /root/.local/bin ]; then
    if [ -d /root/.local/bin ]; then
        cp -rn /root/.local/bin/* /data/.local/bin/ 2>/dev/null || true
        rm -rf /root/.local/bin
    fi
    ln -s /data/.local/bin /root/.local/bin
fi

# 2. Install or update Antigravity CLI (`agy`) without blocking stdin or boot
install_agy_safely() {
    local installer
    installer=$(mktemp /tmp/agy-install.XXXXXX.sh)
    if curl -fsSL --connect-timeout 10 https://antigravity.google/cli/install.sh -o "${installer}" \
        && timeout 60 bash "${installer}" </dev/null >/dev/null 2>&1; then
        rm -f "${installer}"
        return 0
    fi
    rm -f "${installer}"
    return 1
}

AGY_AUTO_UPDATE=$(bashio::config 'agy_auto_update')
if [ ! -x "/root/.local/bin/agy" ] && ! command -v agy >/dev/null 2>&1; then
    bashio::log.info "Installing Google Antigravity CLI (agy)..."
    if install_agy_safely; then
        bashio::log.info "Antigravity CLI installed successfully."
    else
        bashio::log.warning "Could not download Antigravity CLI at startup. You can install it manually inside the terminal."
    fi
elif [ "${AGY_AUTO_UPDATE}" = "true" ]; then
    bashio::log.info "Checking for Antigravity CLI updates in background..."
    (install_agy_safely || true) </dev/null >/dev/null 2>&1 &
fi

# 3. Install the Home Assistant Harness into ~/.gemini/config/
# Using ~/.gemini/config keeps /config clean while allowing user overrides in /config/.agents/
bashio::log.info "Installing Home Assistant Harness into ~/.gemini/config/..."
mkdir -p /root/.gemini/config/rules
mkdir -p /root/.gemini/config/skills
mkdir -p /root/.gemini/config/hooks

cp -rf /opt/ha-agy-harness/GEMINI.md /root/.gemini/config/GEMINI.md
cp -rf /opt/ha-agy-harness/rules/* /root/.gemini/config/rules/
cp -rf /opt/ha-agy-harness/skills/* /root/.gemini/config/skills/
cp -rf /opt/ha-agy-harness/hooks/* /root/.gemini/config/hooks/
chmod +x /root/.gemini/config/hooks/*.sh

# Enable or disable safety hooks based on add-on configuration
ENABLE_HOOKS=$(bashio::config 'enable_safety_hooks')
if [ "${ENABLE_HOOKS}" = "true" ]; then
    cp -f /opt/ha-agy-harness/hooks.json /root/.gemini/config/hooks.json
    bashio::log.info "Home Assistant safety & validation hooks enabled."
else
    rm -f /root/.gemini/config/hooks.json
    bashio::log.info "Home Assistant safety hooks disabled by configuration."
fi

# 4. Configure environment variables for interactive shells and tmux
GEMINI_API_KEY_VAL=$(bashio::config 'gemini_api_key')
AUTO_BACKUP_VAL=$(bashio::config 'auto_backup_before_edit')
EXEC_MODE_VAL=$(bashio::config 'execution_mode')
WORK_DIR_VAL=$(bashio::config 'working_directory')
AUTO_LAUNCH_VAL=$(bashio::config 'auto_launch_agy')
USE_TMUX_VAL=$(bashio::config 'use_tmux')

# Ensure live Home Assistant config mount (/homeassistant) is used and symlink /config for compatibility
if [ -d "/homeassistant" ]; then
    if [ ! -e "/config" ]; then
        ln -s /homeassistant /config 2>/dev/null || true
    elif [ -d "/config" ] && [ ! -f "/config/configuration.yaml" ]; then
        rmdir /config 2>/dev/null && ln -s /homeassistant /config 2>/dev/null || true
    fi
    if [ "${WORK_DIR_VAL}" = "/config" ] && [ ! -f "/config/configuration.yaml" ]; then
        WORK_DIR_VAL="/homeassistant"
    fi
fi

cat <<EOF > /etc/profile.d/antigravity-ha.sh
export PATH="/root/.local/bin:/usr/local/bin:\${PATH}"
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"
export HASSIO_TOKEN="${SUPERVISOR_TOKEN:-}"
export HA_AUTO_BACKUP="${AUTO_BACKUP_VAL}"
export AGY_DEFAULT_MODE="${EXEC_MODE_VAL}"
export AGY_WORK_DIR="${WORK_DIR_VAL}"
export AGY_AUTO_LAUNCH="${AUTO_LAUNCH_VAL}"
export AGY_USE_TMUX="${USE_TMUX_VAL}"
EOF

if [ -n "${GEMINI_API_KEY_VAL}" ] && [ "${GEMINI_API_KEY_VAL}" != "null" ]; then
    echo "export GEMINI_API_KEY=\"${GEMINI_API_KEY_VAL}\"" >> /etc/profile.d/antigravity-ha.sh
    bashio::log.info "Configured GEMINI_API_KEY from add-on settings."
else
    bashio::log.info "No GEMINI_API_KEY set in options; using interactive Google OAuth login in terminal."
fi

chmod +x /etc/profile.d/antigravity-ha.sh

# Configure tmux for persistent sessions while keeping native browser mouse selection & OSC 52 clipboard
cat <<EOF > /root/.tmux.conf
set -g mouse off
set -g set-clipboard on
set -g allow-passthrough on
set -as terminal-features ',*:clipboard'
set -ag terminal-overrides ',*:Ms=\E]52;%p1%s;%p2%s\007'
set -g history-limit 50000
set -g default-terminal "screen-256color"
set -g status-bg "#1a73e8"
set -g status-fg "#ffffff"
set -g status-left " [Antigravity HA] "
set -g status-left-length 20
set -g status-right " ${WORK_DIR_VAL} | %H:%M "
EOF

bashio::log.info "Antigravity Terminal initialization complete."
