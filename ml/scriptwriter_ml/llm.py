"""Local LLM orchestration with cloud API fallback."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .models import ensure_directories, locate_model

_logger = logging.getLogger(__name__)

# Try to import requests for API calls
try:
    import requests
    _HAVE_REQUESTS = True
except ImportError:
    _HAVE_REQUESTS = False
    _logger.warning("requests not installed. Install with: pip install requests")

# Try to import llama-cpp-python for local inference
try:
    from llama_cpp import Llama
    _HAVE_LLAMA_CPP = True
except ImportError:
    _HAVE_LLAMA_CPP = False
    _logger.info("llama-cpp-python not installed. Local LLM will be unavailable. Install with: pip install llama-cpp-python")

# Try to import huggingface-hub for model downloads
try:
    from huggingface_hub import hf_hub_download
    _HAVE_HF_HUB = True
except ImportError:
    _HAVE_HF_HUB = False
    _logger.info("huggingface-hub not installed. Model downloads will be unavailable. Install with: pip install huggingface-hub")


@dataclass(slots=True)
class PromptResult:
    prompt: str
    response: str
    model_id: str
    error: Optional[str] = None


# Popular small models suitable for local inference
DEFAULT_LOCAL_MODELS = {
    # Tiny models (fast, good for testing)
    "llama-3.2-1b": {
        "repo": "bartowski/Llama-3.2-1B-Instruct-GGUF",
        "filename": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        "size_gb": 0.8,
    },
    "qwen-1.5b": {
        "repo": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "size_gb": 1.0,
    },
    # Small models (balanced)
    "llama-3.2-3b": {
        "repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "size_gb": 2.0,
    },
    "phi-3.5": {
        "repo": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "filename": "Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "size_gb": 2.5,
    },
}


def download_model(
    model_name: str = "llama-3.2-1b",
    root: str | Path | None = None,
) -> Path:
    """
    Download a local LLM model from HuggingFace.
    
    Args:
        model_name: Model identifier from DEFAULT_LOCAL_MODELS
        root: Root directory for models
        
    Returns:
        Path to downloaded model file
        
    Raises:
        ValueError: If model_name not recognized
        ImportError: If huggingface-hub not installed
    """
    if not _HAVE_HF_HUB:
        raise ImportError("huggingface-hub required for model downloads. Install with: pip install huggingface-hub")
    
    if model_name not in DEFAULT_LOCAL_MODELS:
        raise ValueError(f"Unknown model: {model_name}. Choose from: {list(DEFAULT_LOCAL_MODELS.keys())}")
    
    model_info = DEFAULT_LOCAL_MODELS[model_name]
    
    # Ensure models directory exists
    models_dir = Path(root) if root else Path.home() / ".cache" / "scriptwriter_ml" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    
    model_path = models_dir / model_info["filename"]
    
    if model_path.exists():
        _logger.info(f"Model already downloaded: {model_path}")
        return model_path
    
    _logger.info(f"Downloading {model_name} (~{model_info['size_gb']:.1f} GB)...")
    _logger.info(f"From: {model_info['repo']}")
    
    try:
        downloaded_path = hf_hub_download(
            repo_id=model_info["repo"],
            filename=model_info["filename"],
            cache_dir=models_dir.parent,
            resume_download=True,
        )
        
        # Create symlink for easier access
        if not model_path.exists():
            model_path.symlink_to(downloaded_path)
        
        _logger.info(f"Model downloaded: {model_path}")
        return Path(downloaded_path)
        
    except Exception as e:
        _logger.error(f"Failed to download model: {e}")
        raise


def _draft_scene_local(
    prompt: str,
    context: str,
    model_path: Path,
    max_tokens: int = 1000,
) -> PromptResult:
    """Generate scene using local llama.cpp model."""
    if not _HAVE_LLAMA_CPP:
        return PromptResult(
            prompt=prompt,
            response="",
            model_id=str(model_path.name),
            error="llama-cpp-python not installed. Install with: pip install llama-cpp-python"
        )
    
    try:
        _logger.info(f"Loading local model: {model_path.name}")
        
        # Initialize llama.cpp model
        # Use Metal on macOS, CUDA on Linux/Windows if available
        llm = Llama(
            model_path=str(model_path),
            n_ctx=4096,  # Context window
            n_threads=4,  # CPU threads
            n_gpu_layers=-1,  # Use GPU if available (-1 = all layers)
            verbose=False,
        )
        
        system_prompt = """You are a creative screenwriting assistant. Help write engaging scenes.
