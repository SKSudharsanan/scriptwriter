"""Speech-to-text helpers with multiple backend support."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

from .models import ensure_directories, locate_model

_logger = logging.getLogger(__name__)

# Try to import speech recognition library
try:
    import speech_recognition as sr
    _HAVE_SR = True
except ImportError:
    _HAVE_SR = False
    _logger.warning("speech_recognition not installed. Install with: pip install SpeechRecognition")


def warmup(model_id: str, root: str | Path | None = None) -> None:
    """Ensure the requested model assets are present on disk."""

    ensure_directories(root, identifiers=[model_id])
    locate_model(model_id, root=root)
    # Actual loading is performed lazily by the runtime (mlx-whisper/faster-whisper).


def transcribe_audio_file(audio_path: str, language: str = "en-IN") -> dict:
    """
    Transcribe an audio file to text using speech_recognition library.
    
    Args:
        audio_path: Path to audio file (WAV, FLAC, etc.)
        language: Language code (e.g., 'en-IN', 'ta-IN')
    
    Returns:
        Dictionary with 'text', 'confidence', and optional 'error' keys
    """
    if not _HAVE_SR:
        return {
            "text": "",
            "confidence": 0.0,
            "error": "speech_recognition library not installed. Run: pip install SpeechRecognition pyaudio"
        }
    
    recognizer = sr.Recognizer()
    
    try:
        with sr.AudioFile(audio_path) as source:
            audio_data = recognizer.record(source)
            
        # Try Google Speech Recognition (free, no API key needed)
        try:
            text = recognizer.recognize_google(audio_data, language=language)
            return {
                "text": text,
                "confidence": 1.0,
                "engine": "google"
            }
        except sr.UnknownValueError:
            return {
                "text": "",
                "confidence": 0.0,
                "error": "Could not understand audio"
            }
        except sr.RequestError as e:
            _logger.error(f"Google Speech Recognition error: {e}")
            return {
                "text": "",
                "confidence": 0.0,
                "error": f"Service error: {e}"
            }
            
    except Exception as e:
        _logger.error(f"Audio transcription error: {e}")
        return {
            "text": "",
            "confidence": 0.0,
            "error": str(e)
        }


def transcribe_from_microphone(duration: int = 5, language: str = "en-IN") -> dict:
    """
    Record from microphone and transcribe in real-time.
    
    Args:
        duration: Maximum recording duration in seconds
        language: Language code (e.g., 'en-IN', 'ta-IN')
    
    Returns:
        Dictionary with transcription result
    """
    if not _HAVE_SR:
        return {
            "text": "",
            "success": False,
            "error": "speech_recognition library not installed. Run: pip install SpeechRecognition pyaudio"
        }
    
    recognizer = sr.Recognizer()
    
    try:
        with sr.Microphone() as source:
            _logger.info("Adjusting for ambient noise...")
            recognizer.adjust_for_ambient_noise(source, duration=1)
            
            _logger.info(f"Recording for up to {duration} seconds...")
            audio_data = recognizer.listen(source, timeout=duration, phrase_time_limit=duration)
            
        # Transcribe using Google Speech Recognition
        try:
            text = recognizer.recognize_google(audio_data, language=language)
            _logger.info(f"Transcribed: {text}")
            return {
                "text": text,
                "success": True,
                "confidence": 1.0,
                "engine": "google"
            }
        except sr.UnknownValueError:
            return {
                "text": "",
                "success": False,
                "confidence": 0.0,
                "error": "Could not understand audio. Please speak clearly."
            }
        except sr.RequestError as e:
            _logger.error(f"Google Speech Recognition error: {e}")
            return {
                "text": "",
                "success": False,
                "confidence": 0.0,
                "error": f"Service error: {str(e)}"
            }
            
    except OSError as e:
        # Microphone permission or hardware error
        _logger.error(f"Microphone access error: {e}")
        return {
            "text": "",
            "success": False,
            "confidence": 0.0,
            "error": f"Microphone access denied. Grant permissions in System Settings → Privacy → Microphone"
        }
    except Exception as e:
        _logger.error(f"Microphone recording error: {e}")
        return {
            "text": "",
            "success": False,
            "confidence": 0.0,
            "error": str(e)
        }


def batch_transcribe(
    audio_files: Iterable[Path],
    model_id: str = "faster-whisper-base",
    root: str | Path | None = None,
) -> list[dict]:
    """Placeholder batching implementation.

    Integrate Faster-Whisper or MLX here once models are downloaded. We return
    structured metadata so the Tauri layer can display progress.
    """

    warmup(model_id, root=root)
    return [
        {
            "file": str(path),
            "text": "",
            "language": "ta",
            "segments": [],
        }
        for path in audio_files
    ]
