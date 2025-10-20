use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::models::ProjectTemplate;

pub fn ensure_template_scaffold(root: &Path, template: &ProjectTemplate) -> AppResult<()> {
    for relative in template.directory_structure {
        let path = root.join(relative);
        fs::create_dir_all(&path)?;
    }
    Ok(())
}

pub fn project_path(storage_root: &Path, slug: &str) -> PathBuf {
    storage_root.join("projects").join(slug)
}

pub fn ensure_projects_root(storage_root: &Path) -> AppResult<PathBuf> {
    let projects_root = storage_root.join("projects");
    fs::create_dir_all(&projects_root)?;
    Ok(projects_root)
}

pub fn write_markdown_placeholder(path: &Path, heading: &str, body: &str) -> AppResult<()> {
    if path.exists() {
        return Ok(());
    }

    let content = format!("# {heading}\n\n{body}\n");
    fs::write(path, content)?;
    Ok(())
}

pub fn sanitize_slug(name: &str) -> String {
    name.chars()
        .map(|ch| match ch {
            'a'..='z' | '0'..='9' => ch,
            'A'..='Z' => ch.to_ascii_lowercase(),
            _ => '-',
        })
        .collect::<String>()
        .trim_matches('-')
        .replace("--", "-")
}

pub fn assert_slug_unique(existing: &[String], slug: &str) -> AppResult<()> {
    if existing.iter().any(|candidate| candidate == slug) {
        Err(AppError::Message(format!(
            "A project with slug '{slug}' already exists"
        )))
    } else {
        Ok(())
    }
}
