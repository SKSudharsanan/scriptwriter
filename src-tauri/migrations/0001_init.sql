CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  password_hash TEXT,
 created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  project_type TEXT NOT NULL,
  languages TEXT NOT NULL,
  description TEXT,
  template_id TEXT,
  base_path TEXT NOT NULL,
  metadata JSON,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  preferred_theme TEXT NOT NULL DEFAULT 'system',
  transliteration_mode TEXT NOT NULL DEFAULT 'phonetic',
  stt_model TEXT NOT NULL DEFAULT 'faster-whisper-base',
  tts_model TEXT NOT NULL DEFAULT 'coqui-xtts-dq',
  llm_model TEXT NOT NULL DEFAULT 'mistral-7b-q4km',
  api_keys JSON
);

INSERT INTO settings (id)
VALUES (1)
ON CONFLICT(id) DO NOTHING;
