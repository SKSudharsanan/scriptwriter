"""Text-to-speech helpers with multiple backend support."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

from .models import ensure_directories, locate_model

_logger = logging.getLogger(__name__)

# Try to import pyttsx3 for offline TTS
try:
    import pyttsx3
    _HAVE_PYTTSX3 = True
except ImportError:
    _HAVE_PYTTSX3 = False
    _logger.warning("pyttsx3 not installed. Install with: pip install pyttsx3")


def synthesize_to_file(text: str, output_path: str, language: str = "en") -> dict:
    """
    Synthesize text to speech and save to file.
    
    Args:
        text: Text to synthesize
        output_path: Path to save audio file
        language: Language code
    
    Returns:
        Dictionary with 'success', 'path', and optional 'error' keys
    """
    if not _HAVE_PYTTSX3:
        return {
            "success": False,
            "error": "pyttsx3 not installed. Run: pip install pyttsx3"
        }
    
    try:
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)
        engine.setProperty('volume', 0.9)
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        
        return {
            "success": True,
            "path": output_path,
            "engine": "pyttsx3"
        }
        
    except Exception as e:
        _logger.error(f"TTS synthesis error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def speak_text(text: str, language: str = "en") -> dict:
    """
    Speak text immediately.
    
    Args:
        text: Text to speak
        language: Language code ('en' for English, 'ta' for Tamil)
    
    Returns:
        Dictionary with 'success' and optional 'error' keys
    """
    if not _HAVE_PYTTSX3:
        return {
            "success": False,
            "error": "pyttsx3 not installed. Run: pip install pyttsx3"
        }
    
    try:
        engine = pyttsx3.init()
        
        # Configure for Tamil if needed
        if language == 'ta' or language.startswith('ta'):
            # Try to find a Tamil voice
            voices = engine.getProperty('voices')
            tamil_voice = None
            
            # Look for Tamil voices (common patterns on macOS)
            for voice in voices:
                voice_id = voice.id.lower()
                voice_name = voice.name.lower() if hasattr(voice, 'name') else ''
                if 'tamil' in voice_id or 'tamil' in voice_name or 'ta_in' in voice_id:
                    tamil_voice = voice.id
                    _logger.info(f"Using Tamil voice: {tamil_voice}")
                    break
            
            if tamil_voice:
                engine.setProperty('voice', tamil_voice)
            else:
                # If no Tamil voice found, try Indian English or default
                for voice in voices:
                    voice_id = voice.id.lower()
                    if 'india' in voice_id or 'in_in' in voice_id:
                        engine.setProperty('voice', voice.id)
                        _logger.info(f"Using Indian voice: {voice.id}")
                        break
                _logger.warning("No Tamil voice found. Download from: System Settings → Accessibility → Spoken Content → System Voices")
        
        # Set properties
        engine.setProperty('rate', 140)  # Slower for Tamil
        engine.setProperty('volume', 0.9)
        
        # Speak the text
        _logger.info(f"Speaking text (length={len(text)}, language={language})")
        engine.say(text)
        engine.runAndWait()
        _logger.info("Speech completed")
        
        return {
            "success": True,
            "engine": "pyttsx3",
            "language": language
        }
        
    except Exception as e:
        _logger.error(f"TTS speech error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def synthesise(
    lines: Iterable[str],
    model_id: str = "coqui-xtts-dq",
    root: str | Path | None = None,
    speaker: str | None = None,
) -> list[dict]:
    """Placeholder TTS generation with pyttsx3 fallback.

    Hook in Coqui XTTS or eSpeak in the future.
    """

    ensure_directories(root, identifiers=[model_id])
    artifact = locate_model(model_id, root=root)
    
    results = []
    for line in lines:
        # Use fallback TTS if available
        if _HAVE_PYTTSX3:
            results.append({
                "text": line,
                "audio_path": str((Path(artifact).parent / "preview.wav")),
                "speaker": speaker or "default",
                "engine": "pyttsx3"
            })
        else:
            results.append({
                "text": line,
                "audio_path": str((Path(artifact).parent / "preview.wav")),
                "speaker": speaker or "default",
                "error": "No TTS engine available"
            })
    
    return results
