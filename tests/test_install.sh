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
# 4. Python venv with critical packages
# -------------------------------------------------------------------------
VENV="$INSTALL_DIR/.venv"
check "Python venv exists" test -x "$VENV/bin/python"

for pkg in fastapi uvicorn sqlalchemy alembic pydantic; do
    check "pip package installed: $pkg" "$VENV/bin/pip" show "$pkg"
done

# -------------------------------------------------------------------------
# 5. Database exists with expected tables
# -------------------------------------------------------------------------
DB_PATH="$WALLBOARD_DATA/wallboard.db"
check "database file exists" test -f "$DB_PATH"

if [ -f "$DB_PATH" ]; then
    for table in alembic_version layouts widgets integrations cache; do
        check "database has table: $table" \
            "$VENV/bin/python" -c "
import sqlite3
conn = sqlite3.connect('$DB_PATH')
cursor = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='$table'\")
assert cursor.fetchone() is not None, 'Table $table not found'
"
    done
fi

# -------------------------------------------------------------------------
# 6. Frontend built
# -------------------------------------------------------------------------
check "frontend/dist/index.html exists" \
    test -f "$INSTALL_DIR/frontend/dist/index.html"

check "frontend/dist/assets/ exists" \
    test -d "$INSTALL_DIR/frontend/dist/assets"

# -------------------------------------------------------------------------
# 7. Encryption key
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
# 8. Systemd service files copied
# -------------------------------------------------------------------------
check "wallboard-server.service exists" \
    test -f /etc/systemd/system/wallboard-server.service

check "wallboard-display.service exists" \
    test -f /etc/systemd/system/wallboard-display.service

# -------------------------------------------------------------------------
# 9. CLI installed and executable
# -------------------------------------------------------------------------
check "CLI at /usr/local/bin/wallboard" test -f /usr/local/bin/wallboard
check "CLI is executable" test -x /usr/local/bin/wallboard

# -------------------------------------------------------------------------
# 10. Server starts and responds to health check
# -------------------------------------------------------------------------
echo ""
echo "--- Starting server for health check ---"

# Start server in background as wallboard user
sudo -u "$SERVICE_USER" \
    WALLBOARD_DB_PATH="$DB_PATH" \
    WALLBOARD_SECRET_KEY_PATH="$SECRET_KEY" \
    WALLBOARD_LOG_PATH="$LOG_DIR/wallboard.log" \
    "$VENV/bin/uvicorn" server.app.main:app \
    --host 127.0.0.1 --port 8000 \
    --app-dir "$INSTALL_DIR" &
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
