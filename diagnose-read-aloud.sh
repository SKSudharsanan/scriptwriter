#!/bin/bash
# Diagnostic test for Read Aloud feature

echo "🔍 Read Aloud Diagnostic Test"
echo "=============================="
echo ""

cd "$(dirname "$0")"

echo "✅ Step 1: Check Python TTS backend"
cd ml
.venv/bin/python3.11 -c "
import pyttsx3
engine = pyttsx3.init()
print('✓ pyttsx3 initialized')
engine.say('Backend test')
engine.runAndWait()
print('✓ Speech completed')
"

echo ""
echo "✅ Step 2: Check available voices"
.venv/bin/python3.11 -c "
import pyttsx3
engine = pyttsx3.init()
voices = engine.getProperty('voices')
print(f'Total voices: {len(voices)}')

# Check for Tamil
tamil = [v for v in voices if 'tamil' in v.id.lower()]
print(f'Tamil voices: {len(tamil)}')
if tamil:
    print(f'  Found: {tamil[0].id}')

# Check for Indian
indian = [v for v in voices if 'india' in v.id.lower() or 'rishi' in v.id.lower() or 'veena' in v.id.lower()]
print(f'Indian voices: {len(indian)}')
if indian:
    print(f'  Found: {indian[0].id}')
"

echo ""
echo "✅ Step 3: Test CLI TTS with Tamil text"
.venv/bin/python3.11 -m scriptwriter_ml.cli tts --text "வணக்கம்" --language ta

echo ""
echo "✅ Step 4: Test CLI TTS with English text"
.venv/bin/python3.11 -m scriptwriter_ml.cli tts --text "Hello world" --language en

echo ""
echo "=============================="
echo "📋 Diagnostic Results:"
echo ""
echo "If you HEARD both 'வணக்கம்' and 'Hello world' spoken:"
echo "  → Python TTS works! ✅"
echo "  → Problem is in the UI/Tauri communication"
echo ""
echo "If you did NOT hear anything:"
echo "  → Check system audio output"
echo "  → Check volume settings"
echo "  → Try with headphones"
echo ""
echo "=============================="
echo ""
echo "🎯 Next Steps:"
echo "1. Did you hear the speech? (yes/no)"
echo "2. Is your browser tab reloaded? (Cmd+R)"
echo "3. Check browser console (F12) when clicking Read Aloud"
echo "4. Check terminal where 'cargo tauri dev' runs for errors"

