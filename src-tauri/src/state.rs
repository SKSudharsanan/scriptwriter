use std::path::{Path, PathBuf};

use directories::ProjectDirs;
use once_cell::sync::OnceCell;
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use tokio::sync::RwLock;

use crate::{
    error::{AppError, AppResult},
    models::UserProfile,
};

static STORAGE_DIR: OnceCell<PathBuf> = OnceCell::new();
static MODELS_DIR: OnceCell<PathBuf> = OnceCell::new();

pub struct AppState {
    pub pool: SqlitePool,
    pub storage_root: PathBuf,
    pub models_root: PathBuf,
    pub session: RwLock<Option<UserProfile>>,
}

impl AppState {
    pub fn storage_root() -> &'static Path {
        STORAGE_DIR.get().expect("storage dir initialized")
    }

    pub fn models_root() -> &'static Path {
        MODELS_DIR.get().expect("models dir initialized")
    }

    pub async fn current_user(&self) -> Option<UserProfile> {
        self.session.read().await.clone()
    }

    pub async fn set_user(&self, user: Option<UserProfile>) {
        *self.session.write().await = user;
    }
}

pub async fn initialize_state() -> AppResult<AppState> {
    let dirs = ProjectDirs::from("com", "ScriptWriter", "ScriptWriter")
        .ok_or_else(|| AppError::Message("Unable to resolve project directories".into()))?;

    let data_dir = dirs.data_dir().to_path_buf();
    let models_dir = data_dir.join("models");
    let db_path = data_dir.join("scriptwriter.db");

    std::fs::create_dir_all(&data_dir)?;
    std::fs::create_dir_all(&models_dir)?;

    STORAGE_DIR
        .set(data_dir.clone())
        .map_err(|_| AppError::Message("Storage dir already initialized".into()))?;
    MODELS_DIR
        .set(models_dir.clone())
        .map_err(|_| AppError::Message("Models dir already initialized".into()))?;

    let connect_options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(connect_options).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(AppState {
        pool,
        storage_root: data_dir.to_path_buf(),
        models_root: models_dir,
        session: RwLock::new(None),
    })
}
