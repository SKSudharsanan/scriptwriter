import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy as CopyIcon,
  Bold,
  Code,
  Italic,
  FileAudio2,
  FilePenLine,
  FilePlus2,
  Highlighter,
  Languages,
  Loader2,
  Minus,
  Mic,
  MicVocal,
  MoreHorizontal,
  Plus,
  Quote,
  RefreshCcw,
  Redo2,
  Table,
  Undo2,
  Underline,
  List,
  ListOrdered,
  Image as ImageIcon,
  Printer,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import {
  bootstrap,
  createProject,
  currentUser,
  fetchModelInventory,
  copyProjectAsset,
  listProjectFiles,
  loadMarkdownFile,
  loginUser,
  logoutUser,
  registerUser,
  saveMarkdownFile,
  transliterate,
  updateSettings,
  recordFromMicrophone,
  synthesizeSpeech,
  generateAIScene,
} from '@/lib/tauri'
import type {
  BootstrapResponse,
  ModelInventoryItem,
  ModelOption,
  ProjectRecord,
  ProjectTemplate,
  ProjectFileEntry,
  SettingsPayload,
  UserProfile,
} from '@/types'

declare global {
  interface Window {
    webkitSpeechRecognition?: any
    SpeechRecognition?: any
  }
}

const API_KEY_FIELDS = [
  { id: 'granite_api_key', label: 'IBM Granite API Key' },
  { id: 'openrouter_key', label: 'OpenRouter API Key' },
]

const MAX_INLINE_SUGGESTIONS = 6

type ProjectFormState = {
  name: string
  projectType: string
  templateId: string
  description: string
  languages: string[]
}

type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T }

type ReplaceOptions = {
  trackRange?: boolean
  trimTrailing?: boolean
}

type BlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

type AuthPanelProps = {
  mode: 'login' | 'register'
  onModeChange: (mode: 'login' | 'register') => void
  email: string
  onEmailChange: (value: string) => void
  password: string
  onPasswordChange: (value: string) => void
  displayName: string
  onDisplayNameChange: (value: string) => void
  busy: boolean
  onLogin: () => Promise<void>
  onRegister: () => Promise<void>
}

function buildInitialProjectForm(template?: ProjectTemplate): ProjectFormState {
  return {
    name: template ? `${template.title} Draft` : 'New Script',
    projectType: template?.id ?? 'feature-film',
    templateId: template?.id ?? 'feature-film',
    description: template?.description ?? '',
    languages: template?.languages ?? ['ta', 'en'],
  }
}

function AuthPanel(props: AuthPanelProps) {
  const {
    mode,
    onModeChange,
    email,
    onEmailChange,
    password,
    onPasswordChange,
    displayName,
    onDisplayNameChange,
    busy,
    onLogin,
    onRegister,
  } = props

  const isRegister = mode === 'register'

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {isRegister ? 'Create your account' : 'Sign in to continue'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isRegister
          ? 'Set up ScriptWriter on this device with an email and password.'
          : 'Access your projects and settings securely.'}
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (isRegister) {
            await onRegister()
          } else {
            await onLogin()
          }
        }}
      >
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            autoComplete="email"
            disabled={busy}
            required
          />
        </div>

        {isRegister ? (
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Display name (optional)
            </label>
            <input
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              disabled={busy}
              placeholder="Karthik"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            disabled={busy}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {isRegister ? 'Creating account…' : 'Signing in…'}
            </span>
          ) : isRegister ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {isRegister ? 'Already have an account? ' : "Don't have an account? "}
        <button
          type="button"
          className="font-medium text-primary"
          onClick={() => onModeChange(isRegister ? 'login' : 'register')}
          disabled={busy}
        >
          {isRegister ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </div>
  )
}

