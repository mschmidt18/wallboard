#!/usr/bin/env bash
#
# Wallboard Installer
# One-line install: curl -sSL https://raw.githubusercontent.com/mschmidt18/wallboard/main/install.sh | bash
#
# Installs the Wallboard digital dashboard on Debian-based systems (Raspberry Pi OS, Debian 12+, Ubuntu).
# Must be run as root.
#
# Flags:
#   --test           Run in test/container mode (skip git clone, systemd)
#   --with-display   Install Chromium and cage kiosk compositor (included by default, excluded by --test)

set -e

REPO_URL="https://github.com/mschmidt18/wallboard.git"
INSTALL_DIR="/opt/wallboard"
CONFIG_DIR="/etc/wallboard"
SERVICE_USER="wallboard"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info() {
    echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"
}

success() {
    echo -e "\033[1;32m    $1\033[0m"
}

warn() {
    echo -e "\033[1;33m    WARNING: $1\033[0m"
}

error_exit() {
    echo -e "\n\033[1;31mERROR: $1\033[0m" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Flag parsing
# ---------------------------------------------------------------------------

TEST_MODE=false
INSTALL_DISPLAY=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)
            TEST_MODE=true
            INSTALL_DISPLAY=false
            shift ;;
        --with-display)
            INSTALL_DISPLAY=true
            shift ;;
        *) warn "Unknown flag: $1"; shift ;;
    esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
    error_exit "This script must be run as root. Try: sudo bash install.sh"
fi

info "Starting Wallboard installation..."

# ---------------------------------------------------------------------------
# Step 1: Install system dependencies
# ---------------------------------------------------------------------------

info "Step 1/8: Installing system dependencies..."

apt-get update -qq

# Chromium + cage kiosk compositor (skip in test mode without --with-display)
if $INSTALL_DISPLAY; then
    if apt-get install -y -qq chromium-browser > /dev/null 2>&1; then
        true
    else
        apt-get install -y -qq chromium > /dev/null
    fi
    success "Chromium installed"

    apt-get install -y -qq cage curl > /dev/null
    success "Cage (Wayland kiosk compositor) installed"
else
    success "Skipping Chromium and cage (--test mode)"
fi

# Node.js -- use NodeSource if not already present
if ! command -v node &> /dev/null; then
    if [ ! -f /etc/apt/sources.list.d/nodesource.list ] && [ ! -f /usr/share/keyrings/nodesource.gpg ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    fi
    apt-get install -y -qq nodejs > /dev/null
fi
success "Node.js $(node --version) installed"

# Git (needed to clone repo -- skip in test mode, already available)
if ! $TEST_MODE; then
    apt-get install -y -qq git > /dev/null
    success "Git installed"
fi

# ---------------------------------------------------------------------------
# Step 2: Create wallboard user and directory structure
# ---------------------------------------------------------------------------

info "Step 2/8: Creating wallboard user and directories..."

if ! id -u "$SERVICE_USER" &> /dev/null; then
    useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    success "Created system user: $SERVICE_USER"
else
    success "User $SERVICE_USER already exists"
fi

# Add groups for DRM/GPU and input device access
if $INSTALL_DISPLAY; then
    # Ensure groups exist (present on real hardware via udev, may be missing in containers)
    getent group video  > /dev/null || groupadd --system video
    getent group input  > /dev/null || groupadd --system input
    getent group render > /dev/null || groupadd --system render
    usermod -aG video,input,render "$SERVICE_USER"
    success "Added $SERVICE_USER to video, input, and render groups"
fi

WALLBOARD_DATA="/home/$SERVICE_USER/.wallboard"
mkdir -p "$WALLBOARD_DATA"
chown "$SERVICE_USER":"$SERVICE_USER" "$WALLBOARD_DATA"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
chown root:root "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"
success "Directories created: $INSTALL_DIR, $CONFIG_DIR"

# ---------------------------------------------------------------------------
# Step 3: Clone repo and install Node.js dependencies
# ---------------------------------------------------------------------------

info "Step 3/8: Cloning repository and installing dependencies..."

if $TEST_MODE; then
    # In test mode, copy source from build context instead of cloning
    cp -r /tmp/wallboard-source/* "$INSTALL_DIR/"
    success "Source copied to $INSTALL_DIR (test mode)"
elif [ -d "$INSTALL_DIR/.git" ]; then
    cd "$INSTALL_DIR"
    git fetch --quiet
    git reset -q --hard origin/main
    success "Repository updated"
else
    # If the directory has contents but isn't a git repo, clone fresh
    if [ "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
        rm -rf "${INSTALL_DIR:?}"/*
    fi
    git clone --quiet --branch main "$REPO_URL" "$INSTALL_DIR"
    success "Repository cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
success "File ownership set to $SERVICE_USER"

npm install --silent
success "Node.js dependencies installed"

# ---------------------------------------------------------------------------
# Step 4: Build server and frontend
# ---------------------------------------------------------------------------

info "Step 4/8: Building server and frontend..."

cd "$INSTALL_DIR"
npm run build --silent
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
success "Server and frontend built"

# ---------------------------------------------------------------------------
# Step 5: Generate device-specific encryption key
# ---------------------------------------------------------------------------

info "Step 5/8: Generating encryption key..."

SECRET_KEY_FILE="$CONFIG_DIR/secret.key"

if [ -f "$SECRET_KEY_FILE" ]; then
    warn "Encryption key already exists at $SECRET_KEY_FILE -- skipping"
else
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > "$SECRET_KEY_FILE"
    chown root:wallboard "$SECRET_KEY_FILE"
    chmod 640 "$SECRET_KEY_FILE"
    success "Encryption key generated at $SECRET_KEY_FILE"
fi

# ---------------------------------------------------------------------------
# Step 6: Install systemd services
# ---------------------------------------------------------------------------

info "Step 6/8: Installing systemd services..."

for f in system/wallboard-server.service system/wallboard-display.service bin/wallboard bin/wallboard-display; do
    [ -f "$INSTALL_DIR/$f" ] || error_exit "Missing required file: $INSTALL_DIR/$f"
done

cp "$INSTALL_DIR/system/wallboard-server.service" /etc/systemd/system/
cp "$INSTALL_DIR/system/wallboard-display.service" /etc/systemd/system/

if ! $TEST_MODE; then
    systemctl daemon-reload
fi
success "Systemd services installed"

# ---------------------------------------------------------------------------
# Step 7: Install wallboard CLI
# ---------------------------------------------------------------------------

info "Step 7/8: Installing wallboard CLI..."

cp "$INSTALL_DIR/bin/wallboard" /usr/local/bin/wallboard
chmod +x /usr/local/bin/wallboard
success "CLI installed to /usr/local/bin/wallboard"

chmod +x "$INSTALL_DIR/bin/wallboard-display"
success "Display launcher script ready"

# ---------------------------------------------------------------------------
# Step 8: Start services
# ---------------------------------------------------------------------------

info "Step 8/8: Starting services..."

if ! $TEST_MODE; then
    systemctl enable wallboard-server.service wallboard-display.service
    systemctl restart wallboard-server.service
    systemctl restart wallboard-display.service
    success "Services enabled and started"
else
    success "Skipping service start (test mode)"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

DEVICE_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "============================================"
echo "  Wallboard installation complete!"
echo "============================================"
echo ""
echo "  Admin UI:  http://${DEVICE_IP}:8000/admin"
echo "  Dashboard: http://${DEVICE_IP}:8000"
echo ""
echo "  CLI:       wallboard status"
echo "  Logs:      wallboard logs"
echo ""
echo "  Open the Admin UI from another device"
echo "  to complete first-time setup."
echo ""
