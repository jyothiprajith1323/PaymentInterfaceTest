#!/usr/bin/env bash
# Stop all YouPI-PG services
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

echo "Stopping YouPI-PG services…"

for pidfile in "$LOG_DIR/youpi-pg.pid" "$LOG_DIR/store.pid"; do
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "  Stopped PID $pid ($(basename $pidfile .pid))"
    fi
    rm -f "$pidfile"
  fi
done

# Also kill by port in case pid files are stale
for port in 6100 7000 6001 3000 8090 4000; do
  pid=$(lsof -ti tcp:$port 2>/dev/null) && kill $pid 2>/dev/null && echo "  Killed port $port (PID $pid)" || true
done

echo "Done."
