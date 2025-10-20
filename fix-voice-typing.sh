#!/bin/bash

# macOS: Grant microphone permissions for Tauri app
# This script helps diagnose and fix voice typing "service-not-allowed" errors

echo "=== Voice Typing Troubleshooting Tool ==="
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is for macOS only"
    exit 1
fi

echo "Checking microphone permissions..."
echo ""

# Check if TCC database is accessible
TCC_DB="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
if [ -f "$TCC_DB" ]; then
    echo "✓ TCC database found"
    echo ""
    echo "Apps with microphone access:"
    sqlite3 "$TCC_DB" "SELECT client, allowed FROM access WHERE service='kTCCServiceMicrophone' AND allowed=1" 2>/dev/null || echo "  (Cannot query database - may need full disk access)"
else
    echo "⚠ TCC database not found at expected location"
fi

echo ""
echo "=== Steps to Grant Microphone Access ==="
echo ""
echo "1. Open System Settings"
echo "2. Go to: Privacy & Security → Microphone"
echo "3. Find 'app' or 'ScriptWriter' in the list"
echo "4. Enable the checkbox"
echo "5. Restart the Tauri app"
echo ""
echo "=== Alternative: Test in Browser ==="
echo ""
echo "To verify if voice typing works outside Tauri:"
echo "  1. Start the dev server: npm run dev --prefix frontend"
echo "  2. Open http://localhost:5174 in Chrome"
echo "  3. Try voice typing there"
echo ""
echo "If it works in browser but not Tauri, it's a webview permission issue."
echo ""
echo "=== Opening System Settings... ==="

# Open System Settings to Microphone privacy
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"

echo ""
echo "✓ Opened System Settings → Privacy & Security → Microphone"
echo ""
echo "Please enable microphone access for your app, then restart it."

