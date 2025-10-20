"""Lightweight CLI for interacting with the ML toolkit."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .models import describe_models
from .transliteration import transliterate_tamil
from .stt import transcribe_audio_file, transcribe_from_microphone
from .tts import synthesize_to_file, speak_text
from .llm import draft_scene, download_model, DEFAULT_LOCAL_MODELS


def _transliterate_command(args: argparse.Namespace) -> dict[str, Any]:
    text = args.text
    if args.stdin or text is None:
        text = sys.stdin.read()
    result = transliterate_tamil(text=text, scheme=args.scheme)
    return {
        "candidates": result.candidates,
        "engine": result.engine,
        "notes": result.notes,
    }


def _transcribe_audio_command(args: argparse.Namespace) -> dict[str, Any]:
    """Transcribe an audio file to text."""
    result = transcribe_audio_file(args.audio_file, language=args.language)
    return result


def _transcribe_mic_command(args: argparse.Namespace) -> dict[str, Any]:
    """Record from microphone and transcribe."""
    result = transcribe_from_microphone(duration=args.duration, language=args.language)
    return result


def _tts_command(args: argparse.Namespace) -> dict[str, Any]:
    """Convert text to speech."""
    text = args.text
    if args.stdin or text is None:
        text = sys.stdin.read()
    
    if args.output:
        result = synthesize_to_file(text, args.output, language=args.language)
    else:
        result = speak_text(text, language=args.language)
    
    return result


def _llm_generate_command(args: argparse.Namespace) -> dict[str, Any]:
    """Generate scene using LLM."""
    prompt = args.prompt
    if args.stdin or prompt is None:
        prompt = sys.stdin.read()
    
    result = draft_scene(
        prompt=prompt,
        context=args.context or "",
        max_tokens=args.max_tokens,
        use_local=not args.no_local,
    )
    
    return {
        "prompt": result.prompt,
        "response": result.response,
        "model_id": result.model_id,
        "success": bool(result.response),
        "error": result.error,
    }


def _llm_download_command(args: argparse.Namespace) -> dict[str, Any]:
    """Download a local LLM model."""
    try:
        model_path = download_model(args.model, root=args.root)
        return {
            "success": True,
            "model": args.model,
            "path": str(model_path),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def _llm_list_command(args: argparse.Namespace) -> dict[str, Any]:
    """List available local models."""
    return {
        "available_models": DEFAULT_LOCAL_MODELS,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="scriptwriter-cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Transliteration
    translit = subparsers.add_parser("transliterate", help="Transliterate to Tamil")
    translit.add_argument("--text", help="Text to transliterate")
    translit.add_argument("--scheme", default="itrans", help="Input phonetic scheme")
    translit.add_argument(
        "--stdin",
        action="store_true",
        help="Read text payload from STDIN instead of --text",
    )
    translit.set_defaults(func=_transliterate_command)

    # Speech-to-Text from file
    stt_file = subparsers.add_parser("transcribe-file", help="Transcribe audio file to text")
    stt_file.add_argument("audio_file", help="Path to audio file (WAV, FLAC, etc.)")
    stt_file.add_argument("--language", default="en-IN", help="Language code (e.g., en-IN, ta-IN)")
    stt_file.set_defaults(func=_transcribe_audio_command)

    # Speech-to-Text from microphone
    stt_mic = subparsers.add_parser("transcribe-mic", help="Record from microphone and transcribe")
    stt_mic.add_argument("--duration", type=int, default=5, help="Recording duration in seconds")
    stt_mic.add_argument("--language", default="en-IN", help="Language code (e.g., en-IN, ta-IN)")
    stt_mic.set_defaults(func=_transcribe_mic_command)

    # Text-to-Speech
    tts = subparsers.add_parser("tts", help="Convert text to speech")
    tts.add_argument("--text", help="Text to synthesize")
    tts.add_argument("--stdin", action="store_true", help="Read text from STDIN")
    tts.add_argument("--output", help="Output audio file path (if not provided, speaks immediately)")
    tts.add_argument("--language", default="en", help="Language code")
    tts.set_defaults(func=_tts_command)

    # Model inventory
    models = subparsers.add_parser("models", help="Inspect local model assets")
    models.add_argument("--root", help="Override model storage root")
    models.set_defaults(func=lambda args: {"models": describe_models(root=args.root)})

    # LLM: Generate scene
    llm_gen = subparsers.add_parser("llm-generate", help="Generate scene using LLM")
    llm_gen.add_argument("--prompt", help="Scene generation prompt")
    llm_gen.add_argument("--stdin", action="store_true", help="Read prompt from STDIN")
    llm_gen.add_argument("--context", default="", help="Additional context for generation")
    llm_gen.add_argument("--max-tokens", type=int, default=1000, help="Maximum tokens to generate")
    llm_gen.add_argument("--no-local", action="store_true", help="Disable local model fallback")
    llm_gen.set_defaults(func=_llm_generate_command)

    # LLM: Download model
    llm_dl = subparsers.add_parser("llm-download", help="Download a local LLM model")
    llm_dl.add_argument("model", choices=list(DEFAULT_LOCAL_MODELS.keys()), help="Model to download")
    llm_dl.add_argument("--root", help="Override model storage root")
    llm_dl.set_defaults(func=_llm_download_command)

    # LLM: List models
    llm_list = subparsers.add_parser("llm-list", help="List available local models")
    llm_list.set_defaults(func=_llm_list_command)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    data = args.func(args)
    json.dump(data, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":  # pragma: no cover
    main()
