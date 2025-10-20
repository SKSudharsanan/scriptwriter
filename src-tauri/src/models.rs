use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

const FEATURE_FILM_DEFAULT: &str = r"# Feature Film Script

## Act I
- Opening Image
- Catalyst
- Debate

## Act II
- Fun & Games
- Midpoint
- Bad Guys Close In
- All Is Lost

## Act III
- Finale
- Final Image
";

const SHORT_FILM_DEFAULT: &str = r"# Short Film Draft

## Hook
- Set the tone and introduce your protagonist.

## Conflict
- Explain the central dilemma.

## Twist
- Reveal the turning point.

## Resolution
- Finish with emotional impact.
";

const YOUTUBE_DEFAULT: &str = r"# YouTube Script

## Hook
- Grab attention in the first few seconds.

## Credibility
- Introduce yourself and establish trust.

## Value Stack
- Share the main points or lessons.

## Call To Action
- Invite viewers to like, subscribe, or act.
";

const PODCAST_DEFAULT: &str = r"# Podcast Episode

## Intro
- Welcome listeners and tease the topic.

## Main Story
- Outline the key beats of the discussion.

## Guest Insights
- Capture memorable quotes or takeaways.

## Outro
- Wrap up and preview what's next.
";

#[derive(Clone, Debug, Serialize)]
pub struct ProjectTemplate {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub languages: &'static [&'static str],
    pub directory_structure: &'static [&'static str],
    pub metadata: serde_json::Value,
}

pub fn default_templates() -> Vec<ProjectTemplate> {
    vec![
        ProjectTemplate {
            id: "feature-film",
            title: "Feature Film",
            description: "Three-act structure with bilingual drafts and breakdowns",
            languages: &["ta", "en"],
            directory_structure: &[
                "drafts/tamil",
                "drafts/english",
                "research/references",
                "audio/table-reads",
                "exports",
            ],
            metadata: json!({
                "default_markdown": FEATURE_FILM_DEFAULT,
                "acts": [
                    {"name": "Act I", "beats": ["Opening Image", "Catalyst", "Debate"]},
                    {"name": "Act II", "beats": ["Fun & Games", "Midpoint", "Bad Guys Close In"]},
                    {"name": "Act III", "beats": ["Finale", "Final Image"]}
                ]
            }),
        },
        ProjectTemplate {
            id: "short-film",
            title: "Short Film",
            description: "Compact storytelling with quick iteration scenes",
            languages: &["ta"],
            directory_structure: &["drafts/tamil", "references", "audio/voice-notes", "exports"],
            metadata: json!({
                "default_markdown": SHORT_FILM_DEFAULT,
                "outline": ["Hook", "Conflict", "Twist", "Resolution"]
            }),
        },
        ProjectTemplate {
            id: "youtube-script",
            title: "YouTube Script",
            description: "Hook-value-CTA framework optimized for retention",
            languages: &["en", "ta"],
            directory_structure: &[
                "drafts/english",
                "drafts/tamil",
                "b-roll",
                "assets/thumbnails",
                "exports",
            ],
            metadata: json!({
                "default_markdown": YOUTUBE_DEFAULT,
                "sections": ["Hook", "Credibility", "Value Stack", "CTA"]
            }),
        },
        ProjectTemplate {
            id: "podcast-episode",
            title: "Podcast Episode",
            description: "Conversational flow with bilingual intro/outro blocks",
            languages: &["ta", "en"],
            directory_structure: &[
                "drafts",
                "research",
                "audio/raw",
                "audio/processed",
                "exports",
            ],
            metadata: json!({
                "default_markdown": PODCAST_DEFAULT,
                "segments": ["Intro", "Main Story", "Guest Insights", "Outro"]
            }),
        },
    ]
}

