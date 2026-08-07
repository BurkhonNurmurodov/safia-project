#!/bin/bash
# Build frontend and restart backend for sharing via ngrok
set -e

echo "→ Building frontend..."
cd "$(dirname "$0")/frontend"
npm run build

echo "→ Restarting backend..."
pkill -f "uvicorn app.main" 2>/dev/null || true
sleep 1
cd "$(dirname "$0")/backend"
source venv/bin/activate
uvicorn app.main:app --port 8000 &

sleep 2
echo ""
echo "✓ Running at http://localhost:8000"
echo "  Share with: ngrok http 8000"
