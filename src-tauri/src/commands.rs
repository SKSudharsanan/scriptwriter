use sanitize_filename::sanitize;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::auth::{hash_password, verify_password};
use crate::error::{AppError, AppResult};
use crate::filesystem::{
    assert_slug_unique, ensure_projects_root, ensure_template_scaffold, project_path,
    sanitize_slug, write_markdown_placeholder,
};
use crate::models::{
    default_models, default_templates, ProjectRecord, ProjectRow, ProjectTemplate, SettingsPayload,
    SettingsRow, UserProfile, UserRow,
};
use crate::state::AppState;

async fn require_session(state: &AppState) -> AppResult<UserProfile> {
    state.current_user().await.ok_or(AppError::Unauthorized)
}

async fn fetch_project_row(state: &AppState, project_id: &str) -> AppResult<ProjectRow> {
    let row = sqlx::query_as::<_, ProjectRow>(
        r#"
        SELECT id, name, slug, project_type, languages, description, template_id, base_path, created_at, updated_at
        FROM projects
        WHERE id = ?1
    "#,
    )
    .bind(project_id)
    .fetch_optional(&state.pool)
    .await?;

    row.ok_or_else(|| AppError::Message("Project not found".into()))
}

fn resolve_project_path(base: &Path, relative: &str) -> AppResult<PathBuf> {
    let trimmed = relative.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("File path cannot be empty".into()));
    }
    let normalized = trimmed.trim_start_matches(['/', '\\']);
    let relative_path = Path::new(normalized);
    if relative_path.is_absolute() {
        return Err(AppError::Message(
            "File path must be relative to the project".into(),
        ));
    }
    if relative_path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(AppError::Message(
            "File path cannot navigate upwards".into(),
        ));
    }
    Ok(base.join(relative_path))
}

fn to_relative_string(base: &Path, path: &Path) -> AppResult<String> {
    let relative = path
        .strip_prefix(base)
        .map_err(|_| AppError::Message("Path escapes project directory".into()))?;
    Ok(relative.to_string_lossy().replace(char::from('\\'), "/"))
}

#[derive(Debug, Serialize)]
pub struct ProjectFileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "is_directory")]
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ProjectFileEntry>>,
}

const MAX_TREE_DEPTH: usize = 8;

