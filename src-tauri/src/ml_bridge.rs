use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use log::{trace, warn};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
struct PythonTransliteration {
    candidates: Vec<String>,
    notes: Option<Vec<String>>,
}

pub async fn transliterate_english_to_tamil(input: &str) -> AppResult<Vec<String>> {
    if input.trim().is_empty() {
        return Ok(Vec::new());
    }

    let text = input.to_owned();
    let result = tokio::task::spawn_blocking(move || invoke_python_transliteration(&text)).await;

    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => {
            warn!("Python transliteration failed: {err}");
            Ok(fallback_transliteration(input))
        }
        Err(join_err) => {
            warn!("Failed to spawn python transliteration task: {join_err}");
            Ok(fallback_transliteration(input))
        }
    }
}

pub async fn transcribe_audio_file(audio_path: &str, language: &str) -> AppResult<Value> {
    let audio = audio_path.to_string();
    let lang = language.to_string();
    
    let result = tokio::task::spawn_blocking(move || {
        invoke_python_stt_file(&audio, &lang)
    }).await;
    
    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(err),
        Err(join_err) => Err(AppError::Anyhow(join_err.into())),
    }
}

pub async fn record_and_transcribe(duration: i32, language: &str) -> AppResult<Value> {
    let lang = language.to_string();
    
    let result = tokio::task::spawn_blocking(move || {
        invoke_python_stt_mic(duration, &lang)
    }).await;
    
    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(err),
        Err(join_err) => Err(AppError::Anyhow(join_err.into())),
    }
}

pub async fn synthesize_speech(text: &str, output_path: Option<&str>) -> AppResult<Value> {
    let txt = text.to_string();
    let out = output_path.map(|s| s.to_string());
    
    let result = tokio::task::spawn_blocking(move || {
        invoke_python_tts(&txt, out.as_deref())
    }).await;
    
    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(err),
        Err(join_err) => Err(AppError::Anyhow(join_err.into())),
    }
}

pub async fn generate_scene_ai(prompt: &str, context: &str, api_key: Option<&str>) -> AppResult<Value> {
    let pmt = prompt.to_string();
    let ctx = context.to_string();
    let key = api_key.map(|s| s.to_string());
    
    let result = tokio::task::spawn_blocking(move || {
        invoke_python_llm(&pmt, &ctx, key.as_deref())
    }).await;
    
    match result {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(err),
        Err(join_err) => Err(AppError::Anyhow(join_err.into())),
    }
}

pub async fn fetch_model_inventory(models_root: &Path) -> AppResult<Vec<Value>> {
    let root = models_root.to_path_buf();
    let result = tokio::task::spawn_blocking(move || python_model_inventory(&root)).await;
    match result {
        Ok(Ok(models)) => Ok(models),
        Ok(Err(err)) => Err(err),
        Err(join_err) => Err(AppError::Anyhow(join_err.into())),
    }
}

fn invoke_python_transliteration(text: &str) -> AppResult<Vec<String>> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    let mut command = Command::new(python);
    command
        .arg("-m")
        .arg("scriptwriter_ml.cli")
        .arg("transliterate")
        .arg("--stdin")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root);

    trace!("Invoking python transliteration via {:?}", command);

    let mut child = command
        .spawn()
        .map_err(|err| AppError::Anyhow(err.into()))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(text.as_bytes())?;
    }

    let output = child.wait_with_output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!(
            "Python CLI exited with status {}: {stderr}",
            output.status
        )));
    }

    let parsed: PythonTransliteration = serde_json::from_slice(&output.stdout)?;
    if let Some(notes) = parsed.notes.as_ref() {
        for note in notes {
            warn!("Python transliteration note: {note}");
        }
    }
    Ok(parsed.candidates)
}

fn python_model_inventory(models_root: &PathBuf) -> AppResult<Vec<Value>> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    let mut command = Command::new(python);
    command
        .arg("-m")
        .arg("scriptwriter_ml.cli")
        .arg("models")
        .arg("--root")
        .arg(models_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root);

    trace!("Checking model inventory via {:?}", command);

    let output = command.output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!(
            "Python CLI exited with status {}: {stderr}",
            output.status
        )));
    }

    #[derive(Deserialize)]
    struct PythonModelInventory {
        models: Vec<Value>,
    }

    let parsed: PythonModelInventory = serde_json::from_slice(&output.stdout)?;
    Ok(parsed.models)
}