function App() {
  const [bootstrapState, setBootstrapState] = useState<AsyncState<BootstrapResponse>>({
    status: 'idle',
  })
  const [reloadKey, setReloadKey] = useState(0)
  const [isReloading, setIsReloading] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [modelInventory, setModelInventory] = useState<ModelInventoryItem[]>([])
  const [settingsDraft, setSettingsDraft] = useState<SettingsPayload | null>(null)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [projectForm, setProjectForm] = useState<ProjectFormState>(
    buildInitialProjectForm(),
  )
  const [creatingProject, setCreatingProject] = useState(false)
  const [translitInput, setTranslitInput] = useState('')
  const [translitOutput, setTranslitOutput] = useState<string[]>([])
  const [translitBusy, setTranslitBusy] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const [inlineSuggestions, setInlineSuggestions] = useState<string[]>([])
  const inlineRangeRef = useRef<{ start: number; end: number } | null>(null)
  const [languageMode, setLanguageMode] = useState<'ta' | 'en'>('ta')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectFiles, setProjectFiles] = useState<ProjectFileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'unsupported'>('idle')
  const recognitionRef = useRef<any>(null)
  const skipFileLoadRef = useRef(false)
  const historyRef = useRef<string[]>([''])
  const historyIndexRef = useRef(0)

  const pushHistory = useCallback((value: string) => {
    const history = historyRef.current
    const index = historyIndexRef.current
    if (history[index] === value) return
    history.splice(index + 1)
    history.push(value)
    historyIndexRef.current = history.length - 1
  }, [])

  const updateMarkdownContent = useCallback(
    (value: string, options: { pushHistory?: boolean } = {}) => {
      setMarkdownContent(value)
      if (options.pushHistory ?? true) {
        pushHistory(value)
      }
    },
    [pushHistory],
  )

  const resetHistory = useCallback((value: string) => {
    historyRef.current = [value]
    historyIndexRef.current = 0
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const existing = await currentUser()
        if (!active) return
        setUser(existing)
      } catch (error) {
        toast.error('Unable to verify session', {
          description: formatError(error),
        })
      } finally {
        if (active) {
          setSessionChecked(true)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setBootstrapState({ status: 'idle' })
      setModelInventory([])
      setSettingsDraft(null)
      setSettingsDirty(false)
      return
    }

    let active = true

    async function loadBootstrap() {
      if (reloadKey > 0) {
        setIsReloading(true)
      }
      setBootstrapState({ status: 'loading' })
      try {
        const data = await bootstrap()
        if (!active) return
        setUser((prev) => {
          if (!prev || prev.id !== data.user.id) {
            return data.user
          }
          return prev
        })
        setBootstrapState({ status: 'ready', data })
        setSettingsDraft(data.settings)
        setSettingsDirty(false)
        if (reloadKey === 0) {
          setProjectForm(buildInitialProjectForm(data.templates.at(0)))
        }
        const inventory = await fetchModelInventory()
        if (!active) return
        setModelInventory(inventory)
      } catch (error) {
        if (!active) return
        if (isUnauthorized(error)) {
          setUser(null)
          setBootstrapState({ status: 'idle' })
          toast.error('Session expired', {
            description: 'Please sign in again to continue.',
          })
        } else {
          setBootstrapState({ status: 'error', error: formatError(error) })
        }
      } finally {
        if (active) {
          setIsReloading(false)
        }
      }
    }

    loadBootstrap()

    return () => {
      active = false
    }
  }, [user, reloadKey])

  useEffect(() => {
    if (!translitInput.trim()) {
      setTranslitOutput([])
      setTranslitBusy(false)
      return
    }

    let cancelled = false
    setTranslitBusy(true)
    const handle = setTimeout(() => {
      transliterate(translitInput)
        .then((value) => {
          if (!cancelled) {
            setTranslitOutput(value)
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setTranslitOutput([`⚠️ ${formatError(error)}`])
          }
        })
        .finally(() => {
          if (!cancelled) {
            setTranslitBusy(false)
          }
        })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [translitInput])

  const templates =
    bootstrapState.status === 'ready' ? bootstrapState.data.templates : []
  const projects =
    bootstrapState.status === 'ready' ? bootstrapState.data.projects : []
  const modelGroups =
    bootstrapState.status === 'ready' ? bootstrapState.data.model_options : null

  const activeProject = useMemo(() => {
    if (bootstrapState.status !== 'ready' || !activeProjectId) return null
    return (
      bootstrapState.data.projects.find((project) => project.id === activeProjectId) ?? null
    )
  }, [bootstrapState, activeProjectId])

  useEffect(() => {
    if (bootstrapState.status === 'ready' && bootstrapState.data.projects.length > 0) {
      setActiveProjectId((prev) => prev ?? bootstrapState.data.projects[0].id)
    }
  }, [bootstrapState])

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === projectForm.templateId)
  }, [templates, projectForm.templateId])

  const loadMarkdownIntoEditor = useCallback(
    async (projectId: string, filePath: string) => {
      try {
        const content = await loadMarkdownFile(projectId, filePath)
        updateMarkdownContent(content, { pushHistory: false })
        resetHistory(content)
        setSelectedFile(filePath)
      } catch (error) {
        toast.error('Unable to open file', {
          description: formatError(error),
        })
      }
    },
    [updateMarkdownContent, resetHistory],
  )

  const loadProjectFiles = useCallback(
    async (projectId: string, options: { selectFirst?: boolean } = {}) => {
      try {
        const files = await listProjectFiles(projectId)
        setProjectFiles(files)
        if (options.selectFirst ?? true) {
          const first = findFirstMarkdown(files)
          if (first) {
            await loadMarkdownIntoEditor(projectId, first)
            return
          }
          updateMarkdownContent('', { pushHistory: false })
          resetHistory('')
          setSelectedFile(null)
        }
      } catch (error) {
        toast.error('Unable to load project files', {
          description: formatError(error),
        })
      }
    },
    [loadMarkdownIntoEditor, updateMarkdownContent, resetHistory],
  )

  useEffect(() => {
    if (selectedTemplate) {
      setProjectForm((prev) => ({
        ...prev,
        projectType: selectedTemplate.id,
      }))
    }
  }, [selectedTemplate?.id])

  useEffect(() => {
    if (!activeProjectId || bootstrapState.status !== 'ready') return
    if (skipFileLoadRef.current) {
      skipFileLoadRef.current = false
      return
    }
    loadProjectFiles(activeProjectId)
  }, [activeProjectId, bootstrapState.status, loadProjectFiles])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])


  const modelInventoryMap = useMemo(() => {
    return new Map(modelInventory.map((item) => [item.identifier, item]))
  }, [modelInventory])

  const handleLogin = async () => {
    if (authBusy) return
    const email = authEmail.trim().toLowerCase()
    const password = authPassword

    if (!email || !password) {
      toast.error('Missing credentials', {
        description: 'Enter both email and password to sign in.',
      })
      return
    }

    setAuthBusy(true)
    try {
      const profile = await loginUser({ email, password })
      setUser(profile)
      setAuthPassword('')
      toast.success('Welcome back', {
        description: profile.display_name ?? profile.email,
      })
      setReloadKey((value) => value + 1)
    } catch (error) {
      toast.error('Login failed', {
        description: formatError(error),
      })
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRegister = async () => {
    if (authBusy) return
    const email = authEmail.trim().toLowerCase()
    const password = authPassword
    const displayName = authDisplayName.trim()

    if (!email || !password) {
      toast.error('Missing details', {
        description: 'Email and password are required to create an account.',
      })
      return
    }

    if (password.length < 8) {
      toast.error('Password too short', {
        description: 'Use at least 8 characters for your password.',
      })
      return
    }

    setAuthBusy(true)
    try {
      const profile = await registerUser({
        email,
        password,
        display_name: displayName || undefined,
      })
      setUser(profile)
      setAuthPassword('')
      setAuthDisplayName('')
      toast.success('Account created', {
        description: 'You are now signed in.',
      })
      setReloadKey((value) => value + 1)
    } catch (error) {
      toast.error('Could not create account', {
        description: formatError(error),
      })
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!user) return
    try {
      await logoutUser()
      setUser(null)
      setBootstrapState({ status: 'idle' })
      setModelInventory([])
      setSettingsDraft(null)
      setSettingsDirty(false)
      setProjectForm(buildInitialProjectForm())
      setSelectedFile(null)
      setProjectFiles([])
      setActiveProjectId(null)
      historyRef.current = ['']
      historyIndexRef.current = 0
      updateMarkdownContent('', { pushHistory: false })
      clearInlineSuggestions()
      toast.success('Signed out')
    } catch (error) {
      toast.error('Unable to sign out', {
        description: formatError(error),
      })
    }
  }

  const clearInlineSuggestions = useCallback(() => {
    setInlineSuggestions([])
    inlineRangeRef.current = null
  }, [])

  useEffect(() => {
    if (languageMode !== 'ta') {
      clearInlineSuggestions()
    }
  }, [languageMode, clearInlineSuggestions])

  const replaceEditorRange = useCallback(
    (replacement: string, start: number, end: number, options: ReplaceOptions = {}) => {
      const editor = editorRef.current
      const currentValue = editor ? editor.value : markdownContent
      const safeStart = Math.max(0, Math.min(start, currentValue.length))
      const safeEnd = Math.max(safeStart, Math.min(end, currentValue.length))
      const nextValue = `${currentValue.slice(0, safeStart)}${replacement}${currentValue.slice(safeEnd)}`
      updateMarkdownContent(nextValue)

      if (options.trackRange) {
        let trackEnd = safeStart + replacement.length
        if (options.trimTrailing && replacement.endsWith(' ')) {
          trackEnd = Math.max(trackEnd - 1, safeStart)
        }
        inlineRangeRef.current = { start: safeStart, end: trackEnd }
      }

      requestAnimationFrame(() => {
        const active = editorRef.current
        if (active) {
          active.value = nextValue
          const cursor = safeStart + replacement.length
          active.focus()
          active.setSelectionRange(cursor, cursor)
        }
      })
    },
    [editorRef, markdownContent, updateMarkdownContent],
  )

  const handleTemplateSelection = (template: ProjectTemplate) => {
    setProjectForm({
      ...projectForm,
      templateId: template.id,
      projectType: template.id,
      languages: template.languages,
      description: template.description,
      name: `${template.title} Draft`,
    })
    const defaultMarkdown = template.metadata?.default_markdown ?? ''
    updateMarkdownContent(defaultMarkdown)
    resetHistory(defaultMarkdown)
    setSelectedFile(null)
  }

  const insertTamilIntoEditor = (value: string) => {
    if (!value) return
    const snippet = value.endsWith(' ') ? value : `${value} `
    const editor = editorRef.current
    if (!editor) {
      updateMarkdownContent(markdownContent + snippet)
      clearInlineSuggestions()
      return
    }
    const start = editor.selectionStart ?? editor.value.length
    const end = editor.selectionEnd ?? start
    replaceEditorRange(snippet, start, end)
    clearInlineSuggestions()
  }

  const handleApplySuggestion = (value: string) => {
    insertTamilIntoEditor(value)
    setTranslitInput('')
    setTranslitOutput([])
    toast.success('Inserted Tamil text', {
      description: value,
    })
  }

  const handleInlineSuggestionSelect = useCallback(
    (value: string) => {
      const range = inlineRangeRef.current
      if (range) {
        replaceEditorRange(value, range.start, range.end, { trackRange: true })
        const editor = editorRef.current
        if (editor) {
          const cursor = range.start + value.length
          const needsSpace = !editor.value[cursor] || !/\s/.test(editor.value[cursor])
          if (needsSpace) {
            replaceEditorRange(' ', cursor, cursor)
          }
        }
      } else {
        insertTamilIntoEditor(value)
      }
      setInlineSuggestions((prev) => {
        const reordered = [value, ...prev.filter((candidate) => candidate !== value)]
        return reordered.slice(0, MAX_INLINE_SUGGESTIONS)
      })
      toast.success('Transliterated', {
        description: value,
      })
    },
    [insertTamilIntoEditor, replaceEditorRange],
  )

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSaveMarkdown()
        return
      }

      if (event.key === 'Escape' && inlineSuggestions.length > 0) {
        event.preventDefault()
        clearInlineSuggestions()
        return
      }

      if (languageMode !== 'ta') {
        if (inlineSuggestions.length > 0) {
          clearInlineSuggestions()
        }
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }

      if (event.key !== ' ') {
        return
      }

      const editor = editorRef.current
      if (!editor) return

      event.preventDefault()
      const cursor = editor.selectionStart ?? 0
      const start = findWordStart(editor.value, cursor)
      const rawWord = editor.value.slice(start, cursor)
      const trimmed = rawWord.trim()
      const suffix = ' '

      if (!trimmed) {
        replaceEditorRange(`${rawWord}${suffix}`, start, cursor)
        clearInlineSuggestions()
        return
      }

      ;(async () => {
        try {
          const suggestions = await transliterate(trimmed)
          if (!suggestions.length) {
            replaceEditorRange(`${rawWord}${suffix}`, start, cursor)
            clearInlineSuggestions()
            return
          }
          const best = suggestions[0]
          replaceEditorRange(`${best}${suffix}`, start, cursor, {
            trackRange: true,
            trimTrailing: true,
          })
          setInlineSuggestions(suggestions.slice(0, MAX_INLINE_SUGGESTIONS))
        } catch (error) {
          toast.error('Inline transliteration failed', {
            description: formatError(error),
          })
          replaceEditorRange(`${rawWord}${suffix}`, start, cursor)
          clearInlineSuggestions()
        }
      })()
    },
    [languageMode, inlineSuggestions.length, replaceEditorRange, clearInlineSuggestions],
  )

  const handleVoiceTyping = useCallback(async () => {
    if (languageMode !== 'ta') {
      toast.info('Switch to தமிழ் mode to use voice typing')
      return
    }

    if (voiceStatus === 'listening') {
      // Stop recording (not implemented for Python backend)
      setVoiceStatus('idle')
      return
    }

    setVoiceStatus('listening')
    toast.info('Recording for 5 seconds... (Speak in Tamil or English)')

    try {
      // Use Python-based recording via Tauri
      // Use 'ta-IN' for Tamil speech recognition
      const result = await recordFromMicrophone(5, 'ta-IN')
      
      if (result.success && result.text) {
        // Check if the result is already in Tamil script
        const isTamil = /[\u0B80-\u0BFF]/.test(result.text)
        
        if (isTamil) {
          // Already Tamil, insert directly
          insertTamilIntoEditor(result.text)
          toast.success(`Transcribed Tamil: "${result.text.substring(0, 30)}..."`)
        } else {
          // English phonetic, transliterate to Tamil
          try {
            const suggestions = await transliterate(result.text)
            const best = suggestions[0] ?? result.text
            insertTamilIntoEditor(best)
            toast.success(`Transcribed: "${result.text}" → "${best.substring(0, 30)}..."`)
          } catch (error) {
            toast.error('Transliteration failed for voice input', {
              description: formatError(error),
            })
            insertTamilIntoEditor(result.text)
          }
        }
      } else {
        toast.error('Voice recording failed', {
          description: result.error || 'Unknown error',
        })
      }
    } catch (error) {
      toast.error('Voice recording failed', {
        description: formatError(error),
      })
    } finally {
      setVoiceStatus('idle')
    }
  }, [languageMode, voiceStatus, insertTamilIntoEditor, transliterate])

  const handleReadAloud = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return

    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd)
    const textToRead = selectedText || markdownContent

    if (!textToRead.trim()) {
      toast.info('No text to read. Select text or ensure the editor has content.')
      return
    }

    // Detect if text contains Tamil characters
    const hasTamil = /[\u0B80-\u0BFF]/.test(textToRead)
    const language = hasTamil ? 'ta' : 'en'
    
    toast.info(`Speaking in ${hasTamil ? 'Tamil' : 'English'}...`)
    
    try {
      const result = await synthesizeSpeech(textToRead, language)
      if (result.success) {
        toast.success('Text-to-speech completed')
      } else {
        toast.error('Text-to-speech failed', {
          description: result.error || 'Unknown error',
        })
      }
    } catch (error) {
      toast.error('Text-to-speech failed', {
        description: formatError(error),
      })
    }
  }, [markdownContent])

  const handleGenerateAIScene = useCallback(async () => {
    const prompt = window.prompt('Enter scene description:', 'Write a dramatic confrontation scene')
    if (!prompt) return

    toast.info('Generating scene with AI...')
    try {
      const result = await generateAIScene(prompt, markdownContent)
      if (result.response && !result.error) {
        // Insert AI-generated text at cursor position
        const editor = editorRef.current
        if (editor) {
          const start = editor.selectionStart
          const end = editor.selectionEnd
          const before = markdownContent.substring(0, start)
          const after = markdownContent.substring(end)
          const newContent = before + '\n\n' + result.response + '\n\n' + after
          setMarkdownContent(newContent)
          toast.success('AI scene generated!')
        }
      } else {
        toast.error('AI generation failed', {
          description: result.error || 'No response from AI',
        })
      }
    } catch (error) {
      toast.error('AI generation failed', {
        description: formatError(error),
      })
    }
  }, [markdownContent])

  const handleCopyTamil = async (text?: string) => {
    if (!text) {
      toast.info('Nothing to copy yet')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch (error) {
      toast.error('Unable to copy', {
        description: formatError(error),
      })
    }
  }

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      toast.info('Nothing to undo')
      return
    }
    historyIndexRef.current -= 1
    const previous = historyRef.current[historyIndexRef.current]
    updateMarkdownContent(previous, { pushHistory: false })
    clearInlineSuggestions()
    requestAnimationFrame(() => {
      const editor = editorRef.current
      if (editor) {
        editor.value = previous
        const cursor = previous.length
        editor.focus()
        editor.setSelectionRange(cursor, cursor)
      }
    })
  }, [updateMarkdownContent, clearInlineSuggestions])

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      toast.info('Nothing to redo')
      return
    }
    historyIndexRef.current += 1
    const next = historyRef.current[historyIndexRef.current]
    updateMarkdownContent(next, { pushHistory: false })
    clearInlineSuggestions()
    requestAnimationFrame(() => {
      const editor = editorRef.current
      if (editor) {
        editor.value = next
        const cursor = next.length
        editor.focus()
        editor.setSelectionRange(cursor, cursor)
      }
    })
  }, [updateMarkdownContent, clearInlineSuggestions])

  const handleSaveMarkdown = useCallback(async () => {
    if (!activeProjectId) {
      toast.error('Select a project before saving')
      return
    }

    let targetPath = selectedFile
    if (!targetPath) {
      const suggestion = languageMode === 'ta' ? 'drafts/tamil/script.md' : 'drafts/english/script.md'
      const input = window.prompt('Save as (relative to project root)', suggestion)
      if (!input) {
        toast.info('Save cancelled')
        return
      }
      targetPath = input.trim()
      if (!targetPath) {
        toast.info('File path cannot be empty')
        return
      }
    }

    try {
      await saveMarkdownFile(activeProjectId, targetPath, markdownContent)
      toast.success('Script saved', {
        description: targetPath,
      })
      setSelectedFile(targetPath)
      loadProjectFiles(activeProjectId, { selectFirst: false })
    } catch (error) {
      toast.error('Unable to save script', {
        description: formatError(error),
      })
    }
  }, [activeProjectId, selectedFile, markdownContent, languageMode, loadProjectFiles])

  const handleInsertImage = useCallback(async (): Promise<string | null> => {
    if (!activeProjectId) {
      toast.error('Select a project to attach images')
      return null
    }

    try {
      const selection = await open({
        multiple: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
          },
        ],
      })

      if (!selection) {
        return null
      }

      const filePath = Array.isArray(selection) ? selection[0] : selection
      if (typeof filePath !== 'string') {
        return null
      }

      const relative = await copyProjectAsset(activeProjectId, filePath, 'assets/images')
      await loadProjectFiles(activeProjectId, { selectFirst: false })
      toast.success('Image added', {
        description: relative,
      })
      return relative
    } catch (error) {
      toast.error('Unable to add image', {
        description: formatError(error),
      })
      return null
    }
  }, [activeProjectId, loadProjectFiles])

  const handleSelectFile = useCallback(
    (path: string) => {
      if (!activeProjectId) return
      const lower = path.toLowerCase()
      if (!lower.endsWith('.md') && !lower.endsWith('.markdown') && !lower.endsWith('.txt')) {
        setSelectedFile(path)
        toast.info('Markdown preview only supports .md, .markdown, or .txt files')
        return
      }
      loadMarkdownIntoEditor(activeProjectId, path)
    },
    [activeProjectId, loadMarkdownIntoEditor],
  )

  const handleProjectSelect = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectId) return
      setActiveProjectId(projectId)
      setSelectedFile(null)
    },
    [activeProjectId],
  )

  const toggleLanguage = (value: string) => {
    setProjectForm((prev) => {
      const exists = prev.languages.includes(value)
      return {
        ...prev,
        languages: exists
          ? prev.languages.filter((lang) => lang !== value)
          : [...prev.languages, value],
      }
    })
  }

  const handleCreateProject = async () => {
    if (!selectedTemplate) return
    setCreatingProject(true)
    try {
      const project = await createProject({
        name: projectForm.name.trim(),
        project_type: projectForm.projectType,
        languages: projectForm.languages,
        template_id: selectedTemplate.id,
        description: projectForm.description.trim() || undefined,
      })

      setBootstrapState((prev) => {
        if (prev.status !== 'ready') return prev
        return {
          status: 'ready',
          data: {
            ...prev.data,
            projects: [project, ...prev.data.projects],
          },
        }
      })
      skipFileLoadRef.current = true
      setActiveProjectId(project.id)
      setSelectedFile(null)
      const defaultMarkdown = selectedTemplate.metadata?.default_markdown ?? ''
      updateMarkdownContent(defaultMarkdown)
      resetHistory(defaultMarkdown)
      await loadProjectFiles(project.id, { selectFirst: false })
      toast.success('Project created', {
        description: `${project.name} has been added to your workspace.`,
      })
    } catch (error) {
      toast.error('Unable to create project', {
        description: formatError(error),
      })
    } finally {
      setCreatingProject(false)
    }
  }

  const refreshModels = async () => {
    try {
      const inventory = await fetchModelInventory()
      setModelInventory(inventory)
      toast.success('Model inventory updated')
    } catch (error) {
      toast.error('Unable to refresh models', {
        description: formatError(error),
      })
    }
  }

  const handleSettingsChange = (key: keyof SettingsPayload, value: string) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev
      return { ...prev, [key]: value }
    })
    setSettingsDirty(true)
  }

  const handleApiKeyChange = (field: string, value: string) => {
    setSettingsDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        api_keys: { ...prev.api_keys, [field]: value },
      }
    })
    setSettingsDirty(true)
  }

  const handleSaveSettings = async () => {
    if (!settingsDraft) return
    setSettingsBusy(true)
    try {
      await updateSettings(settingsDraft)
      setSettingsDirty(false)
      toast.success('Preferences saved')
    } catch (error) {
      toast.error('Unable to update settings', {
        description: formatError(error),
      })
    } finally {
      setSettingsBusy(false)
    }
  }

  const renderContent = () => {
    if (!sessionChecked) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Checking your session…</p>
        </div>
      )
    }

    if (!user) {
      return (
        <div className="flex flex-1 items-center justify-center py-12">
          <AuthPanel
            mode={authMode}
            onModeChange={setAuthMode}
            email={authEmail}
            onEmailChange={setAuthEmail}
            password={authPassword}
            onPasswordChange={setAuthPassword}
            displayName={authDisplayName}
            onDisplayNameChange={setAuthDisplayName}
            busy={authBusy}
            onLogin={handleLogin}
            onRegister={handleRegister}
          />
        </div>
      )
    }

    if (bootstrapState.status === 'loading' || bootstrapState.status === 'idle') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Preparing ScriptWriter workspace…</p>
        </div>
      )
    }

    if (bootstrapState.status === 'error') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <XCircle className="h-8 w-8" />
          <p>{bootstrapState.error}</p>
          <Button
            onClick={() => {
              setIsReloading(true)
              setReloadKey((value) => value + 1)
            }}
            disabled={isReloading}
          >
            {isReloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Retrying…
              </>
            ) : (
              'Retry'
            )}
          </Button>
        </div>
      )
    }

    return (
      <div className="grid gap-6 pb-10 lg:grid-cols-[420px,1fr]">
        <aside className="space-y-6">
          <TemplateCard
            templates={templates}
            form={projectForm}
            onTemplateSelect={handleTemplateSelection}
            onNameChange={(name) => setProjectForm((prev) => ({ ...prev, name }))}
            onDescriptionChange={(description) =>
              setProjectForm((prev) => ({ ...prev, description }))
            }
            onLanguageToggle={toggleLanguage}
            onSubmit={handleCreateProject}
            creating={creatingProject}
          />

          <TransliterationCard
            input={translitInput}
            onInputChange={setTranslitInput}
            suggestions={translitOutput}
            busy={translitBusy}
            onSuggestionSelect={handleApplySuggestion}
            language={languageMode}
            onLanguageChange={setLanguageMode}
            onVoiceTyping={handleVoiceTyping}
            onCopy={handleCopyTamil}
            voiceStatus={voiceStatus}
          />

          <ModelInventoryCard
            options={modelGroups}
            inventory={modelInventoryMap}
            onRefresh={refreshModels}
          />
        </aside>

        <section className="space-y-6">
          <FileExplorer
            files={projectFiles}
            selectedPath={selectedFile}
            projectName={activeProject?.name ?? null}
            onSelect={(path) => handleSelectFile(path)}
            onRefresh={() => {
              if (activeProjectId) {
                loadProjectFiles(activeProjectId, { selectFirst: false })
              }
            }}
          />
          <MarkdownEditorCard
            value={markdownContent}
            onChange={updateMarkdownContent}
            editorRef={editorRef}
            onKeyDown={handleEditorKeyDown}
            inlineSuggestions={inlineSuggestions}
            onInlineSelect={handleInlineSuggestionSelect}
            onClearInline={clearInlineSuggestions}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSave={handleSaveMarkdown}
            selectedFile={selectedFile}
            onRequestImage={handleInsertImage}
            onReadAloud={handleReadAloud}
            onGenerateAI={handleGenerateAIScene}
          />
          <ProjectsCard
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={handleProjectSelect}
          />

          <SettingsCard
            settings={settingsDraft}
            modelGroups={modelGroups}
            onSettingChange={handleSettingsChange}
            onApiKeyChange={handleApiKeyChange}
            onSave={handleSaveSettings}
            dirty={settingsDirty}
            busy={settingsBusy}
          />

          <AssistantsCard />
        </section>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FilePenLine className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none tracking-tight">
                ScriptWriter Studio
              </p>
              <p className="text-xs text-muted-foreground">
                Multilingual screenwriting workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-xs font-medium text-muted-foreground sm:block">
                  {user.display_name ?? user.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  disabled={isReloading}
                >
                  Logout
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsReloading(true)
                    setReloadKey((value) => value + 1)
                  }}
                  title="Reload workspace"
                  disabled={isReloading}
                >
                  {isReloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container flex flex-1 flex-col gap-6 py-6">
        {renderContent()}
      </main>
    </div>
  )
}

