#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  YouPI-PG + Test Storefront — Start All Services
#  Usage: bash start-all.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

YOUPI_DIR="$SCRIPT_DIR/youpi-pg"
STORE_DIR="$SCRIPT_DIR/youpi-test-store"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         YouPI-PG · Local Development Environment            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Start YouPI-PG gateway ──────────────────────────────────────────────
echo "▶  Starting YouPI-PG gateway (npm run dev)…"
echo "   Logs → $LOG_DIR/youpi-pg.log"
cd "$YOUPI_DIR"
nohup npm run dev > "$LOG_DIR/youpi-pg.log" 2>&1 &
YOUPI_PID=$!
echo "   PID: $YOUPI_PID"
echo "$YOUPI_PID" > "$LOG_DIR/youpi-pg.pid"

# ── 2. Wait for the gateway API to be ready ───────────────────────────────
echo ""
echo "⏳ Waiting for YouPI-PG payment API (http://localhost:6100/health)…"
for i in $(seq 1 30); do
  if curl -sf http://localhost:6100/health > /dev/null 2>&1; then
    echo "   ✅ Gateway API is up!"
    break
  fi
  sleep 2
  echo -n "."
done

# ── 3. Start Test Storefront ──────────────────────────────────────────────
echo ""
echo "▶  Starting test storefront (http://localhost:4000)…"
echo "   Logs → $LOG_DIR/store.log"
cd "$STORE_DIR"
nohup node server.js > "$LOG_DIR/store.log" 2>&1 &
STORE_PID=$!
echo "   PID: $STORE_PID"
echo "$STORE_PID" > "$LOG_DIR/store.pid"

# ── 4. Summary ────────────────────────────────────────────────────────────
sleep 2
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  All services started!                                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  🛒  Test Storefront:  http://localhost:4000                  ║"
echo "║  💳  Checkout Portal:  http://localhost:7000                  ║"
echo "║  🔌  Payment API:      http://localhost:6100                  ║"
echo "║  🛡  Admin Panel:      http://localhost:6001                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Tail logs:  tail -f logs/youpi-pg.log logs/store.log        ║"
echo "║  Stop all:   bash stop-all.sh                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "👉 Open http://localhost:4000 in your browser to start testing!"
