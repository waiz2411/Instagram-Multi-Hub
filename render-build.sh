#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

export PLAYWRIGHT_BROWSERS_PATH=0

echo "================================================="
echo "  🚀 Starting Render Production Build Process    "
echo "================================================="

echo "1. Installing root, server, and client dependencies..."
npm install
cd server && npm install
cd ../client && npm install
cd ..

echo "2. Compiling React Vite client for production..."
cd client && npm run build
cd ..

echo "3. Installing Playwright Chromium into local project..."
cd server
export PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
npx playwright install-deps chromium || true
cd ..

echo "================================================="
echo "  ✅ Build Completed Successfully! Ready to Run. "
echo "================================================="