function TemplateCard(props: {
  templates: ProjectTemplate[]
  form: ProjectFormState
  onTemplateSelect: (template: ProjectTemplate) => void
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onLanguageToggle: (language: string) => void
  onSubmit: () => void
  creating: boolean
}) {
  const {
    templates,
    form,
    onTemplateSelect,
    onNameChange,
    onDescriptionChange,
    onLanguageToggle,
    onSubmit,
    creating,
  } = props

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Start a project</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a template to scaffold folders, Markdown files, and metadata.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onTemplateSelect(template)}
            className={cn(
              'w-full rounded-lg border px-4 py-3 text-left transition',
              form.templateId === template.id
                ? 'border-primary bg-primary/10 text-primary-foreground shadow'
                : 'border-border hover:border-primary/50 hover:bg-accent/60',
            )}
          >
            <p className="text-sm font-semibold text-foreground">{template.title}</p>
            <p className="text-xs text-muted-foreground">{template.description}</p>
            <p className="mt-1 text-xs font-medium text-primary">
              Languages: {template.languages.join(', ')}
            </p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Project name
        </label>
        <input
          value={form.name}
          onChange={(event) => onNameChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Description
        </label>
        <textarea
          value={form.description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          rows={3}
        />

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Languages
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['ta', 'en'].map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => onLanguageToggle(language)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  form.languages.includes(language)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                {language === 'ta' ? 'Tamil' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={onSubmit} className="w-full gap-2" disabled={creating}>
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          <>
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Create project
          </>
        )}
      </Button>
    </div>
  )
}