#[derive(Clone, Debug, Serialize)]
pub struct ModelOption {
    pub id: &'static str,
    pub model_type: ModelType,
    pub title: &'static str,
    pub description: &'static str,
    pub provider: &'static str,
    pub size_mb: u32,
    pub supports_mlx: bool,
    pub requires_gpu: bool,
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelType {
    SpeechToText,
    TextToSpeech,
    LanguageModel,
}

pub fn default_models() -> Vec<ModelOption> {
    vec![
        ModelOption {
            id: "faster-whisper-base",
            model_type: ModelType::SpeechToText,
            title: "Faster-Whisper Base",
            description: "Multilingual 140 MB model, int8 quantized, great on M-series MLX",
            provider: "OpenAI/Whisper",
            size_mb: 140,
            supports_mlx: true,
            requires_gpu: false,
        },
        ModelOption {
            id: "faster-whisper-small",
            model_type: ModelType::SpeechToText,
            title: "Faster-Whisper Small",
            description: "Higher Tamil accuracy, 240 MB, benefits from GPU/ANE acceleration",
            provider: "OpenAI/Whisper",
            size_mb: 240,
            supports_mlx: true,
            requires_gpu: false,
        },
        ModelOption {
            id: "coqui-xtts-dq",
            model_type: ModelType::TextToSpeech,
            title: "Coqui XTTS Distilled Quantized",
            description: "Cross-lingual TTS with voice cloning, ~400 MB footprint",
            provider: "Coqui",
            size_mb: 400,
            supports_mlx: false,
            requires_gpu: false,
        },
        ModelOption {
            id: "espeak-ng-tamil",
            model_type: ModelType::TextToSpeech,
            title: "eSpeak NG Tamil",
            description: "Lightweight fallback synthesizer for previews, <20 MB",
            provider: "eSpeak-NG",
            size_mb: 20,
            supports_mlx: false,
            requires_gpu: false,
        },
        ModelOption {
            id: "mistral-7b-q4km",
            model_type: ModelType::LanguageModel,
            title: "Mistral 7B Instruct Q4_K_M",
            description: "Balanced creative writing assistant, ~4 GB RAM footprint",
            provider: "Mistral AI",
            size_mb: 4100,
            supports_mlx: false,
            requires_gpu: false,
        },
        ModelOption {
            id: "phi-2-int4",
            model_type: ModelType::LanguageModel,
            title: "Phi-2 Int4",
            description: "Ultra-light outline generator for laptops, ~1.8 GB RAM",
            provider: "Microsoft",
            size_mb: 1800,
            supports_mlx: false,
            requires_gpu: false,
        },
        ModelOption {
            id: "ibm-granite-7b-slim",
            model_type: ModelType::LanguageModel,
            title: "IBM Granite 7B Slim",
            description:
                "Small Granite model optimized for on-device drafting with IBM SLM runtime",
            provider: "IBM",
            size_mb: 3200,
            supports_mlx: true,
            requires_gpu: false,
        },
    ]
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub project_type: String,
    pub languages: Vec<String>,
    pub description: Option<String>,
    pub template_id: Option<String>,
    pub base_path: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ProjectRecord {
    pub fn new_id() -> String {
        Uuid::new_v4().to_string()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsPayload {
    pub preferred_theme: String,
    pub transliteration_mode: String,
    pub stt_model: String,
    pub tts_model: String,
    pub llm_model: String,
    pub api_keys: Value,
}

#[derive(Debug, FromRow)]
pub struct SettingsRow {
    pub preferred_theme: String,
    pub transliteration_mode: String,
    pub stt_model: String,
    pub tts_model: String,
    pub llm_model: String,
    pub api_keys: Option<String>,
}

impl TryFrom<SettingsRow> for SettingsPayload {
    type Error = anyhow::Error;

    fn try_from(value: SettingsRow) -> Result<Self, Self::Error> {
        let api_keys = if let Some(json) = value.api_keys {
            serde_json::from_str(&json)?
        } else {
            Value::Object(Default::default())
        };
        Ok(SettingsPayload {
            preferred_theme: value.preferred_theme,
            transliteration_mode: value.transliteration_mode,
            stt_model: value.stt_model,
            tts_model: value.tts_model,
            llm_model: value.llm_model,
            api_keys,
        })
    }
}

#[derive(Debug, FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub project_type: String,
    pub languages: String,
    pub description: Option<String>,
    pub template_id: Option<String>,
    pub base_path: String,
    pub created_at: String,
    pub updated_at: String,
}

impl TryFrom<ProjectRow> for ProjectRecord {
    type Error = anyhow::Error;

    fn try_from(value: ProjectRow) -> Result<Self, Self::Error> {
        let languages: Vec<String> = serde_json::from_str(&value.languages)?;
        Ok(ProjectRecord {
            id: value.id,
            name: value.name,
            slug: value.slug,
            project_type: value.project_type,
            languages,
            description: value.description,
            template_id: value.template_id,
            base_path: value.base_path,
            created_at: value.created_at,
            updated_at: value.updated_at,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, FromRow)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub password_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

impl UserRow {
    pub fn into_profile(self) -> UserProfile {
        UserProfile {
            id: self.id,
            email: self.email,
            display_name: self.display_name,
            created_at: self.created_at,
        }
    }
}
