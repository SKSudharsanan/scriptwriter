#!/bin/bash

# Development startup script for ScriptWriter
# This script ensures the Python ML backend is properly configured

# Set the Python path to use the virtual environment
export SCRIPTWRITER_PYTHON="$(pwd)/ml/.venv/bin/python3.11"

# Verify the Python interpreter exists
if [ ! -f "$SCRIPTWRITER_PYTHON" ]; then
    echo "Error: Python virtual environment not found at $SCRIPTWRITER_PYTHON"
    echo "Please run: cd ml && python3 -m venv .venv && .venv/bin/python3.11 -m pip install -e . && .venv/bin/python3.11 -m pip install SpeechRecognition pyttsx3 pyaudio"
    exit 1
fi

# Verify the scriptwriter_ml package is installed
if ! "$SCRIPTWRITER_PYTHON" -c "import scriptwriter_ml" 2>/dev/null; then
    echo "Error: scriptwriter_ml package not installed"
    echo "Please run: cd ml && source .venv/bin/activate && pip install -e ."
    exit 1
fi

echo "✓ Python virtual environment found"
echo "✓ scriptwriter_ml package installed"
echo "Starting Tauri development server..."
echo ""

# Start the Tauri development server
cargo tauri dev