Focus on natural dialogue, clear descriptions, character development, and pacing.
Format in screenplay style."""
        
        user_message = f"Context:\n{context}\n\nPrompt:\n{prompt}" if context else prompt
        
        # Build chat messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        
        _logger.info(f"Generating scene (max_tokens={max_tokens})...")
        
        # Generate response
        response = llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.7,
            top_p=0.9,
            stop=["</scene>", "\n\nEND"],
        )
        
        generated_text = response["choices"][0]["message"]["content"]
        
        _logger.info(f"Generated {len(generated_text)} characters")
        
        return PromptResult(
            prompt=prompt,
            response=generated_text,
            model_id=str(model_path.name)
        )
        
    except Exception as e:
        _logger.error(f"Local LLM error: {e}")
        return PromptResult(
            prompt=prompt,
            response="",
            model_id=str(model_path.name),
            error=str(e)
        )


def draft_scene(
    prompt: str,
    model_id: str = "meta-llama/llama-3.1-8b-instruct:free",
    root: str | Path | None = None,
    api_key: Optional[str] = None,
    context: str = "",
    max_tokens: int = 1000,
    use_local: bool = True,  # NEW: Enable local fallback by default
) -> PromptResult:
    """
    Generate a scene using LLM with smart fallback:
    1. Try OpenRouter API if api_key provided
    2. Fall back to local llama.cpp model
    3. Return error if neither works
    
    Args:
        prompt: Scene prompt/instruction
        model_id: OpenRouter model ID or local model name
        root: Root directory for local models
        api_key: OpenRouter API key (optional)
        context: Additional context for generation
        max_tokens: Maximum tokens to generate
        use_local: Enable local model fallback
    
    Returns:
        PromptResult with generated text or error
    """
    # Try cloud API first if we have an API key
    if _HAVE_REQUESTS and (api_key or os.getenv("OPENROUTER_API_KEY")):
        _logger.info("Trying OpenRouter API...")
        result = _draft_scene_api(prompt, model_id, api_key, context, max_tokens)
        if result.response:
            return result
        _logger.warning(f"API failed: {result.error}")
    
    # Fall back to local model if enabled
    if use_local and _HAVE_LLAMA_CPP:
        _logger.info("Falling back to local LLM...")
        
        # Determine which local model to use
        local_model_name = "llama-3.2-1b"  # Default to smallest/fastest
        
        # Check if a local model is already downloaded
        models_dir = Path(root) if root else Path.home() / ".cache" / "scriptwriter_ml" / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        
        # Find any existing .gguf models
        existing_models = list(models_dir.glob("*.gguf"))
        
        if existing_models:
            model_path = existing_models[0]
            _logger.info(f"Using existing model: {model_path.name}")
        else:
            # Try to download default model
            _logger.info(f"No local model found, downloading {local_model_name}...")
            try:
                model_path = download_model(local_model_name, root)
            except Exception as e:
                _logger.error(f"Failed to download model: {e}")
                return PromptResult(
                    prompt=prompt,
                    response="",
                    model_id=model_id,
                    error=f"No local model available and download failed: {e}. Set OPENROUTER_API_KEY for cloud generation."
                )
        
        # Generate with local model
        return _draft_scene_local(prompt, context, model_path, max_tokens)
    
    # No options available
    error_msg = []
    if not _HAVE_REQUESTS:
        error_msg.append("requests library not installed")
    if not api_key and not os.getenv("OPENROUTER_API_KEY"):
        error_msg.append("no API key provided")
    if not use_local:
        error_msg.append("local model disabled")
    elif not _HAVE_LLAMA_CPP:
        error_msg.append("llama-cpp-python not installed")
    
    return PromptResult(
        prompt=prompt,
        response="",
        model_id=model_id,
        error=f"LLM generation failed: {'; '.join(error_msg)}. Install dependencies or set OPENROUTER_API_KEY."
    )


def _draft_scene_api(
    prompt: str,
    model: str,
    api_key: Optional[str],
    context: str,
    max_tokens: int,
) -> PromptResult:
    """Generate scene using OpenRouter API."""
    key = api_key or os.getenv("OPENROUTER_API_KEY")
    if not key:
        return PromptResult(
            prompt=prompt,
            response="",
            model_id=model,
            error="No API key. Set OPENROUTER_API_KEY environment variable."
        )
    
    system_prompt = """You are a creative screenwriting assistant. Help write engaging scenes.
Focus on natural dialogue, clear descriptions, character development, and pacing.
Format in screenplay style."""
    
    user_message = f"Context:\n{context}\n\nPrompt:\n{prompt}" if context else prompt
    
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                "max_tokens": max_tokens,
                "temperature": 0.7,
            },
            timeout=30,
        )
        
        response.raise_for_status()
        data = response.json()
        generated_text = data["choices"][0]["message"]["content"]
        
        return PromptResult(
            prompt=prompt,
            response=generated_text,
            model_id=model
        )
        
    except Exception as e:
        _logger.error(f"LLM API error: {e}")
        return PromptResult(
            prompt=prompt,
            response="",
            model_id=model,
            error=str(e)
        )
