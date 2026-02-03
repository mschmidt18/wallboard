#!/usr/bin/env bash
#
# Post-install verification for Wallboard
# Run after install.sh to verify everything was set up correctly.
#

set -e

INSTALL_DIR="/opt/wallboard"
CONFIG_DIR="/etc/wallboard"
LOG_DIR="/var/log/wallboard"
SERVICE_USER="wallboard"
WALLBOARD_DATA="/home/$SERVICE_USER/.wallboard"

PASS=0
FAIL=0

pass() {
    echo -e "\033[1;32m  PASS\033[0m $1"
    PASS=$((PASS + 1))
}

fail() {
    echo -e "\033[1;31m  FAIL\033[0m $1"
    FAIL=$((FAIL + 1))
}

check() {
    local description="$1"
    shift
    if "$@" > /dev/null 2>&1; then
        pass "$description"
    else
        fail "$description"
    fi
}

echo ""
echo "=== Wallboard Install Verification ==="
echo ""

# -------------------------------------------------------------------------
# 1. wallboard system user exists
# -------------------------------------------------------------------------
check "wallboard user exists" id -u "$SERVICE_USER"

# -------------------------------------------------------------------------
# 2. Required directories exist
# -------------------------------------------------------------------------
for dir in "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$WALLBOARD_DATA"; do
    check "directory exists: $dir" test -d "$dir"
done

# -------------------------------------------------------------------------
# 3. Directory ownership
# -------------------------------------------------------------------------
check "$INSTALL_DIR owned by $SERVICE_USER" \
    test "$(stat -c '%U' "$INSTALL_DIR")" = "$SERVICE_USER"

check "$LOG_DIR owned by $SERVICE_USER" \
    test "$(stat -c '%U' "$LOG_DIR")" = "$SERVICE_USER"

check "$CONFIG_DIR owned by root" \
    test "$(stat -c '%U' "$CONFIG_DIR")" = "root"

check "$WALLBOARD_DATA owned by $SERVICE_USER" \
    test "$(stat -c '%U' "$WALLBOARD_DATA")" = "$SERVICE_USER"

# -------------------------------------------------------------------------
# 4. Node.js installed with dependencies
# -------------------------------------------------------------------------
check "Node.js installed" command -v node

check "node_modules exists" test -d "$INSTALL_DIR/node_modules"

# -------------------------------------------------------------------------
# 5. Server and frontend built
# -------------------------------------------------------------------------
check "dist/server/index.js exists" \
    test -f "$INSTALL_DIR/dist/server/index.js"

check "dist/frontend/index.html exists" \
    test -f "$INSTALL_DIR/dist/frontend/index.html"

check "dist/frontend/assets/ exists" \
    test -d "$INSTALL_DIR/dist/frontend/assets"

# -------------------------------------------------------------------------
# 6. Encryption key
# -------------------------------------------------------------------------
SECRET_KEY="$CONFIG_DIR/secret.key"
check "encryption key exists" test -f "$SECRET_KEY"

if [ -f "$SECRET_KEY" ]; then
    KEY_OWNER=$(stat -c '%U:%G' "$SECRET_KEY")
    check "encryption key owned by root:wallboard" \
        test "$KEY_OWNER" = "root:wallboard"

    KEY_PERMS=$(stat -c '%a' "$SECRET_KEY")
    check "encryption key permissions are 640" \
        test "$KEY_PERMS" = "640"
fi

# -------------------------------------------------------------------------
# 7. Systemd service files copied
# -------------------------------------------------------------------------
check "wallboard-server.service exists" \
    test -f /etc/systemd/system/wallboard-server.service

check "wallboard-display.service exists" \
    test -f /etc/systemd/system/wallboard-display.service

# -------------------------------------------------------------------------
# 8. CLI installed and executable
# -------------------------------------------------------------------------
check "CLI at /usr/local/bin/wallboard" test -f /usr/local/bin/wallboard
check "CLI is executable" test -x /usr/local/bin/wallboard

# -------------------------------------------------------------------------
# 9. Server starts and responds to health check
# -------------------------------------------------------------------------
echo ""
echo "--- Starting server for health check ---"

# Start server in background as wallboard user
sudo -u "$SERVICE_USER" \
    NODE_ENV=production \
    node "$INSTALL_DIR/dist/server/index.js" &
SERVER_PID=$!

# Wait for server to be ready (up to 15 seconds)
READY=false
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        READY=true
        break
    fi
    sleep 0.5
done

if $READY; then
    # Verify database was created with expected tables
    DB_PATH="$WALLBOARD_DATA/wallboard.db"
    if [ -f "$DB_PATH" ]; then
        pass "database file created on startup"
        for table in _migrations layouts widgets integrations cache ics_calendars; do
            # Run from /opt/wallboard where node_modules exists
            check "database has table: $table" \
                bash -c "cd $INSTALL_DIR && node -e \"
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH', { readonly: true });
const row = db.prepare(\\\"SELECT name FROM sqlite_master WHERE type='table' AND name=?\\\").get('$table');
if (!row) process.exit(1);
\""
        done
    else
        fail "database file created on startup"
    fi

    pass "server responds to GET /api/health"
else
    fail "server did not respond to GET /api/health within 15s"
fi

# Clean up server process
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

# -------------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------------
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
