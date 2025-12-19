import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  getSkillPresets,
  configureSkillGenerator,
  testSkillConnection,
  generateSkills,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Input } from '@/components/bauhaus'
import {
  Settings,
  CheckCircle,
  XCircle,
  Sparkles,
  Eye,
  Copy,
} from 'lucide-react'

const PRESET_INFO: Record<string, { icon: string; color: string }> = {
  openai: { icon: '🟢', color: 'bg-terminal-green' },
  anthropic: { icon: '🟠', color: 'bg-agent-claude' },
  deepseek: { icon: '🔵', color: 'bg-bauhaus-blue' },
  groq: { icon: '⚡', color: 'bg-bauhaus-yellow' },
  openrouter: { icon: '🌐', color: 'bg-bauhaus-charcoal' },
  together: { icon: '🤝', color: 'bg-bauhaus-blue' },
  fireworks: { icon: '🎆', color: 'bg-bauhaus-red' },
  ollama: { icon: '🦙', color: 'bg-bauhaus-charcoal' },
  dashscope: { icon: '🟣', color: 'bg-agent-qwen' },
  mistral: { icon: '🔷', color: 'bg-bauhaus-blue' },
}

export default function SkillGenerator() {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message?: string
  } | null>(null)
  const [generatedSkills, setGeneratedSkills] = useState<
    Array<{ filename: string; content: string; agent: string }>
  >([])
  const [selectedSkillPreview, setSelectedSkillPreview] = useState<string | null>(null)

  const { data: presets } = useQuery({
    queryKey: ['skill-presets'],
    queryFn: getSkillPresets,
  })

  const configureMutation = useMutation({
    mutationFn: () =>
      configureSkillGenerator({
        base_url: selectedPreset && presets?.[selectedPreset]
          ? presets[selectedPreset].base_url
          : customBaseUrl,
        api_key: apiKey,
        model: model || (selectedPreset && presets?.[selectedPreset]
          ? presets[selectedPreset].models[0]
          : ''),
        temperature,
      }),
    onSuccess: () => {
      setTestResult(null)
    },
  })

  const testMutation = useMutation({
    mutationFn: testSkillConnection,
    onSuccess: (data) => {
      setTestResult({
        success: data.success,
        message: data.success
          ? `Connected! Found ${data.models?.length || 0} models`
          : data.error,
      })
    },
    onError: (error: Error) => {
      setTestResult({ success: false, message: error.message })
    },
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      generateSkills(
        {
          name: 'Sample Project',
          model_id: 'Qwen/Qwen2.5-VL-2B-Instruct',
          method: 'LoRA',
          image_count: 100,
          data_rows: 1000,
          schema: {
            records: [
              { field1: 'string', field2: 'date', field3: 'integer' },
            ],
          },
        },
        ['claude', 'gemini', 'aider']
      ),
    onSuccess: (data) => {
      setGeneratedSkills(data)
      if (data.length > 0) {
        setSelectedSkillPreview(data[0].filename)
      }
    },
  })

  const handleSelectPreset = (preset: string) => {
    setSelectedPreset(preset)
    setCustomBaseUrl('')
    if (presets?.[preset]) {
      setModel(presets[preset].models[0])
    }
  }

  const handleConfigure = async () => {
    await configureMutation.mutateAsync()
    testMutation.mutate()
  }

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Skill Generator</h1>
        <p className="page-subtitle">
          Configure an OpenAI-compatible API to generate agent skill files
        </p>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="space-y-6">
            {/* Provider Presets */}
            <Card variant="blue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Provider Presets
                </CardTitle>
                <CardDescription>
                  Select a provider or use a custom endpoint
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {presets &&
                    Object.entries(presets).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => handleSelectPreset(key)}
                        className={`p-3 border-2 text-left transition-all ${
                          selectedPreset === key
                            ? 'border-bauhaus-blue bg-bauhaus-blue/5'
                            : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                        }`}
                      >
                        <span className="text-lg mr-2">
                          {PRESET_INFO[key]?.icon || '📦'}
                        </span>
                        <span className="font-medium text-sm">{preset.name}</span>
                      </button>
                    ))}
                  <button
                    onClick={() => {
                      setSelectedPreset(null)
                      setModel('')
                    }}
                    className={`p-3 border-2 text-left transition-all ${
                      selectedPreset === null
                        ? 'border-bauhaus-blue bg-bauhaus-blue/5'
                        : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                    }`}
                  >
                    <span className="text-lg mr-2">⚙️</span>
                    <span className="font-medium text-sm">Custom</span>
                  </button>
                </div>

                {/* Custom Base URL */}
                {selectedPreset === null && (
                  <Input
                    label="Custom Base URL"
                    placeholder="https://api.example.com/v1"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                  />
                )}
              </CardContent>
            </Card>

            {/* API Configuration */}
            <Card variant="yellow">
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  label="API Key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />

                <Input
                  label="Model"
                  placeholder={
                    selectedPreset && presets?.[selectedPreset]
                      ? presets[selectedPreset].models[0]
                      : 'gpt-4o'
                  }
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  hint={
                    selectedPreset && presets?.[selectedPreset]
                      ? `Available: ${presets[selectedPreset].models.join(', ')}`
                      : undefined
                  }
                />

                <div>
                  <label className="block text-sm font-medium text-bauhaus-black mb-2">
                    Temperature: {temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="blue"
                    onClick={handleConfigure}
                    loading={configureMutation.isPending || testMutation.isPending}
                    disabled={!apiKey || (!selectedPreset && !customBaseUrl)}
                  >
                    Configure & Test
                  </Button>
                </div>

                {/* Test Result */}
                {testResult && (
                  <div
                    className={`flex items-center gap-2 p-3 ${
                      testResult.success
                        ? 'bg-terminal-green/10 text-terminal-green'
                        : 'bg-bauhaus-red/10 text-bauhaus-red'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span className="text-sm">{testResult.message}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generate Skills */}
            <Card variant="red">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Generate Skills
                </CardTitle>
                <CardDescription>
                  Generate configuration files for CLI agents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-bauhaus-gray mb-4">
                  This will generate CLAUDE.md, GEMINI.md, and .aider.conf.yml
                  files using the configured API.
                </p>
                <Button
                  variant="red"
                  onClick={() => generateMutation.mutate()}
                  loading={generateMutation.isPending}
                  disabled={!testResult?.success}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Skill Files
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Generated Files Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {generatedSkills.length > 0 ? (
                  <>
                    {/* File Tabs */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {generatedSkills.map((skill) => (
                        <button
                          key={skill.filename}
                          onClick={() => setSelectedSkillPreview(skill.filename)}
                          className={`px-3 py-1.5 text-sm font-medium transition-all ${
                            selectedSkillPreview === skill.filename
                              ? 'bg-bauhaus-black text-white'
                              : 'bg-bauhaus-light hover:bg-bauhaus-silver'
                          }`}
                        >
                          {skill.filename}
                        </button>
                      ))}
                    </div>

                    {/* Content Preview */}
                    {selectedSkillPreview && (
                      <div className="relative">
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            onClick={() => {
                              const skill = generatedSkills.find(
                                (s) => s.filename === selectedSkillPreview
                              )
                              if (skill) copyToClipboard(skill.content)
                            }}
                            className="p-1.5 bg-bauhaus-light hover:bg-bauhaus-silver rounded transition"
                            title="Copy to clipboard"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <pre className="bg-terminal-bg text-terminal-text p-4 rounded-lg overflow-auto max-h-[500px] text-sm">
                          <code>
                            {generatedSkills.find(
                              (s) => s.filename === selectedSkillPreview
                            )?.content || ''}
                          </code>
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                    <p className="text-bauhaus-gray">
                      Configure and test the API, then generate skill files
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">About Skill Files</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-bauhaus-gray space-y-3">
                <p>
                  <strong>CLAUDE.md</strong> - Configuration file for Claude Code CLI.
                  Contains project context, schema, and instructions.
                </p>
                <p>
                  <strong>GEMINI.md</strong> - Configuration for Gemini CLI with
                  task definitions and tool usage guidelines.
                </p>
                <p>
                  <strong>.aider.conf.yml</strong> - YAML configuration for Aider
                  with model settings and project context.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
