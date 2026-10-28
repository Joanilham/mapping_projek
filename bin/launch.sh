#!/usr/bin/env bash
set -e

# Project root directory
PROJECT_DIR="/run/media/joan/7838E7CB38E7868A/Projek/Mapping Projek"
cd "$PROJECT_DIR"

# Ensure PATH includes standard system paths
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

PORT=3333
URL="http://localhost:$PORT"

# Check if dashboard server is already running on port 3333
if ! curl -s -m 1 "$URL/api/project" > /dev/null 2>&1; then
    echo "Starting Project Mapper Dashboard Server on port $PORT..."
    nohup /usr/bin/npm run ui > "$PROJECT_DIR/.server.log" 2>&1 &
    
    # Wait up to 6 seconds for server readiness
    for i in {1..12}; do
        if curl -s -m 1 "$URL/api/project" > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
fi

# Send notification to desktop if available
if command -v notify-send > /dev/null 2>&1; then
    notify-send -i "$PROJECT_DIR/public/icon.svg" "Project Mapper" "Visual Dashboard aktif di $URL" || true
fi

# Open visual dashboard in user's default browser
if command -v xdg-open > /dev/null 2>&1; then
    xdg-open "$URL" > /dev/null 2>&1 &
elif command -v gio > /dev/null 2>&1; then
    gio open "$URL" > /dev/null 2>&1 &
fi
