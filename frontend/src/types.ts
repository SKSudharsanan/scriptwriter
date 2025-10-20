export type ProjectTemplate = {
  id: string
  title: string
  description: string
  languages: string[]
  directory_structure: string[]
  metadata?: {
    default_markdown?: string
    [key: string]: unknown
  }
}

export type ModelOption = {
  id: string
  model_type: 'speech_to_text' | 'text_to_speech' | 'language_model'
  title: string
  description: string
  provider: string
  size_mb: number
  supports_mlx: boolean
  requires_gpu: boolean
}

export type SettingsPayload = {
  preferred_theme: string
  transliteration_mode: string
  stt_model: string
  tts_model: string
  llm_model: string
  api_keys: Record<string, string | undefined> | null
}

export type ProjectRecord = {
  id: string
  name: string
  slug: string
  project_type: string
  languages: string[]
  description?: string | null
  template_id?: string | null
  base_path: string
  created_at: string
  updated_at: string
}

export type ModelInventoryItem = {
  identifier: string
  model_type: string
  title: string
  provider: string
  size_mb: number
  filename: string
  supports_mlx: boolean
  requires_gpu: boolean
  path: string | null
  downloaded: boolean
  folder: string
}

export type BootstrapResponse = {
  user: UserProfile
  templates: ProjectTemplate[]
  model_options: {
    speech_to_text: ModelOption[]
    text_to_speech: ModelOption[]
    language_models: ModelOption[]
  }
  settings: SettingsPayload
  projects: ProjectRecord[]
}

export type AuthResponse = {
  user: UserProfile
}

export type CurrentUserResponse = {
  user: UserProfile | null
}

export type TransliterationResponse = {
  candidates: string[]
}

export type ProjectFileEntry = {
  name: string
  path: string
  is_directory: boolean
  children?: ProjectFileEntry[]
}

export type ProjectFilesResponse = {
  files: ProjectFileEntry[]
}

export type LoadMarkdownResponse = {
  content: string
}

export type SaveMarkdownResponse = {
  path: string
}

export type CopyAssetResponse = {
  relative_path: string
}
export type UserProfile = {
  id: string
  email: string
  display_name: string | null
  created_at: string
}