fn build_directory_entries(
    base: &Path,
    dir: &Path,
    depth: usize,
) -> AppResult<Vec<ProjectFileEntry>> {
    if depth > MAX_TREE_DEPTH {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    if !dir.exists() {
        return Ok(entries);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let is_dir = entry.file_type()?.is_dir();
        let relative = to_relative_string(base, &path)?;

        let children = if is_dir {
            let nested = build_directory_entries(base, &path, depth + 1)?;
            if nested.is_empty() {
                None
            } else {
                Some(nested)
            }
        } else {
            None
        };

        entries.push(ProjectFileEntry {
            name,
            path: relative,
            is_directory: is_dir,
            children,
        });
    }

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[derive(Debug, Serialize)]
pub struct BootstrapPayload {
    pub user: UserProfile,
    pub templates: Vec<ProjectTemplate>,
    pub model_options: serde_json::Value,
    pub settings: SettingsPayload,
    pub projects: Vec<ProjectRecord>,
}

#[tauri::command]
pub async fn bootstrap(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    bootstrap_inner(state).await.map_err(|err| err.to_string())
}

async fn bootstrap_inner(state: State<'_, AppState>) -> AppResult<BootstrapPayload> {
    let user = require_session(&state).await?;
    let templates = default_templates();
    let models = default_models();

    let settings_row = sqlx::query_as::<_, SettingsRow>(
        r#"
      SELECT preferred_theme, transliteration_mode, stt_model, tts_model, llm_model, api_keys
      FROM settings
      WHERE id = 1
    "#,
    )
    .fetch_one(&state.pool)
    .await?;

    let settings = SettingsPayload::try_from(settings_row)?;

    let rows = sqlx::query_as::<_, ProjectRow>(
    r#"
      SELECT id, name, slug, project_type, languages, description, template_id, base_path, created_at, updated_at
      FROM projects
      ORDER BY datetime(updated_at) DESC
    "#,
  )
  .fetch_all(&state.pool)
  .await?;

    let mut project_records = Vec::with_capacity(rows.len());
    for row in rows {
        project_records.push(ProjectRecord::try_from(row)?);
    }

    let mut stt_models = Vec::new();
    let mut tts_models = Vec::new();
    let mut llm_models = Vec::new();
    for model in models {
        match model.model_type {
            crate::models::ModelType::SpeechToText => stt_models.push(model),
            crate::models::ModelType::TextToSpeech => tts_models.push(model),
            crate::models::ModelType::LanguageModel => llm_models.push(model),
        }
    }

    Ok(BootstrapPayload {
        user,
        templates,
        model_options: json!({
          "speech_to_text": stt_models,
          "text_to_speech": tts_models,
          "language_models": llm_models,
        }),
        settings,
        projects: project_records,
    })
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub project_type: String,
    pub languages: Vec<String>,
    pub template_id: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateProjectResponse {
    pub project: ProjectRecord,
}

#[tauri::command]
pub async fn create_project(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateProjectRequest,
) -> Result<CreateProjectResponse, String> {
    create_project_inner(app, state, payload)
        .await
        .map_err(|err| err.to_string())
}

async fn create_project_inner(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateProjectRequest,
) -> AppResult<CreateProjectResponse> {
    let _user = require_session(&state).await?;
    let slug = sanitize_slug(&payload.name);

    let existing_slugs = sqlx::query("SELECT slug FROM projects")
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("slug").ok())
        .collect::<Vec<_>>();

    assert_slug_unique(&existing_slugs, &slug)?;

    let template = default_templates()
        .into_iter()
        .find(|t| t.id == payload.template_id)
        .ok_or_else(|| AppError::Message("Template not found".into()))?;

    let project_dir = project_path(&state.storage_root, &slug);
    ensure_projects_root(&state.storage_root)?;
    tokio::task::spawn_blocking({
    let template = template.clone();
    let project_dir = project_dir.clone();
    move || -> AppResult<()> {
      ensure_template_scaffold(&project_dir, &template)?;
      write_markdown_placeholder(
        &project_dir.join("README.md"),
        &template.title,
        "Start drafting your story here. Use the bilingual editor to keep Tamil and English drafts in sync.",
      )?;
      Ok(())
    }
  })
  .await
  .map_err(|err| AppError::Anyhow(err.into()))??;

    let new_id = crate::models::ProjectRecord::new_id();
    let languages_json = serde_json::to_string(&payload.languages)?;

    sqlx::query(
    r#"
      INSERT INTO projects (id, name, slug, project_type, languages, description, template_id, base_path)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    "#,
  )
  .bind(&new_id)
  .bind(&payload.name)
  .bind(&slug)
  .bind(&payload.project_type)
  .bind(languages_json)
  .bind(&payload.description)
  .bind(&payload.template_id)
  .bind(project_dir.to_string_lossy().to_string())
  .execute(&state.pool)
  .await?;

    let inserted_row = sqlx::query_as::<_, ProjectRow>(
    r#"
      SELECT id, name, slug, project_type, languages, description, template_id, base_path, created_at, updated_at
      FROM projects
      WHERE id = ?1
    "#,
  )
  .bind(&new_id)
  .fetch_one(&state.pool)
  .await?;

    let project = ProjectRecord::try_from(inserted_row)?;

    app.emit("project-created", &project)
        .map_err(|err| AppError::Anyhow(err.into()))?;

    Ok(CreateProjectResponse { project })
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub preferred_theme: String,
    pub transliteration_mode: String,
    pub stt_model: String,
    pub tts_model: String,
    pub llm_model: String,
    pub api_keys: Value,
}

#[derive(Debug, Serialize)]
pub struct UpdateSettingsResponse {
    pub settings: SettingsPayload,
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    payload: UpdateSettingsRequest,
) -> Result<UpdateSettingsResponse, String> {
    update_settings_inner(state, payload)
        .await
        .map_err(|err| err.to_string())
}

async fn update_settings_inner(
    state: State<'_, AppState>,
    payload: UpdateSettingsRequest,
) -> AppResult<UpdateSettingsResponse> {
    let _user = require_session(&state).await?;
    sqlx::query(
        r#"
      UPDATE settings
      SET preferred_theme = ?1,
          transliteration_mode = ?2,
          stt_model = ?3,
          tts_model = ?4,
          llm_model = ?5,
          api_keys = ?6,
          id = 1
      WHERE id = 1
    "#,
    )
    .bind(&payload.preferred_theme)
    .bind(&payload.transliteration_mode)
    .bind(&payload.stt_model)
    .bind(&payload.tts_model)
    .bind(&payload.llm_model)
    .bind(payload.api_keys.to_string())
    .execute(&state.pool)
    .await?;

    let settings_row = sqlx::query_as::<_, SettingsRow>(
        r#"
      SELECT preferred_theme, transliteration_mode, stt_model, tts_model, llm_model, api_keys
      FROM settings
      WHERE id = 1
    "#,
    )
    .fetch_one(&state.pool)
    .await?;

    let settings = SettingsPayload::try_from(settings_row)?;

    Ok(UpdateSettingsResponse { settings })
}

#[derive(Debug, Deserialize)]
pub struct TransliterationRequest {
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct TransliterationResponse {
    pub candidates: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListProjectFilesRequest {
    pub project_id: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectFilesResponse {
    pub files: Vec<ProjectFileEntry>,
}

#[derive(Debug, Deserialize)]
pub struct LoadMarkdownRequest {
    pub project_id: String,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
pub struct LoadMarkdownResponse {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveMarkdownRequest {
    pub project_id: String,
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SaveMarkdownResponse {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct CopyAssetRequest {
    pub project_id: String,
    pub source: String,
    pub target_dir: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CopyAssetResponse {
    pub relative_path: String,
}

#[tauri::command]
pub async fn transliterate_english_to_tamil(
    state: State<'_, AppState>,
    payload: TransliterationRequest,
) -> Result<TransliterationResponse, String> {
    let result = async {
        let _user = require_session(&state).await?;
        crate::ml_bridge::transliterate_english_to_tamil(&payload.text)
            .await
            .map(|candidates| TransliterationResponse { candidates })
    }
    .await;

    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn transcribe_audio_file(
    state: State<'_, AppState>,
    audio_path: String,
    language: Option<String>,
) -> Result<Value, String> {
    let lang = language.unwrap_or_else(|| "en-IN".to_string());
    let result = async {
        let _user = require_session(&state).await?;
        crate::ml_bridge::transcribe_audio_file(&audio_path, &lang).await
    }.await;
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn record_from_microphone(
    state: State<'_, AppState>,
    duration: Option<i32>,
    language: Option<String>,
) -> Result<Value, String> {
    let dur = duration.unwrap_or(5);
    let lang = language.unwrap_or_else(|| "en-IN".to_string());
    let result = async {
        let _user = require_session(&state).await?;
        crate::ml_bridge::record_and_transcribe(dur, &lang).await
    }.await;
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn synthesize_speech(
    state: State<'_, AppState>,
    text: String,
    language: Option<String>,
) -> Result<Value, String> {
    let _lang = language.unwrap_or_else(|| "en".to_string());
    let result = async {
        let _user = require_session(&state).await?;
        crate::ml_bridge::synthesize_speech(&text, None).await
    }.await;
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn generate_ai_scene(
    state: State<'_, AppState>,
    prompt: String,
    context: Option<String>,
    api_key: Option<String>,
) -> Result<Value, String> {
    let ctx = context.unwrap_or_default();
    let result = async {
        let _user = require_session(&state).await?;
        crate::ml_bridge::generate_scene_ai(&prompt, &ctx, api_key.as_deref()).await
    }.await;
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectRecord>, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }
    let rows = sqlx::query_as::<_, ProjectRow>(
    r#"
      SELECT id, name, slug, project_type, languages, description, template_id, base_path, created_at, updated_at
      FROM projects
      ORDER BY datetime(updated_at) DESC
    "#,
  )
  .fetch_all(&state.pool)
  .await
  .map_err(|err| err.to_string())?;

    let mut projects = Vec::with_capacity(rows.len());
    for row in rows {
        match ProjectRecord::try_from(row) {
            Ok(project) => projects.push(project),
            Err(err) => return Err(err.to_string()),
        }
    }

    Ok(projects)
}

#[derive(Debug, Serialize)]
pub struct ModelInventoryResponse {
    pub models: Vec<Value>,
}

#[tauri::command]
pub async fn refresh_model_inventory(
    state: State<'_, AppState>,
) -> Result<ModelInventoryResponse, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }
    crate::ml_bridge::fetch_model_inventory(&state.models_root)
        .await
        .map(|models| ModelInventoryResponse { models })
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn list_project_files(
    state: State<'_, AppState>,
    payload: ListProjectFilesRequest,
) -> Result<ProjectFilesResponse, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }

    let project_row = fetch_project_row(&state, &payload.project_id)
        .await
        .map_err(|err| err.to_string())?;
    let base_path = PathBuf::from(project_row.base_path);
    let entries =
        build_directory_entries(&base_path, &base_path, 0).map_err(|err| err.to_string())?;
    Ok(ProjectFilesResponse { files: entries })
}

#[tauri::command]
pub async fn load_markdown_file(
    state: State<'_, AppState>,
    payload: LoadMarkdownRequest,
) -> Result<LoadMarkdownResponse, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }

    let project_row = fetch_project_row(&state, &payload.project_id)
        .await
        .map_err(|err| err.to_string())?;
    let base_path = PathBuf::from(project_row.base_path);
    let target_path =
        resolve_project_path(&base_path, &payload.file_path).map_err(|err| err.to_string())?;

    let content = if target_path.exists() {
        fs::read_to_string(&target_path).map_err(|err| err.to_string())?
    } else {
        String::new()
    };

    Ok(LoadMarkdownResponse { content })
}

#[tauri::command]
pub async fn save_markdown_file(
    state: State<'_, AppState>,
    payload: SaveMarkdownRequest,
) -> Result<SaveMarkdownResponse, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }

    let project_row = fetch_project_row(&state, &payload.project_id)
        .await
        .map_err(|err| err.to_string())?;
    let base_path = PathBuf::from(project_row.base_path);
    let target_path =
        resolve_project_path(&base_path, &payload.file_path).map_err(|err| err.to_string())?;

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(&target_path, payload.content).map_err(|err| err.to_string())?;

    sqlx::query("UPDATE projects SET updated_at = datetime('now') WHERE id = ?1")
        .bind(&payload.project_id)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    let relative = to_relative_string(&base_path, &target_path).map_err(|err| err.to_string())?;

    Ok(SaveMarkdownResponse { path: relative })
}

#[tauri::command]
pub async fn copy_project_asset(
    state: State<'_, AppState>,
    payload: CopyAssetRequest,
) -> Result<CopyAssetResponse, String> {
    if let Err(err) = require_session(&state).await {
        return Err(err.to_string());
    }

    let project_row = fetch_project_row(&state, &payload.project_id)
        .await
        .map_err(|err| err.to_string())?;
    let base_path = PathBuf::from(project_row.base_path);

    let source_path = PathBuf::from(&payload.source);
    if !source_path.exists() {
        return Err(AppError::Message("Selected file does not exist".into()).to_string());
    }

    let target_dir_relative = payload.target_dir.unwrap_or_else(|| "assets/images".into());
    let target_dir =
        resolve_project_path(&base_path, &target_dir_relative).map_err(|err| err.to_string())?;
    fs::create_dir_all(&target_dir).map_err(|err| err.to_string())?;

    let original_name = source_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Message("Invalid source file".into()).to_string())?;
    let mut sanitized = sanitize(&original_name);
    if sanitized.is_empty() {
        sanitized = "asset".into();
    }

    let mut candidate = target_dir.join(&sanitized);
    if candidate.exists() {
        let mut counter = 1usize;
        let stem = candidate
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "asset".into());
        let extension = candidate
            .extension()
            .map(|ext| ext.to_string_lossy().to_string());

        loop {
            let new_name = if let Some(ext) = &extension {
                format!("{}-{}.{}", stem, counter, ext)
            } else {
                format!("{}-{}", stem, counter)
            };
            candidate = target_dir.join(&new_name);
            if !candidate.exists() {
                break;
            }
            counter += 1;
        }
    }

    fs::copy(&source_path, &candidate).map_err(|err| err.to_string())?;

    let relative = to_relative_string(&base_path, &candidate).map_err(|err| err.to_string())?;

    sqlx::query("UPDATE projects SET updated_at = datetime('now') WHERE id = ?1")
        .bind(&payload.project_id)
        .execute(&state.pool)
        .await
        .map_err(|err| err.to_string())?;

    Ok(CopyAssetResponse {
        relative_path: relative,
    })
}

#[derive(Debug, Deserialize)]
pub struct RegisterUserRequest {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginUserRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: UserProfile,
}

#[derive(Debug, Serialize)]
pub struct CurrentUserResponse {
    pub user: Option<UserProfile>,
}

#[tauri::command]
pub async fn register_user(
    state: State<'_, AppState>,
    payload: RegisterUserRequest,
) -> Result<AuthResponse, String> {
    register_user_inner(state, payload)
        .await
        .map_err(|err| err.to_string())
}

async fn register_user_inner(
    state: State<'_, AppState>,
    payload: RegisterUserRequest,
) -> AppResult<AuthResponse> {
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() {
        return Err(AppError::Message("Email is required".into()));
    }

    if payload.password.len() < 8 {
        return Err(AppError::Message(
            "Password must be at least 8 characters long".into(),
        ));
    }

    let existing = sqlx::query_scalar::<_, i64>(
        r#"
      SELECT 1 FROM users WHERE email = ?1 LIMIT 1
    "#,
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    if existing.is_some() {
        return Err(AppError::Message("Email already registered".into()));
    }

    let password_hash = hash_password(&payload.password)?;
    let user_id = Uuid::new_v4().to_string();
    let display_name = payload.display_name.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    sqlx::query(
        r#"
      INSERT INTO users (id, email, display_name, password_hash)
      VALUES (?1, ?2, ?3, ?4)
    "#,
    )
    .bind(&user_id)
    .bind(&email)
    .bind(&display_name)
    .bind(password_hash)
    .execute(&state.pool)
    .await?;

    let user_row = sqlx::query_as::<_, UserRow>(
        r#"
      SELECT id, email, display_name, password_hash, created_at, updated_at
      FROM users
      WHERE id = ?1
    "#,
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await?;

    let profile = user_row.into_profile();
    state.set_user(Some(profile.clone())).await;

    Ok(AuthResponse { user: profile })
}

#[tauri::command]
pub async fn login_user(
    state: State<'_, AppState>,
    payload: LoginUserRequest,
) -> Result<AuthResponse, String> {
    login_user_inner(state, payload)
        .await
        .map_err(|err| err.to_string())
}

async fn login_user_inner(
    state: State<'_, AppState>,
    payload: LoginUserRequest,
) -> AppResult<AuthResponse> {
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() {
        return Err(AppError::Message("Email is required".into()));
    }

    let user_row = sqlx::query_as::<_, UserRow>(
        r#"
      SELECT id, email, display_name, password_hash, created_at, updated_at
      FROM users
      WHERE email = ?1
    "#,
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    let user_row = user_row.ok_or(AppError::Unauthorized)?;

    verify_password(&payload.password, &user_row.password_hash)?;

    let profile = user_row.into_profile();
    state.set_user(Some(profile.clone())).await;

    Ok(AuthResponse { user: profile })
}

#[tauri::command]
pub async fn logout_user(state: State<'_, AppState>) -> Result<(), String> {
    state.set_user(None).await;
    Ok(())
}

#[tauri::command]
pub async fn current_user(state: State<'_, AppState>) -> Result<CurrentUserResponse, String> {
    let user = state.current_user().await;
    Ok(CurrentUserResponse { user })
}
