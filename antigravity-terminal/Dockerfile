ARG BUILD_ARCH=amd64
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-debian:bookworm

LABEL \
    org.opencontainers.image.title="Home Assistant Add-on: Antigravity Terminal" \
    org.opencontainers.image.description="Google Antigravity CLI web terminal with Home Assistant harness for automations, dashboards, and diagnostics." \
    org.opencontainers.image.source="https://github.com/assafmiron/antigravity-home-assistant" \
    org.opencontainers.image.licenses="MIT"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG BUILD_ARCH=amd64
ARG TTYD_VERSION=1.7.7
ARG HA_CLI_VERSION=4.32.0

# Install core system utilities, Python, Node, jq, yq, tmux, git, sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    less \
    locales \
    nano \
    nodejs \
    npm \
    openssh-client \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    python3-yaml \
    ripgrep \
    sqlite3 \
    tmux \
    tzdata \
    unzip \
    vim \
    wget \
    && sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    HOME=/root \
    PATH="/root/.local/bin:/usr/local/bin:${PATH}"

# Install ttyd binary for web terminal over Ingress
RUN case "${BUILD_ARCH}" in \
        amd64) TTYD_ARCH="x86_64" ;; \
        aarch64) TTYD_ARCH="aarch64" ;; \
        *) echo "Unsupported architecture: ${BUILD_ARCH}" && exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}" -o /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# Install Official Home Assistant CLI (`ha`)
RUN curl -fsSL "https://github.com/home-assistant/cli/releases/download/${HA_CLI_VERSION}/ha_${BUILD_ARCH}" -o /usr/local/bin/ha \
    && chmod +x /usr/local/bin/ha

# Install yq for YAML manipulation and linting
RUN case "${BUILD_ARCH}" in \
        amd64) YQ_ARCH="amd64" ;; \
        aarch64) YQ_ARCH="arm64" ;; \
        *) YQ_ARCH="amd64" ;; \
    esac \
    && curl -fsSL "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${YQ_ARCH}" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq

# Install yamllint for YAML validation
RUN pip3 install --no-cache-dir --break-system-packages yamllint requests

# Attempt pre-installation of Antigravity CLI (`agy`) during image build
# and keep a bundled fallback copy in /usr/local/bin/agy
RUN (curl -fsSL https://antigravity.google/cli/install.sh -o /tmp/agy-install.sh \
    && bash /tmp/agy-install.sh </dev/null \
    && rm -f /tmp/agy-install.sh \
    && if [ -x /root/.local/bin/agy ]; then cp -f /root/.local/bin/agy /usr/local/bin/agy; fi) || true

# Copy the Home Assistant Antigravity Harness into /opt/ha-agy-harness
COPY harness/ /opt/ha-agy-harness/

# Copy rootfs (s6-overlay init scripts, ttyd service, helper binaries)
COPY rootfs/ /

RUN chmod +x \
    /etc/cont-init.d/00-setup-antigravity.sh \
    /etc/services.d/ttyd/run \
    /etc/services.d/ttyd/finish \
    /usr/local/bin/agy-entrypoint \
    /usr/local/bin/agy-login-url \
    /usr/local/bin/ha-api \
    /usr/local/bin/login-url-watcher \
    /usr/local/bin/prepare-ttyd-ui \
    /opt/ha-agy-harness/hooks/*.sh \
    /opt/ha-agy-harness/skills/ha-diagnostics/scripts/*.sh \
    && /usr/local/bin/prepare-ttyd-ui || true

WORKDIR /config
