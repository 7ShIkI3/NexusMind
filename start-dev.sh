#!/bin/bash
# NexusMind - Quick development start script

set -e

echo "🧠 Starting NexusMind..."
echo ""

# Check for required tools
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "❌ Python 3 is required. Install from https://python.org"
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "❌ Node.js is required. Install from https://nodejs.org"
    exit 1
fi

PYTHON=$(command -v python3 || command -v python)

# Setup backend
echo "📦 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    $PYTHON -m venv venv
fi

source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null

pip install -r requirements.txt -q

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "📝 Created backend/.env — edit it to configure AI providers"
fi

mkdir -p data extensions/installed

echo "🚀 Starting backend on http://localhost:8000 ..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cd ..

# Setup frontend
echo "📦 Installing frontend dependencies..."
cd frontend
npm install -q

echo "🎨 Starting frontend on http://localhost:3000 ..."
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "✅ NexusMind is running!"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
