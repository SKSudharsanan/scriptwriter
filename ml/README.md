# ScriptWriter ML Toolkit

Local-first Python utilities that power transliteration, speech pipelines, and quantised LLM helpers for the ScriptWriter desktop app.

## Installation

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[transliteration,stt,tts,llm]
```

### Optional dependencies

- `transliteration`: English → Tamil phonetic keyboard powered by `indic-transliteration`
- `stt`: Faster-Whisper + MLX optimised builds
- `tts`: Coqui XTTS and eSpeak NG fallback
- `llm`: llama.cpp / MLX bindings for local instruction models

## CLI Usage

```bash
scriptwriter-cli transliterate --text "vanakkam" --mode tamil
```

When run without `--text`, the CLI reads from STDIN allowing rich text payloads from the Tauri bridge.
