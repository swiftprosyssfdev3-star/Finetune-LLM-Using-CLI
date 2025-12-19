import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  getSettings,
  configureSkillGenerator,
  testSkillConnection,
  generateSkills,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Badge } from '@/components/bauhaus'
import {
  Settings,
  CheckCircle,
  XCircle,
  Sparkles,
  Eye,
  Copy,
  AlertCircle,
  Server,
} from 'lucide-react'

export default function SkillGenerator() {
  const [temperature, setTemperature] = useState(0.7)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message?: string
  } | null>(null)
  const [generatedSkills, setGeneratedSkills] = useState<
    Array<{ filename: string; content: string; agent: string }>
  >([])
  const [selectedSkillPreview, setSelectedSkillPreview] = useState<string | null>(null)

  // Fetch settings from Settings page
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  // Check if API is configured
  const isApiConfigured = settings?.openai?.base_url && settings?.openai?.api_key
  const configuredBaseUrl = settings?.openai?.base_url || ''
  const configuredApiKey = settings?.openai?.api_key || ''
  const configuredModel = settings?.openai?.model || 'gpt-4o'

  const configureMutation = useMutation({
    mutationFn: () =>
      configureSkillGenerator({
        base_url: configuredBaseUrl,
        api_key: configuredApiKey,
        model: configuredModel,
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

  const handleTestConnection = async () => {
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
          Generate agent skill files using your configured API
        </p>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="space-y-6">
            {/* API Configuration - Uses Settings */}
            <Card variant="blue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  API Configuration
                </CardTitle>
                <CardDescription>
                  Using settings from the Settings page
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingSettings ? (
                  <div className="text-center py-4">
                    <p className="text-bauhaus-gray">Loading settings...</p>
                  </div>
                ) : isApiConfigured ? (
                  <>
                    {/* Show configured settings */}
                    <div className="bg-bauhaus-light p-4 rounded space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-bauhaus-gray">Base URL</span>
                        <span className="text-sm font-mono truncate max-w-[200px]">
                          {configuredBaseUrl}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-bauhaus-gray">API Key</span>
                        <Badge variant="green">Configured</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-bauhaus-gray">Model</span>
                        <span className="text-sm font-mono">{configuredModel}</span>
                      </div>
                    </div>

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
                      <p className="text-xs text-bauhaus-gray mt-1">
                        Controls randomness in skill generation
                      </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="blue"
                        onClick={handleTestConnection}
                        loading={configureMutation.isPending || testMutation.isPending}
                      >
                        Test Connection
                      </Button>
                      <Link to="/settings">
                        <Button variant="ghost" size="sm">
                          <Settings className="w-4 h-4 mr-1" />
                          Edit Settings
                        </Button>
                      </Link>
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
                  </>
                ) : (
                  /* API Not Configured - Show message with link to Settings */
                  <div className="text-center py-6">
                    <AlertCircle className="w-12 h-12 mx-auto text-bauhaus-yellow mb-4" />
                    <h3 className="font-medium text-bauhaus-black mb-2">
                      API Not Configured
                    </h3>
                    <p className="text-sm text-bauhaus-gray mb-4">
                      Configure your OpenAI-compatible API in the Settings page to generate skill files.
                    </p>
                    <Link to="/settings">
                      <Button variant="yellow">
                        <Settings className="w-4 h-4 mr-2" />
                        Go to Settings
                      </Button>
                    </Link>
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
                  disabled={!isApiConfigured || !testResult?.success}
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
                      Test the API connection, then generate skill files
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
