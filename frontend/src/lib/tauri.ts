import { invoke } from '@tauri-apps/api/core'

import type {
  AuthResponse,
  BootstrapResponse,
  CurrentUserResponse,
  CopyAssetResponse,
  ModelInventoryItem,
  ProjectRecord,
  ProjectFileEntry,
  ProjectFilesResponse,
  SettingsPayload,
  LoadMarkdownResponse,
  TransliterationResponse,
  UserProfile,
} from '@/types'

export async function bootstrap(): Promise<BootstrapResponse> {
  const response = (await invoke('bootstrap')) as BootstrapResponse
  return {
    ...response,
    settings: normalizeSettings(response.settings),
    user: response.user,
  }
}

export async function createProject(payload: {
  name: string
  project_type: string
  languages: string[]
  template_id: string
  description?: string
}): Promise<ProjectRecord> {
  const response = (await invoke('create_project', { payload })) as {
    project: ProjectRecord
  }
  return response.project
}

export async function updateSettings(payload: SettingsPayload) {
  await invoke('update_settings', { payload })
}

export async function transliterate(text: string): Promise<string[]> {
  const response = (await invoke('transliterate_english_to_tamil', {
    payload: { text },
  })) as TransliterationResponse
  return response.candidates
}

export async function fetchModelInventory(): Promise<ModelInventoryItem[]> {
  const response = (await invoke('refresh_model_inventory')) as {
    models: ModelInventoryItem[]
  }
  return response.models
}

export async function listProjectFiles(projectId: string): Promise<ProjectFileEntry[]> {
  const response = (await invoke('list_project_files', {
    payload: { project_id: projectId },
  })) as ProjectFilesResponse
  return response.files
}

export async function loadMarkdownFile(projectId: string, filePath: string): Promise<string> {
  const response = (await invoke('load_markdown_file', {
    payload: { project_id: projectId, file_path: filePath },
  })) as LoadMarkdownResponse
  return response.content
}

export async function saveMarkdownFile(projectId: string, filePath: string, content: string) {
  await invoke('save_markdown_file', {
    payload: { project_id: projectId, file_path: filePath, content },
  })
}

export async function copyProjectAsset(
  projectId: string,
  source: string,
  targetDir?: string,
): Promise<string> {
  const response = (await invoke('copy_project_asset', {
    payload: {
      project_id: projectId,
      source,
      target_dir: targetDir,
    },
  })) as CopyAssetResponse
  return response.relative_path
}

export async function registerUser(payload: {
  email: string
  password: string
  display_name?: string
}): Promise<UserProfile> {
  const response = (await invoke('register_user', { payload })) as AuthResponse
  return response.user
}

export async function loginUser(payload: {
  email: string
  password: string
}): Promise<UserProfile> {
  const response = (await invoke('login_user', { payload })) as AuthResponse
  return response.user
}

export async function logoutUser(): Promise<void> {
  await invoke('logout_user')
}

export async function currentUser(): Promise<UserProfile | null> {
  const response = (await invoke('current_user')) as CurrentUserResponse
  return response.user
}

// AI Features

export interface TranscriptionResult {
  text: string
  success: boolean
  error?: string
}

export interface TTSResult {
  success: boolean
  error?: string
}

export interface AISceneResult {
  prompt: string
  response: string
  model_id: string
  error?: string | null
}

export async function transcribeAudioFile(
  audioPath: string,
  language: string = 'en-IN'
): Promise<TranscriptionResult> {
  try {
    const result = (await invoke('transcribe_audio_file', {
      audioPath,
      language,
    })) as TranscriptionResult
    return result
  } catch (error) {
    return {
      text: '',
      success: false,
      error: String(error),
    }
  }
}

export async function recordFromMicrophone(
  duration: number = 5,
  language: string = 'en-IN'
): Promise<TranscriptionResult> {
  try {
    const result = (await invoke('record_from_microphone', {
      duration,
      language,
    })) as TranscriptionResult
    return result
  } catch (error) {
    return {
      text: '',
      success: false,
      error: String(error),
    }
  }
}

export async function synthesizeSpeech(
  text: string,
  language: string = 'en'
): Promise<TTSResult> {
  try {
    const result = (await invoke('synthesize_speech', {
      text,
      language,
    })) as TTSResult
    return result
  } catch (error) {
    return {
      success: false,
      error: String(error),
    }
  }
}

export async function generateAIScene(
  prompt: string,
  context: string = '',
  apiKey?: string
): Promise<AISceneResult> {
  try {
    const result = (await invoke('generate_ai_scene', {
      prompt,
      context,
      apiKey,
    })) as AISceneResult
    return result
  } catch (error) {
    return {
      prompt,
      response: '',
      model_id: '',
      error: String(error),
    }
  }
}

function normalizeSettings(settings: SettingsPayload): SettingsPayload {
  const apiKeys: Record<string, string | undefined> = settings.api_keys ?? {}
  return { ...settings, api_keys: apiKeys }
}
