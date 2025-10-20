"""Model registry and status helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass(slots=True)
class ModelSpec:
    identifier: str
    model_type: str
    title: str
    provider: str
    size_mb: int
    filename: str
    supports_mlx: bool = False
    requires_gpu: bool = False


MODEL_REGISTRY: list[ModelSpec] = [
    ModelSpec(
        identifier="faster-whisper-base",
        model_type="speech_to_text",
        title="Faster-Whisper Base",
        provider="OpenAI/Whisper",
        size_mb=140,
        filename="faster-whisper-base.gguf",
        supports_mlx=True,
    ),
    ModelSpec(
        identifier="faster-whisper-small",
        model_type="speech_to_text",
        title="Faster-Whisper Small",
        provider="OpenAI/Whisper",
        size_mb=240,
        filename="faster-whisper-small.gguf",
        supports_mlx=True,
    ),
    ModelSpec(
        identifier="coqui-xtts-dq",
        model_type="text_to_speech",
        title="Coqui XTTS Distilled Quantized",
        provider="Coqui",
        size_mb=400,
        filename="coqui-xtts-dq.pth",
    ),
    ModelSpec(
        identifier="espeak-ng-tamil",
        model_type="text_to_speech",
        title="eSpeak NG Tamil",
        provider="eSpeak-NG",
        size_mb=20,
        filename="espeak-ng-tamil.tar.gz",
    ),
    ModelSpec(
        identifier="mistral-7b-q4km",
        model_type="language_model",
        title="Mistral 7B Q4_K_M",
        provider="Mistral AI",
        size_mb=4100,
        filename="mistral-7b-q4km.gguf",
    ),
    ModelSpec(
        identifier="phi-2-int4",
        model_type="language_model",
        title="Phi-2 Int4",
        provider="Microsoft",
        size_mb=1800,
        filename="phi-2-int4.gguf",
    ),
    ModelSpec(
        identifier="ibm-granite-7b-slim",
        model_type="language_model",
        title="IBM Granite 7B Slim",
        provider="IBM",
        size_mb=3200,
        filename="ibm-granite-7b-slim.gguf",
        supports_mlx=True,
    ),
]


def _resolve_root(root: str | Path | None) -> Path:
    if root is None:
        root = Path.home() / "ScriptWriter" / "models"
    else:
        root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def describe_models(root: str | Path | None = None) -> list[dict]:
    base = _resolve_root(root)
    records: list[dict] = []
    for spec in MODEL_REGISTRY:
        candidate = base / spec.identifier / spec.filename
        records.append(
            {
                **asdict(spec),
                "path": str(candidate) if candidate.exists() else None,
                "downloaded": candidate.exists(),
                "folder": str((base / spec.identifier)),
            }
        )
    return records


def locate_model(identifier: str, root: str | Path | None = None) -> Path:
    base = _resolve_root(root)
    spec = next((spec for spec in MODEL_REGISTRY if spec.identifier == identifier), None)
    if spec is None:
        raise KeyError(f"Unknown model id: {identifier}")
    return base / spec.identifier / spec.filename


def ensure_directories(root: str | Path | None = None, identifiers: Iterable[str] | None = None) -> None:
    base = _resolve_root(root)
    for spec in MODEL_REGISTRY:
        if identifiers is not None and spec.identifier not in identifiers:
            continue
        (base / spec.identifier).mkdir(parents=True, exist_ok=True)