fn locate_ml_root() -> AppResult<PathBuf> {
    let candidates = {
        let mut options = Vec::new();
        if let Ok(root) = std::env::var("SCRIPTWRITER_ML_ROOT") {
            options.push(PathBuf::from(root));
        }
        let mut search_dir = std::env::current_dir()?;
        for _ in 0..5 {
            options.push(search_dir.join("ml"));
            if !search_dir.pop() {
                break;
            }
        }
        options
    };

    for candidate in candidates {
        if candidate.join("scriptwriter_ml").exists() {
            return candidate
                .canonicalize()
                .map_err(|err| AppError::Anyhow(err.into()));
        }
    }

    Err(AppError::Message(
        "Unable to locate ML toolkit. Set SCRIPTWRITER_ML_ROOT to your ml directory".into(),
    ))
}

fn fallback_transliteration(text: &str) -> Vec<String> {
    vec![text.to_string()]
}

fn invoke_python_stt_file(audio_path: &str, language: &str) -> AppResult<Value> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    let output = Command::new(python)
        .arg("-m")
        .arg("scriptwriter_ml.cli")
        .arg("transcribe-file")
        .arg(audio_path)
        .arg("--language")
        .arg(language)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root)
        .output()
        .map_err(|err| AppError::Anyhow(err.into()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("Python STT failed: {stderr}")));
    }

    let result: Value = serde_json::from_slice(&output.stdout)?;
    Ok(result)
}

fn invoke_python_stt_mic(duration: i32, language: &str) -> AppResult<Value> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    let output = Command::new(python)
        .arg("-m")
        .arg("scriptwriter_ml.cli")
        .arg("transcribe-mic")
        .arg("--duration")
        .arg(duration.to_string())
        .arg("--language")
        .arg(language)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root)
        .output()
        .map_err(|err| AppError::Anyhow(err.into()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("Python STT failed: {stderr}")));
    }

    let result: Value = serde_json::from_slice(&output.stdout)?;
    Ok(result)
}

fn invoke_python_tts(text: &str, output_path: Option<&str>) -> AppResult<Value> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    let mut command = Command::new(python);
    command
        .arg("-m")
        .arg("scriptwriter_ml.cli")
        .arg("tts")
        .arg("--stdin");
    
    if let Some(output) = output_path {
        command.arg("--output").arg(output);
    }
    
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root);

    let mut child = command.spawn().map_err(|err| AppError::Anyhow(err.into()))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(text.as_bytes())?;
    }

    let output = child.wait_with_output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("Python TTS failed: {stderr}")));
    }

    let result: Value = serde_json::from_slice(&output.stdout)?;
    Ok(result)
}

fn invoke_python_llm(prompt: &str, context: &str, api_key: Option<&str>) -> AppResult<Value> {
    let ml_root = locate_ml_root()?;
    let python = std::env::var("SCRIPTWRITER_PYTHON").unwrap_or_else(|_| "python3".to_string());

    // Use Python inline script to call LLM
    let api_key_str = api_key.unwrap_or("");
    let python_script = format!(
        r#"
import json
import os
from scriptwriter_ml.llm import draft_scene

if "{}":
    os.environ["OPENROUTER_API_KEY"] = "{}"

result = draft_scene(
    prompt={},
    context={}
)

print(json.dumps({{
    "prompt": result.prompt,
    "response": result.response,
    "model_id": result.model_id,
    "error": result.error
}}, ensure_ascii=False))
"#,
        api_key_str.replace("\"", "\\\""),
        api_key_str.replace("\"", "\\\""),
        serde_json::to_string(prompt)?,
        serde_json::to_string(context)?
    );

    let output = Command::new(python)
        .arg("-c")
        .arg(&python_script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONPATH", &ml_root)
        .output()
        .map_err(|err| AppError::Anyhow(err.into()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Message(format!("Python LLM failed: {stderr}")));
    }

    let result: Value = serde_json::from_slice(&output.stdout)?;
    Ok(result)
}
