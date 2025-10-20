#!/bin/bash
# Test TTS functionality

echo "🎵 Testing Text-to-Speech..."
echo ""

cd "$(dirname "$0")/ml"

echo "Test 1: English speech"
.venv/bin/python3.11 -c "import pyttsx3; engine = pyttsx3.init(); engine.say('Hello, this is a test'); engine.runAndWait()" && echo "✅ English TTS works" || echo "❌ English TTS failed"

echo ""
echo "Test 2: Tamil text (will use default voice if no Tamil voice installed)"
.venv/bin/python3.11 -c "import pyttsx3; engine = pyttsx3.init(); engine.say('வணக்கம்'); engine.runAndWait()" && echo "✅ Tamil text TTS works" || echo "❌ Tamil text TTS failed"

echo ""
echo "Test 3: Via CLI"
.venv/bin/python3.11 -m scriptwriter_ml.cli tts --text "Testing from CLI"

echo ""
echo "Test 4: Check Tamil voices available"
.venv/bin/python3.11 -c "
import pyttsx3
engine = pyttsx3.init()
voices = engine.getProperty('voices')
tamil = [v for v in voices if 'tamil' in v.id.lower() or 'tamil' in (v.name.lower() if hasattr(v, 'name') else '')]
print(f'Tamil voices found: {len(tamil)}')
if tamil:
    for v in tamil:
        print(f'  - {v.id}: {v.name if hasattr(v, \"name\") else \"no name\"}')
else:
    print('⚠️  No Tamil voices installed')
    print('📥 Install from: System Settings → Accessibility → Spoken Content → System Voices')
"

echo ""
echo "✅ All tests complete! Did you hear the speech?"


