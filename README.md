# ScriptWriter Studio

Desktop-first Tauri application for multilingual script writing with Tamil transliteration, offline speech pipelines, and template-driven project scaffolding.

## Quick Start

```bash
# 1. Install dependencies
cd frontend && npm install && cd ..
cd ml && python3 -m venv .venv && source .venv/bin/activate && pip install -e . && pip install indic-transliteration && cd ..

# 2. Run the development server (use the helper script)
./run-dev.sh

# OR manually:
export SCRIPTWRITER_PYTHON="$(pwd)/ml/.venv/bin/python3"
cargo tauri dev
```

**⚠️ Important:** You must set the `SCRIPTWRITER_PYTHON` environment variable to point to the Python virtual environment for transliteration to work. The `run-dev.sh` script does this automatically.

## Feature Status

See [FEATURES.md](./FEATURES.md) for a detailed breakdown of working vs. not-yet-implemented features.

**Working now:**
- ✅ Transliteration (English → Tamil) with inline suggestions
- ✅ Voice typing with Tamil speech recognition (`ta-IN`)
- ✅ Read Aloud with auto-detection for Tamil/English
- ✅ AI Scene Generation with cloud (OpenRouter) and local (llama.cpp) fallback
- ✅ Project management and Markdown editing
- ✅ File organization and image attachments
- ✅ User authentication and session management

**Local AI Features:**
- ✅ Local LLM with llama.cpp (works offline, no API key needed)
- ✅ Model download CLI commands
- ✅ Smart fallback: Cloud API → Local model → Error
- See [LOCAL_LLM_SETUP.md](LOCAL_LLM_SETUP.md) for setup instructions

## Getting started

1. **Install prerequisites**
   - Node.js ≥ 20.19.0 (upgrade from the bundled 20.16.0 to silence Vite warnings)
   - Rust toolchain (stable) with `cargo-tauri`
   - Python ≥ 3.10 with virtualenv support
2. **Install JavaScript dependencies**
   ```bash
   cd frontend
   npm install
   ```
3. **Bootstrap the Python ML toolkit**
python version should be 3.11
   ```bash
   cd ml
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -e '.[transliteration,stt,tts,llm]'
   
   # Install audio features
   pip install SpeechRecognition pyttsx3 pyaudio
   
   # Optional: Install local LLM for offline AI generation
   CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python huggingface-hub
   
   # Optional: Download a local model
   python -m scriptwriter_ml.cli llm-download llama-3.2-1b
   ```
   
   The CLI entry point `scriptwriter-cli` is exposed by the editable install. For local AI setup, see [LOCAL_LLM_SETUP.md](LOCAL_LLM_SETUP.md).
4. **Run the Tauri app**
   ```bash
   cd ..
   cargo tauri dev
   ```

## Key capabilities

- **Project scaffolding** – SQLite-backed project catalog with default templates for feature films, short films, YouTube scripts, and podcasts. Selecting a template creates a directory tree inside the app data folder and seeds a Markdown README.
- **Settings + inventory** – Persistent model preferences (STT, TTS, LLM) stored in SQLite. Model inventory is queried through the Python CLI so you can track downloaded assets in `~/Library/Application Support/ScriptWriter/models` (macOS). Configure optional API keys for remote providers (Granite, OpenRouter, etc.).
- **English → Tamil transliteration** – Debounced bridge from the React editor to the Python toolkit (`scriptwriter_ml.transliteration`). Uses `indic-transliteration` when installed; falls back to a lightweight mapper with helpful warnings. Tauri command: `transliterate_english_to_tamil`.
- **Model orchestration hooks** – Python package exposes scaffolds for STT (`faster-whisper` / `mlx-whisper`), TTS (Coqui XTTS + eSpeak), and LLM (llama.cpp / MLX). The Rust bridge currently handles inventory discovery and transliteration; STT/TTS execution points are ready to be wired in.
- **Theme + UI shell** – Tailwind + shadcn foundations with ThemeProvider for light/dark modes, Markdown-ready layout, and lucide icons.

## File structure

- `frontend/` – React + Vite UI with Tailwind tokens, model settings panels, and transliteration pad.
- `src-tauri/` – Tauri backend with SQLx (SQLite), filesystem utilities, and Python bridge commands.
- `ml/` – Python toolkit (`scriptwriter_ml`) providing transliteration, model registry, and placeholders for STT/TTS/LLM workflows.
- `src-tauri/migrations/` – SQLx migrations for users, projects, scripts, and settings tables.

## Extending the ML stack

- **Speech-to-text**: ✅ Implemented with Google Speech Recognition (online). Tamil and English supported. Uses `scriptwriter_ml.stt` module.
- **Text-to-speech**: ✅ Implemented with pyttsx3. Auto-detects Tamil/English. Uses `scriptwriter_ml.tts` module.
- **Local LLM**: ✅ Implemented with llama.cpp. Smart fallback from OpenRouter API to local models. See [LOCAL_LLM_SETUP.md](LOCAL_LLM_SETUP.md) for:
  - Model download instructions
  - Performance benchmarks
  - CLI usage examples
  - Python API documentation

## Known gaps & next steps

1. Wire the `Refresh` button in the header to provide feedback while reloading the workspace.
2. Add authentication shell (SQLite users table is ready) with password hashing and session guard.
3. Replace fallback transliteration with a richer Tamil phonetic mapping for offline usage.
4. Implement model downloads (e.g., HuggingFace HTTP fetch) and progress reporting inside `scriptwriter_ml.models`.
5. Add Markdown editor (Milkdown/Tiptap) and workspace routing to open actual script files inside each project folder.
6. Harden error states for Python invocation (surface Toast notifications instead of `window.alert`).