function TransliterationCard(props: {
  input: string
  suggestions: string[]
  busy: boolean
  onInputChange: (value: string) => void
  onSuggestionSelect: (value: string) => void
  language: 'ta' | 'en'
  onLanguageChange: (value: 'ta' | 'en') => void
  onVoiceTyping: () => void
  onCopy: (text?: string) => void
  voiceStatus: 'idle' | 'listening' | 'unsupported'
}) {
  const {
    input,
    suggestions,
    busy,
    onInputChange,
    onSuggestionSelect,
    language,
    onLanguageChange,
    onVoiceTyping,
    onCopy,
    voiceStatus,
  } = props
  const primary = suggestions.at(0) ?? ''
  const secondary = suggestions.slice(1, 6)

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LanguageToggle value={language} onChange={onLanguageChange} />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onVoiceTyping}
            disabled={language !== 'ta' || voiceStatus === 'unsupported'}
          >
            <Mic className="h-4 w-4" aria-hidden />
            {voiceStatus === 'listening' ? 'Stop' : 'Voice Typing'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            disabled={!primary}
            onClick={() => primary && onCopy(primary)}
          >
            <CopyIcon className="h-4 w-4" aria-hidden /> Copy
            <span className="h-4 w-px bg-border" aria-hidden />
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold">English → Tamil keyboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {language === 'ta'
            ? 'Type phonetically and press space to convert inline; alternative suggestions appear below.'
            : 'Tamil transliteration is off. Switch to தமிழ் to enable the space-to-transliterate shortcut.'}
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Input
        </label>
        <textarea
          rows={4}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="ennoda sirappana kathai…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tamil output
        </label>
        <div className="min-h-[96px] rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-sm">
          {busy ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Translating…
            </span>
          ) : suggestions.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              Suggestions will appear here
            </span>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="block text-base font-semibold text-foreground">
                  {primary}
                </span>
                <Button
                  size="sm"
                  onClick={() => onSuggestionSelect(primary)}
                  variant="outline"
                >
                  Insert
                </Button>
              </div>
              {secondary.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {secondary.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onSuggestionSelect(item)}
                      className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LanguageToggle(props: { value: 'ta' | 'en'; onChange: (value: 'ta' | 'en') => void }) {
  const { value, onChange } = props
  const options: Array<{ value: 'ta' | 'en'; label: string }> = [
    { value: 'ta', label: 'தமிழ்' },
    { value: 'en', label: 'English' },
  ]

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-background p-1 text-xs font-medium">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1 transition',
              active
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function MarkdownEditorCard(props: {
  value: string
  onChange: (value: string) => void
  editorRef: RefObject<HTMLTextAreaElement | null>
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  inlineSuggestions: string[]
  onInlineSelect: (value: string) => void
  onClearInline: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  selectedFile: string | null
  onRequestImage: () => Promise<string | null>
  onReadAloud: () => void
  onGenerateAI: () => void
}) {
  const {
    value,
    onChange,
    editorRef,
    onKeyDown,
    inlineSuggestions,
    onInlineSelect,
    onClearInline,
    onUndo,
    onRedo,
    onSave,
    selectedFile,
    onRequestImage,
    onReadAloud,
    onGenerateAI,
  } = props
  const [preview, setPreview] = useState(false)
  const headingFontSizes = [12, 28, 24, 20, 18, 16, 14]
  const headingLevelToFontSize = (level: number) =>
    headingFontSizes[Math.min(Math.max(level, 0), headingFontSizes.length - 1)]
  const headingStyleFromLevel = (level: number): BlockStyle =>
    (level === 0 ? 'paragraph' : (`h${level}` as BlockStyle))
  const levelFromStyle: Record<BlockStyle, number> = {
    paragraph: 0,
    h1: 1,
    h2: 2,
    h3: 3,
    h4: 4,
    h5: 5,
    h6: 6,
  }
  const [fontSize, setFontSize] = useState<number>(headingFontSizes[0])
  const [blockStyle, setBlockStyle] = useState<BlockStyle>('paragraph')

  const getLineContext = () => {
    const editor = editorRef.current
    if (!editor) return null
    const start = editor.selectionStart ?? 0
    const end = editor.selectionEnd ?? start
    const text = value
    const lineStartIndex = text.lastIndexOf('\n', start - 1)
    const lineStart = lineStartIndex === -1 ? 0 : lineStartIndex + 1
    const lineEndIndex = text.indexOf('\n', end)
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
    const line = text.slice(lineStart, lineEnd)
    const match = line.match(/^(#+)\s+/)
    const level = match ? match[1].length : 0
    const content = match ? line.slice(match[0].length) : line
    return { lineStart, lineEnd, level, content }
  }

  const replaceRange = (
    start: number,
    end: number,
    replacement: string,
    selectStart?: number,
    selectEnd?: number,
  ) => {
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next)
    onClearInline()
    requestAnimationFrame(() => {
      const editor = editorRef.current
      if (editor) {
        editor.value = next
        editor.focus()
        const selectionStart = selectStart ?? start + replacement.length
        const selectionEnd = selectEnd ?? selectionStart
        editor.setSelectionRange(selectionStart, selectionEnd)
      }
    })
  }

  const setHeadingLevel = (level: number) => {
    const context = getLineContext()
    if (!context) return
    const { lineStart, lineEnd, content } = context
    const cleaned = content.trim()
    const prefix = level === 0 ? '' : `${'#'.repeat(level)} `
    const replacement = cleaned ? `${prefix}${cleaned}` : prefix
    setFontSize(headingLevelToFontSize(level))
    setBlockStyle(headingStyleFromLevel(level))
    replaceRange(lineStart, lineEnd, replacement, lineStart + prefix.length, lineStart + prefix.length + cleaned.length)
  }

  const changeHeadingLevel = (delta: number) => {
    const context = getLineContext()
    const current = context?.level ?? 0
    const target = Math.max(0, Math.min(6, current + delta))
    setHeadingLevel(target)
  }

  const handleStyleChange = (style: BlockStyle) => {
    const level = levelFromStyle[style]
    setHeadingLevel(level)
  }

  const increaseFont = () => changeHeadingLevel(-1)
  const decreaseFont = () => changeHeadingLevel(1)

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart ?? 0
    const end = editor.selectionEnd ?? start
    const selected = value.slice(start, end)
    const hasSelection = start !== end
    const replacement = hasSelection ? `${prefix}${selected}${suffix}` : `${prefix}${suffix}`
    const selectionStart = start + prefix.length
    const selectionEnd = hasSelection ? selectionStart + selected.length : selectionStart
    replaceRange(start, end, replacement, selectionStart, selectionEnd)
  }

  const transformSelectedLines = (formatter: (line: string, index: number) => string) => {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart ?? 0
    const end = editor.selectionEnd ?? start
    const text = value
    const selectionStartIndex = text.lastIndexOf('\n', start - 1)
    const selectionStart = selectionStartIndex === -1 ? 0 : selectionStartIndex + 1
    const selectionEndIndex = text.indexOf('\n', end)
    const selectionEnd = selectionEndIndex === -1 ? text.length : selectionEndIndex
    const block = text.slice(selectionStart, selectionEnd)
    const lines = block.split('\n')
    const replacement = lines.map((line, idx) => formatter(line, idx)).join('\n')
    replaceRange(selectionStart, selectionEnd, replacement, selectionStart, selectionStart + replacement.length)
  }

  const insertBulletedList = () =>
    transformSelectedLines((line) => {
      const trimmed = line.trim()
      if (!trimmed) return '- '
      return line.startsWith('- ') ? line : `- ${trimmed}`
    })

  const insertOrderedList = () =>
    transformSelectedLines((line, index) => {
      const trimmed = line.trim()
      const withoutNumber = trimmed.replace(/^\d+\.\s*/, '')
      return `${index + 1}. ${withoutNumber}`
    })

  const insertQuote = () =>
    transformSelectedLines((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith('>') ? trimmed : `> ${trimmed}`
    })

  const insertImage = async () => {
    const relative = await onRequestImage()
    if (!relative) return
    const alt = window.prompt('Alt text', 'image') ?? 'image'
    const editor = editorRef.current
    const start = editor?.selectionStart ?? value.length
    const end = editor?.selectionEnd ?? start
    const snippet = `![${alt}](${relative})`
    replaceRange(start, end, snippet)
  }

  const insertTable = () => {
    const table = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |'
    const editor = editorRef.current
    const start = editor?.selectionStart ?? value.length
    const end = editor?.selectionEnd ?? start
    const needsNewline = start > 0 && value[start - 1] !== '\n'
    const snippet = `${needsNewline ? '\n' : ''}${table}\n`
    replaceRange(start, end, snippet)
  }

  const handlePrint = () => {
    window.print()
  }

  const handleMore = () => {
    toast.info('More formatting options coming soon')
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Markdown editor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture bilingual drafts; insert Tamil suggestions straight from the keyboard helper.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedFile ? `Editing: ${selectedFile}` : 'Unsaved draft'}
          </span>
          <Button variant="default" size="sm" onClick={onSave} type="button">
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPreview((prev) => !prev)
              onClearInline()
            }}
          >
            {preview ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background/80 px-2 py-1 text-xs">
        <Button variant="ghost" size="icon" onClick={onUndo} title="Undo" type="button">
          <Undo2 className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} title="Redo" type="button">
          <Redo2 className="h-4 w-4" aria-hidden />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" aria-hidden />
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
          value={blockStyle}
          onChange={(event) => handleStyleChange(event.target.value as BlockStyle)}
        >
          <option value="paragraph">Default</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="h5">Heading 5</option>
          <option value="h6">Heading 6</option>
        </select>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
          <Button variant="ghost" size="icon" onClick={decreaseFont} title="Smaller" type="button">
            <Minus className="h-3 w-3" aria-hidden />
          </Button>
          <span className="w-8 text-center text-xs font-semibold">{fontSize}</span>
          <Button variant="ghost" size="icon" onClick={increaseFont} title="Larger" type="button">
            <Plus className="h-3 w-3" aria-hidden />
          </Button>
        </div>
        <div className="mx-2 h-4 w-px bg-border" aria-hidden />
        <Button variant="ghost" size="icon" onClick={() => wrapSelection('**')} title="Bold" type="button">
          <Bold className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => wrapSelection('_')} title="Italic" type="button">
          <Italic className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => wrapSelection('<u>', '</u>')} title="Underline" type="button">
          <Underline className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => wrapSelection('==', '==')} title="Highlight" type="button">
          <Highlighter className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => wrapSelection('`', '`')} title="Inline code" type="button">
          <Code className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={insertQuote} title="Quote" type="button">
          <Quote className="h-4 w-4" aria-hidden />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" aria-hidden />
        <Button variant="ghost" size="icon" onClick={insertBulletedList} title="Bulleted list" type="button">
          <List className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={insertOrderedList} title="Numbered list" type="button">
          <ListOrdered className="h-4 w-4" aria-hidden />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" aria-hidden />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void insertImage()
          }}
          title="Insert image"
          type="button"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={insertTable} title="Insert table" type="button">
          <Table className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={handlePrint} title="Print" type="button">
          <Printer className="h-4 w-4" aria-hidden />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" aria-hidden />
        <Button variant="ghost" size="icon" onClick={onReadAloud} title="Read Aloud (Text-to-Speech)" type="button">
          <FileAudio2 className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={onGenerateAI} title="Generate Scene with AI" type="button">
          <Sparkles className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleMore} title="More" type="button">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {preview ? (
        <div className="prose prose-sm max-w-none rounded-md border border-dashed border-border bg-background/60 p-4 dark:prose-invert">
          {value.trim() ? <ReactMarkdown>{value}</ReactMarkdown> : <p className="text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Press <span className="font-semibold">Space</span> while the தமிழ் toggle is active to
            transliterate the word at the cursor.
          </p>
        <textarea
          ref={editorRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            onClearInline()
          }}
          onKeyDown={onKeyDown}
            rows={16}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="# Scene 1\n\nWrite your bilingual script here…"
          />
          {inlineSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {inlineSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onInlineSelect(suggestion)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs transition hover:border-primary hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function FileExplorer(props: {
  files: ProjectFileEntry[]
  selectedPath: string | null
  projectName: string | null
  onSelect: (path: string) => void
  onRefresh: () => void
}) {
  const { files, selectedPath, projectName, onSelect, onRefresh } = props

  return (
    <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Project files</h2>
          <p className="text-xs text-muted-foreground">
            {projectName ?? 'No project selected'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} type="button">
          Refresh
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files yet. Save your script to create one.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {files.map((entry) => (
            <FileNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileNode(props: {
  entry: ProjectFileEntry
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const { entry, depth, selectedPath, onSelect } = props
  const [open, setOpen] = useState(depth < 1)

  if (entry.is_directory) {
    const children = entry.children ?? []
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs font-medium transition hover:bg-accent/40"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden />
          )}
          <span>{entry.name}</span>
        </button>
        {open && children.length > 0 ? (
          <ul className="ml-4 space-y-1">
            {children.map((child) => (
              <FileNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  const isSelected = entry.path === selectedPath

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry.path)}
        className={cn(
          'block w-full rounded px-2 py-1 text-left text-xs transition hover:bg-accent/40',
          isSelected && 'bg-primary/10 text-primary',
        )}
      >
        {entry.name}
      </button>
    </li>
  )
}

function ModelInventoryCard(props: {
  options: BootstrapResponse['model_options'] | null
  inventory: Map<string, ModelInventoryItem>
  onRefresh: () => void
}) {
  const { options, inventory, onRefresh } = props

  const sections = useMemo(() => {
    if (!options) return []
    return [
      { label: 'Speech to text', items: options.speech_to_text },
      { label: 'Text to speech', items: options.text_to_speech },
      { label: 'Language models', items: options.language_models },
    ]
  }, [options])

  if (!options) return null

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Model inventory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track downloads and ensure the right tier is ready for your device.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCcw className="mr-2 h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.label} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-2 text-sm">
              {section.items.map((model) => {
                const item = inventory.get(model.id)
                const downloaded = item?.downloaded ?? false
                return (
                  <li
                    key={model.id}
                    className="flex items-center justify-between rounded-md border border-border/80 bg-background/70 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-foreground">{model.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.description}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {model.provider} • {model.size_mb} MB
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {downloaded ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> Ready
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Pending
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectsCard(props: {
  projects: ProjectRecord[]
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
}) {
  const { projects, activeProjectId, onSelectProject } = props
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Recent projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your film drafts, short scripts, and YouTube outlines in sync.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {projects.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create a project to see it appear here.
          </p>
        )}
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={cn(
              'w-full rounded-lg border px-4 py-3 text-left transition',
              project.id === activeProjectId
                ? 'border-primary bg-primary/10 text-primary-foreground shadow'
                : 'border-border bg-background/60 hover:border-primary/50',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {project.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {project.project_type} • {new Date(project.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Languages: {project.languages.join(', ')}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function SettingsCard(props: {
  settings: SettingsPayload | null
  modelGroups: BootstrapResponse['model_options'] | null
  onSettingChange: (key: keyof SettingsPayload, value: string) => void
  onApiKeyChange: (field: string, value: string) => void
  onSave: () => void
  dirty: boolean
  busy: boolean
}) {
  const { settings, modelGroups, onSettingChange, onApiKeyChange, onSave, dirty, busy } = props

  if (!settings || !modelGroups) return null

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Model preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the default models for speech capture, synthesis, and AI
            drafting.
          </p>
        </div>
        <Button onClick={onSave} disabled={!dirty || busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            'Save preferences'
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ModelSelector
          label="Speech to text"
          value={settings.stt_model}
          options={modelGroups.speech_to_text}
          onChange={(value) => onSettingChange('stt_model', value)}
        />
        <ModelSelector
          label="Text to speech"
          value={settings.tts_model}
          options={modelGroups.text_to_speech}
          onChange={(value) => onSettingChange('tts_model', value)}
        />
        <ModelSelector
          label="Language model"
          value={settings.llm_model}
          options={modelGroups.language_models}
          onChange={(value) => onSettingChange('llm_model', value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {API_KEY_FIELDS.map(({ id, label }) => (
          <div key={id} className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </label>
            <input
              type="password"
              value={settings.api_keys?.[id] ?? ''}
              onChange={(event) => onApiKeyChange(id, event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelSelector(props: {
  label: string
  value: string
  options: ModelOption[]
  onChange: (value: string) => void
}) {
  const { label, value, options, onChange } = props

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title} ({option.size_mb} MB)
          </option>
        ))}
      </select>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {options.find((option) => option.id === value)?.provider ?? ''}
      </p>
    </div>
  )
}

function AssistantsCard() {
  const assistants = [
    {
      title: 'Write with AI',
      description:
        'Draft, expand, and translate scenes using local Mistral 7B or Granite SLM.',
      icon: Sparkles,
    },
    {
      title: 'Language Switch',
      description:
        'Inline English → Tamil transliteration keyboard with phonetic hints.',
      icon: Languages,
    },
    {
      title: 'Scene Doctor',
      description: 'Structure analysis, pacing feedback, and beat detection.',
      icon: Brain,
    },
    {
      title: 'Speech Studio',
      description: 'Capture table reads, diarise speakers, and sync to Markdown.',
      icon: MicVocal,
    },
    {
      title: 'Voice Lab',
      description: 'Coqui XTTS cloning + eSpeak instant previews built-in.',
      icon: FileAudio2,
    },
  ] as const

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold">Creative copilots</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {assistants.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/60 p-4"
          >
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function isUnauthorized(error: unknown): boolean {
  const message = formatError(error).toLowerCase()
  return message.includes('unauthorized')
}

function findWordStart(text: string, index: number): number {
  let cursor = Math.max(0, Math.min(index, text.length))
  while (cursor > 0) {
    const char = text[cursor - 1]
    if (/\s/.test(char) || /[.,!?;:(){}\[\]"'`~]/.test(char)) {
      break
    }
    cursor -= 1
  }
  return cursor
}

function findFirstMarkdown(entries: ProjectFileEntry[]): string | null {
  for (const entry of entries) {
    if (entry.is_directory) {
      const child = findFirstMarkdown(entry.children ?? [])
      if (child) return child
    } else {
      const lower = entry.path.toLowerCase()
      if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
        return entry.path
      }
    }
  }
  return null
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export default App
