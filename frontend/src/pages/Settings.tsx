import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSettings,
  updateSettings,
  testOpenAIConnection,
  testHuggingFaceConnection,
  type AppSettings,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Input, Badge } from '@/components/bauhaus'
import {
  Settings as SettingsIcon,
  Key,
  Server,
  Brain,
  CheckCircle,
  XCircle,
  Save,
  RefreshCw,
  Sparkles,
  Database,
  HardDrive,
  Zap,
  AlertCircle,
  Eye,
  EyeOff,
  Home,
  ArrowRight,
} from 'lucide-react'

type ConnectionStatus = {
  success: boolean
  message?: string
  models?: string[]
}

export default function Settings() {
  const queryClient = useQueryClient()

  // Form state
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [huggingfaceToken, setHuggingfaceToken] = useState('')
  const [defaultTrainingMethod, setDefaultTrainingMethod] = useState('lora')
  const [defaultBatchSize, setDefaultBatchSize] = useState('4')
  const [defaultLearningRate, setDefaultLearningRate] = useState('2e-4')
  const [defaultEpochs, setDefaultEpochs] = useState('3')
  const [modelCacheDir, setModelCacheDir] = useState('./models/cache')
  const [autoSaveInterval, setAutoSaveInterval] = useState('30')
  const [terminalTheme, setTerminalTheme] = useState('dark')

  // UI state
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showHfToken, setShowHfToken] = useState(false)
  const [openaiStatus, setOpenaiStatus] = useState<ConnectionStatus | null>(null)
  const [hfStatus, setHfStatus] = useState<ConnectionStatus | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      setOpenaiBaseUrl(settings.openai?.base_url || '')
      setOpenaiApiKey(settings.openai?.api_key || '')
      setOpenaiModel(settings.openai?.model || '')
      setHuggingfaceToken(settings.huggingface?.token || '')
      setDefaultTrainingMethod(settings.training?.method || 'lora')
      setDefaultBatchSize(String(settings.training?.batch_size || 4))
      setDefaultLearningRate(settings.training?.learning_rate || '2e-4')
      setDefaultEpochs(String(settings.training?.epochs || 3))
      setModelCacheDir(settings.storage?.model_cache_dir || './models/cache')
      setAutoSaveInterval(String(settings.app?.auto_save_interval || 30))
      setTerminalTheme(settings.app?.terminal_theme || 'dark')
    }
  }, [settings])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (newSettings: AppSettings) => updateSettings(newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setHasUnsavedChanges(false)
    },
  })

  // Test OpenAI connection
  const testOpenaiMutation = useMutation({
    mutationFn: () => testOpenAIConnection({
      base_url: openaiBaseUrl,
      api_key: openaiApiKey,
      model: openaiModel,
    }),
    onSuccess: (data) => {
      setOpenaiStatus({
        success: data.success,
        message: data.success
          ? `Connected! ${data.models?.length || 0} models available`
          : data.error,
        models: data.models,
      })
    },
    onError: (error: Error) => {
      setOpenaiStatus({ success: false, message: error.message })
    },
  })

  // Test HuggingFace connection
  const testHfMutation = useMutation({
    mutationFn: () => testHuggingFaceConnection(huggingfaceToken),
    onSuccess: (data) => {
      setHfStatus({
        success: data.success,
        message: data.success
          ? `Authenticated as ${data.username || 'user'}`
          : data.error,
      })
    },
    onError: (error: Error) => {
      setHfStatus({ success: false, message: error.message })
    },
  })

  const handleSave = () => {
    const newSettings: AppSettings = {
      openai: {
        base_url: openaiBaseUrl,
        api_key: openaiApiKey,
        model: openaiModel,
      },
      huggingface: {
        token: huggingfaceToken,
      },
      training: {
        method: defaultTrainingMethod,
        batch_size: parseInt(defaultBatchSize) || 4,
        learning_rate: defaultLearningRate,
        epochs: parseInt(defaultEpochs) || 3,
      },
      storage: {
        model_cache_dir: modelCacheDir,
      },
      app: {
        auto_save_interval: parseInt(autoSaveInterval) || 30,
        terminal_theme: terminalTheme,
      },
    }
    saveMutation.mutate(newSettings)
  }

  const markChanged = () => {
    if (!hasUnsavedChanges) setHasUnsavedChanges(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-bauhaus-blue mx-auto mb-4" />
          <p className="text-bauhaus-gray">Loading settings...</p>
        </div>
      </div>
    )
  }

  // Check if API is configured
  const hasApiConfigured = !!(openaiBaseUrl && openaiApiKey)

  return (
    <div className="min-h-screen">
      {/* Navigation Bar */}
      <div className="bg-white border-b border-bauhaus-silver px-8 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <Link to="/home" className="flex items-center gap-2 text-bauhaus-gray hover:text-bauhaus-black transition">
            <Home className="w-5 h-5" />
            <span className="font-medium">Home</span>
          </Link>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <Badge variant="yellow" className="animate-pulse">
                <AlertCircle className="w-3 h-3 mr-1" />
                Unsaved
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={!hasUnsavedChanges}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            {hasApiConfigured && (
              <Link to="/new">
                <Button variant="red" size="sm">
                  New Project
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="max-w-6xl mx-auto">
          <h1 className="page-title flex items-center gap-3">
            <SettingsIcon className="w-8 h-8" />
            Settings
          </h1>
          <p className="page-subtitle">
            Configure API keys, tokens, and application preferences
          </p>
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* OpenAI Compatible API Settings */}
          <Card variant="blue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                OpenAI Compatible API
              </CardTitle>
              <CardDescription>
                Configure your API provider for skill generation and autonomous operations.
                This is required before starting a new project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Base URL"
                placeholder="https://api.openai.com/v1"
                value={openaiBaseUrl}
                onChange={(e) => { setOpenaiBaseUrl(e.target.value); markChanged() }}
                hint="Use https://api.openai.com/v1 for OpenAI, or your custom endpoint"
              />

              <div className="relative">
                <Input
                  label="API Key"
                  type={showOpenaiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={openaiApiKey}
                  onChange={(e) => { setOpenaiApiKey(e.target.value); markChanged() }}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-8 text-bauhaus-gray hover:text-bauhaus-black transition"
                >
                  {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Input
                label="Default Model"
                placeholder="gpt-4o"
                value={openaiModel}
                onChange={(e) => { setOpenaiModel(e.target.value); markChanged() }}
                hint="Model to use for skill generation and other API calls"
              />

              <div className="flex gap-3 pt-2">
                <Button
                  variant="blue"
                  size="sm"
                  onClick={() => testOpenaiMutation.mutate()}
                  loading={testOpenaiMutation.isPending}
                  disabled={!openaiBaseUrl || !openaiApiKey}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Test Connection
                </Button>
              </div>

              {openaiStatus && (
                <div
                  className={`flex items-center gap-2 p-3 ${
                    openaiStatus.success
                      ? 'bg-terminal-green/10 text-terminal-green'
                      : 'bg-bauhaus-red/10 text-bauhaus-red'
                  }`}
                >
                  {openaiStatus.success ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="text-sm">{openaiStatus.message}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hugging Face Settings */}
          <Card variant="yellow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Hugging Face
              </CardTitle>
              <CardDescription>
                Access private models and increase API rate limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Input
                  label="Access Token"
                  type={showHfToken ? 'text' : 'password'}
                  placeholder="hf_..."
                  value={huggingfaceToken}
                  onChange={(e) => { setHuggingfaceToken(e.target.value); markChanged() }}
                  hint="Get your token at huggingface.co/settings/tokens"
                />
                <button
                  type="button"
                  onClick={() => setShowHfToken(!showHfToken)}
                  className="absolute right-3 top-8 text-bauhaus-gray hover:text-bauhaus-black transition"
                >
                  {showHfToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="bg-bauhaus-light p-3 rounded text-sm text-bauhaus-charcoal">
                <strong>Benefits of adding a token:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>Access gated and private models</li>
                  <li>Higher API rate limits</li>
                  <li>Download larger models</li>
                  <li>Push trained models to Hub</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="yellow"
                  size="sm"
                  onClick={() => testHfMutation.mutate()}
                  loading={testHfMutation.isPending}
                  disabled={!huggingfaceToken}
                >
                  <Key className="w-4 h-4 mr-1" />
                  Verify Token
                </Button>
              </div>

              {hfStatus && (
                <div
                  className={`flex items-center gap-2 p-3 ${
                    hfStatus.success
                      ? 'bg-terminal-green/10 text-terminal-green'
                      : 'bg-bauhaus-red/10 text-bauhaus-red'
                  }`}
                >
                  {hfStatus.success ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="text-sm">{hfStatus.message}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Training Defaults */}
          <Card variant="red">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Training Defaults
              </CardTitle>
              <CardDescription>
                Default settings for new training jobs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bauhaus-black mb-2">
                  Fine-tuning Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'lora', label: 'LoRA', desc: 'Low-rank adaptation' },
                    { value: 'qlora', label: 'QLoRA', desc: '4-bit quantized' },
                    { value: 'full', label: 'Full', desc: 'All parameters' },
                  ].map((method) => (
                    <button
                      key={method.value}
                      onClick={() => { setDefaultTrainingMethod(method.value); markChanged() }}
                      className={`p-3 border-2 text-left transition-all ${
                        defaultTrainingMethod === method.value
                          ? 'border-bauhaus-red bg-bauhaus-red/5'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      }`}
                    >
                      <span className="font-medium text-sm block">{method.label}</span>
                      <span className="text-xs text-bauhaus-gray">{method.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Batch Size"
                  type="number"
                  value={defaultBatchSize}
                  onChange={(e) => { setDefaultBatchSize(e.target.value); markChanged() }}
                />
                <Input
                  label="Learning Rate"
                  value={defaultLearningRate}
                  onChange={(e) => { setDefaultLearningRate(e.target.value); markChanged() }}
                />
                <Input
                  label="Epochs"
                  type="number"
                  value={defaultEpochs}
                  onChange={(e) => { setDefaultEpochs(e.target.value); markChanged() }}
                />
              </div>

              <p className="text-xs text-bauhaus-gray">
                These defaults will be applied to new projects. You can override them per-project.
              </p>
            </CardContent>
          </Card>

          {/* Storage & App Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Storage & Preferences
              </CardTitle>
              <CardDescription>
                Configure storage paths and application behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Model Cache Directory"
                value={modelCacheDir}
                onChange={(e) => { setModelCacheDir(e.target.value); markChanged() }}
                hint="Location where downloaded models are cached"
              />

              <div>
                <label className="block text-sm font-medium text-bauhaus-black mb-2">
                  Auto-save Interval (seconds)
                </label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="10"
                  value={autoSaveInterval}
                  onChange={(e) => { setAutoSaveInterval(e.target.value); markChanged() }}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-bauhaus-gray mt-1">
                  <span>10s</span>
                  <span className="font-medium text-bauhaus-black">{autoSaveInterval}s</span>
                  <span>120s</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bauhaus-black mb-2">
                  Terminal Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'dark', label: 'Dark', icon: '🌙' },
                    { value: 'light', label: 'Light', icon: '☀️' },
                  ].map((theme) => (
                    <button
                      key={theme.value}
                      onClick={() => { setTerminalTheme(theme.value); markChanged() }}
                      className={`p-3 border-2 text-left transition-all flex items-center gap-2 ${
                        terminalTheme === theme.value
                          ? 'border-bauhaus-black bg-bauhaus-black/5'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      }`}
                    >
                      <span className="text-lg">{theme.icon}</span>
                      <span className="font-medium text-sm">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Reference */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Common Provider Endpoints
              </CardTitle>
              <CardDescription>
                Quick reference for popular OpenAI-compatible providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'OpenAI', url: 'https://api.openai.com/v1', models: 'gpt-4o, gpt-4-turbo, gpt-3.5-turbo' },
                  { name: 'Anthropic', url: 'https://api.anthropic.com/v1', models: 'claude-3-opus, claude-3-sonnet' },
                  { name: 'Groq', url: 'https://api.groq.com/openai/v1', models: 'llama-3.1-70b, mixtral-8x7b' },
                  { name: 'Together AI', url: 'https://api.together.xyz/v1', models: 'Various open models' },
                  { name: 'Ollama (Local)', url: 'http://localhost:11434/v1', models: 'llama3, mistral, phi3' },
                  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', models: 'Multiple providers' },
                  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', models: 'deepseek-chat, deepseek-coder' },
                  { name: 'Mistral', url: 'https://api.mistral.ai/v1', models: 'mistral-large, mistral-medium' },
                  { name: 'Fireworks', url: 'https://api.fireworks.ai/inference/v1', models: 'Various models' },
                ].map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => {
                      setOpenaiBaseUrl(provider.url)
                      markChanged()
                    }}
                    className="p-3 border border-bauhaus-silver hover:border-bauhaus-blue hover:bg-bauhaus-blue/5 text-left transition-all"
                  >
                    <div className="font-medium text-sm">{provider.name}</div>
                    <div className="text-xs text-bauhaus-blue truncate">{provider.url}</div>
                    <div className="text-xs text-bauhaus-gray mt-1">{provider.models}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Save Status */}
        {saveMutation.isSuccess && (
          <div className="fixed bottom-6 right-6 bg-terminal-green text-white px-4 py-3 rounded shadow-lg flex items-center gap-2 animate-fade-in">
            <CheckCircle className="w-5 h-5" />
            Settings saved successfully!
          </div>
        )}

        {saveMutation.isError && (
          <div className="fixed bottom-6 right-6 bg-bauhaus-red text-white px-4 py-3 rounded shadow-lg flex items-center gap-2 animate-fade-in">
            <XCircle className="w-5 h-5" />
            Failed to save settings
          </div>
        )}
      </div>
    </div>
  )
}
