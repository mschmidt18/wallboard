#!/usr/bin/env bash
#
# Wallboard Installer
# One-line install: curl -sSL https://raw.githubusercontent.com/OWNER/wallboard/main/install.sh | bash
#
# Installs the Wallboard digital dashboard on a Raspberry Pi running Raspberry Pi OS (Debian-based).
# Must be run as root.

set -e

REPO_URL="https://github.com/OWNER/wallboard.git"
INSTALL_DIR="/opt/wallboard"
CONFIG_DIR="/etc/wallboard"
LOG_DIR="/var/log/wallboard"
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
# Pre-flight checks
# ---------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
    error_exit "This script must be run as root. Try: sudo bash install.sh"
fi

info "Starting Wallboard installation..."

# ---------------------------------------------------------------------------
# Step 1: Install system dependencies
# ---------------------------------------------------------------------------

info "Step 1/9: Installing system dependencies..."

apt-get update -qq

# Python
apt-get install -y -qq python3 python3-venv python3-pip > /dev/null
success "Python 3 installed"

# Chromium
apt-get install -y -qq chromium-browser > /dev/null
success "Chromium installed"

# X server and minimal window manager
apt-get install -y -qq xorg openbox > /dev/null
success "X server (xorg + openbox) installed"

# Node.js -- use NodeSource if not already present
if ! command -v node &> /dev/null; then
    if [ ! -f /etc/apt/sources.list.d/nodesource.list ] && [ ! -f /usr/share/keyrings/nodesource.gpg ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    fi
    apt-get install -y -qq nodejs > /dev/null
fi
success "Node.js $(node --version) installed"

# Git (needed to clone repo)
apt-get install -y -qq git > /dev/null
success "Git installed"

# ---------------------------------------------------------------------------
# Step 2: Create wallboard user and directory structure
# ---------------------------------------------------------------------------

info "Step 2/9: Creating wallboard user and directories..."

if ! id -u "$SERVICE_USER" &> /dev/null; then
    useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    success "Created system user: $SERVICE_USER"
else
    success "User $SERVICE_USER already exists"
fi

WALLBOARD_DATA="/home/$SERVICE_USER/.wallboard"
mkdir -p "$WALLBOARD_DATA"
chown "$SERVICE_USER":"$SERVICE_USER" "$WALLBOARD_DATA"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR"
chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR" "$LOG_DIR"
chown root:root "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"
success "Directories created: $INSTALL_DIR, $CONFIG_DIR, $LOG_DIR"

# ---------------------------------------------------------------------------
# Step 3: Clone repo, set up Python venv, install pip dependencies
# ---------------------------------------------------------------------------

info "Step 3/9: Cloning repository and setting up Python environment..."

if [ -d "$INSTALL_DIR/.git" ]; then
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

python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install --quiet -r "$INSTALL_DIR/server/requirements.txt"
success "Python venv created and dependencies installed"

# ---------------------------------------------------------------------------
# Step 4: Build the React frontend
# ---------------------------------------------------------------------------

info "Step 4/9: Building React frontend..."

cd "$INSTALL_DIR/frontend"
npm install --silent
npm run build --silent
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
success "Frontend built to frontend/dist/"

# ---------------------------------------------------------------------------
# Step 5: Generate device-specific encryption key
# ---------------------------------------------------------------------------

info "Step 5/9: Generating encryption key..."

SECRET_KEY_FILE="$CONFIG_DIR/secret.key"

if [ -f "$SECRET_KEY_FILE" ]; then
    warn "Encryption key already exists at $SECRET_KEY_FILE -- skipping"
else
    "$INSTALL_DIR/.venv/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" > "$SECRET_KEY_FILE"
    chown root:wallboard "$SECRET_KEY_FILE"
    chmod 640 "$SECRET_KEY_FILE"
    success "Encryption key generated at $SECRET_KEY_FILE"
fi

# ---------------------------------------------------------------------------
# Step 6: Install systemd services
# ---------------------------------------------------------------------------

info "Step 6/9: Installing systemd services..."

for f in system/wallboard-server.service system/wallboard-display.service bin/wallboard; do
    [ -f "$INSTALL_DIR/$f" ] || error_exit "Missing required file: $INSTALL_DIR/$f"
done

cp "$INSTALL_DIR/system/wallboard-server.service" /etc/systemd/system/
cp "$INSTALL_DIR/system/wallboard-display.service" /etc/systemd/system/
systemctl daemon-reload
success "Systemd services installed and daemon reloaded"

# ---------------------------------------------------------------------------
# Step 7: Install wallboard CLI
# ---------------------------------------------------------------------------

info "Step 7/9: Installing wallboard CLI..."

cp "$INSTALL_DIR/bin/wallboard" /usr/local/bin/wallboard
chmod +x /usr/local/bin/wallboard
success "CLI installed to /usr/local/bin/wallboard"

# ---------------------------------------------------------------------------
# Step 8: Configure log rotation
# ---------------------------------------------------------------------------

info "Step 8/9: Configuring log rotation..."

cat > /etc/logrotate.d/wallboard << 'LOGROTATE'
/var/log/wallboard/wallboard.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
LOGROTATE

success "Logrotate configured (7-day retention)"

# ---------------------------------------------------------------------------
# Step 9: Start services
# ---------------------------------------------------------------------------

info "Step 9/9: Starting services..."

systemctl enable wallboard-server.service wallboard-display.service
systemctl start wallboard-server.service
systemctl start wallboard-display.service
success "Services enabled and started"

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
