import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  createProject,
  uploadFiles,
  getSettings,
  getCachedModels,
  configureSkillGenerator,
  generateSkills,
  type DetectionResult,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Input, Badge } from '@/components/bauhaus'
import { cn, formatBytes } from '@/lib/utils'
import {
  Upload,
  Image as ImageIcon,
  FileSpreadsheet,
  FileJson,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  FolderPlus,
  Sparkles,
  Play,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react'

// CLI Tool options
const CLI_TOOLS = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s AI coding assistant with research capabilities',
    icon: '🟠',
    color: 'bg-agent-claude',
    file: 'CLAUDE.md',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s AI with 1M token context window',
    icon: '🔵',
    color: 'bg-agent-gemini',
    file: 'GEMINI.md',
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'Open source pair programming assistant',
    icon: '🟢',
    color: 'bg-terminal-green',
    file: '.aider.conf.yml',
  },
] as const

type CLIToolId = typeof CLI_TOOLS[number]['id']

// Skill variation types
interface SkillVariation {
  id: string
  name: string
  description: string
  features: string[]
  content: string
}

export default function NewProject() {
  const navigate = useNavigate()

  // Steps: info -> upload -> cli -> skills -> review
  const [step, setStep] = useState<'info' | 'upload' | 'cli' | 'skills' | 'review'>('info')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [selectedCLI, setSelectedCLI] = useState<CLIToolId | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [skillVariations, setSkillVariations] = useState<SkillVariation[]>([])
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null)
  const [copiedVariation, setCopiedVariation] = useState<string | null>(null)
  const [isGeneratingSkills, setIsGeneratingSkills] = useState(false)

  // Fetch settings and cached models
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const { data: cachedModels } = useQuery({
    queryKey: ['cached-models'],
    queryFn: getCachedModels,
  })

  const hasApiConfigured = Boolean(
    settings?.openai?.api_key && settings?.openai?.base_url
  )

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: () => createProject(projectName, projectDescription),
    onSuccess: (data) => {
      setProjectId(data.id)
      setStep('upload')
    },
  })

  // Upload files mutation
  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadFiles(projectId!, files),
    onSuccess: (data) => {
      setDetection(data)
      setStep('cli')
    },
  })

  // Generate skill variations based on CLI and settings
  const generateSkillVariations = useCallback(async () => {
    if (!selectedCLI || !projectId || !hasApiConfigured) return

    setIsGeneratingSkills(true)

    try {
      // Configure skill generator with settings
      await configureSkillGenerator({
        base_url: settings?.openai?.base_url || '',
        api_key: settings?.openai?.api_key || '',
        model: settings?.openai?.model || 'gpt-4o',
        temperature: 0.7,
      })

      // Generate skills for the selected CLI
      const projectInfo = {
        name: projectName,
        model_id: selectedModel || 'Qwen/Qwen2.5-VL-2B-Instruct',
        method: settings?.training?.method || 'LoRA',
        image_count: detection?.images?.count || 0,
        data_rows: detection?.data?.row_count || 0,
        schema: detection?.schema?.schema || {},
      }

      const skills = await generateSkills(projectInfo, [selectedCLI])

      // Create three variations based on the generated skill
      const baseSkill = skills.find(s => s.agent === selectedCLI)
      if (baseSkill) {
        const variations: SkillVariation[] = [
          {
            id: 'minimal',
            name: 'Minimal Setup',
            description: 'Basic configuration for quick start',
            features: ['Essential commands', 'Basic prompts', 'Standard settings'],
            content: baseSkill.content,
          },
          {
            id: 'research',
            name: 'Research Mode',
            description: 'Enhanced with research and exploration capabilities',
            features: ['Web search integration', 'Documentation lookup', 'Code exploration', 'Autonomous research'],
            content: enhanceSkillWithResearch(baseSkill.content, selectedCLI),
          },
          {
            id: 'autonomous',
            name: 'Fully Autonomous',
            description: 'Maximum automation with all capabilities enabled',
            features: ['Auto-execution', 'Self-correction', 'Multi-step tasks', 'Research + Execution'],
            content: enhanceSkillWithAutonomous(baseSkill.content, selectedCLI),
          },
        ]
        setSkillVariations(variations)
        setSelectedVariation('autonomous') // Default to most capable
      }
    } catch (error) {
      console.error('Failed to generate skills:', error)
    } finally {
      setIsGeneratingSkills(false)
    }
  }, [selectedCLI, projectId, hasApiConfigured, settings, projectName, selectedModel, detection])

  // When CLI is selected, generate variations
  useEffect(() => {
    if (selectedCLI && step === 'skills') {
      generateSkillVariations()
    }
  }, [selectedCLI, step, generateSkillVariations])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    setUploadedFiles((prev) => [...prev, ...files])
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadedFiles((prev) => [...prev, ...files])
  }, [])

  const handleUpload = () => {
    if (uploadedFiles.length > 0 && projectId) {
      uploadMutation.mutate(uploadedFiles)
    }
  }

  const handleCLISelect = (cliId: CLIToolId) => {
    setSelectedCLI(cliId)
  }

  const handleContinueToSkills = () => {
    if (selectedCLI) {
      setStep('skills')
    }
  }

  const handleContinueToReview = () => {
    if (selectedVariation) {
      setStep('review')
    }
  }

  const handleStartTraining = () => {
    navigate(`/project/${projectId}/train`)
  }

  const handleCopySkill = async (content: string, variationId: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedVariation(variationId)
    setTimeout(() => setCopiedVariation(null), 2000)
  }

  // Step names for progress indicator
  const steps = [
    { key: 'info', label: 'Project Info' },
    { key: 'upload', label: 'Upload Data' },
    { key: 'cli', label: 'Choose CLI' },
    { key: 'skills', label: 'Generate Skills' },
    { key: 'review', label: 'Review & Start' },
  ]

  const currentStepIndex = steps.findIndex(s => s.key === step)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Create New Project</h1>
        <p className="page-subtitle">Set up a new VLM fine-tuning project</p>
      </div>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {steps.map((s, index) => {
            const isActive = s.key === step
            const isCompleted = currentStepIndex > index

            return (
              <div key={s.key} className="flex items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
                    isActive
                      ? 'bg-bauhaus-red text-white'
                      : isCompleted
                      ? 'bg-bauhaus-black text-white'
                      : 'bg-bauhaus-silver text-bauhaus-gray'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'ml-2 font-medium text-sm',
                    isActive ? 'text-bauhaus-black' : 'text-bauhaus-gray'
                  )}
                >
                  {s.label}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 mx-3',
                      isCompleted ? 'bg-bauhaus-black' : 'bg-bauhaus-silver'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step 1: Project Info */}
        {step === 'info' && (
          <Card variant="red">
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
              <CardDescription>
                Give your project a name and description
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Project Name"
                placeholder="e.g., Baptism Records OCR"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-bauhaus-black mb-2">
                  Description (optional)
                </label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-bauhaus-charcoal bg-white focus:outline-none focus:border-bauhaus-blue transition-colors resize-none"
                  rows={3}
                  placeholder="Describe what you want to fine-tune the model for..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-bauhaus-black mb-2">
                  Base Model (optional)
                </label>
                {cachedModels && cachedModels.length > 0 ? (
                  <select
                    className="w-full px-4 py-3 border-2 border-bauhaus-charcoal bg-white focus:outline-none focus:border-bauhaus-blue transition-colors"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="">Select a cached model</option>
                    {cachedModels.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name} ({(model.size_mb / 1024).toFixed(1)} GB)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-bauhaus-gray p-4 bg-bauhaus-light border-2 border-dashed border-bauhaus-silver">
                    No cached models. Visit the{' '}
                    <button
                      onClick={() => navigate('/models')}
                      className="text-bauhaus-blue underline"
                    >
                      Model Browser
                    </button>{' '}
                    to download models.
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  variant="red"
                  onClick={() => createMutation.mutate()}
                  disabled={!projectName || createMutation.isPending}
                  loading={createMutation.isPending}
                >
                  Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Upload Data */}
        {step === 'upload' && (
          <Card variant="blue">
            <CardHeader>
              <CardTitle>Upload Your Data</CardTitle>
              <CardDescription>
                Upload images and ground truth data - we'll detect the format automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dropzone */}
              <div
                className={cn(
                  'dropzone',
                  isDragging && 'dropzone-active'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Upload className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                <p className="text-lg font-medium text-bauhaus-charcoal mb-2">
                  Drop files or folders here
                </p>
                <p className="text-bauhaus-gray">or click to browse</p>
              </div>

              {/* Supported formats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <ImageIcon className="w-4 h-4" />
                  <span>.jpg .png .tiff .pdf</span>
                </div>
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>.xlsx .csv .tsv</span>
                </div>
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <FileJson className="w-4 h-4" />
                  <span>.json .jsonl</span>
                </div>
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <FolderPlus className="w-4 h-4" />
                  <span>.zip .tar.gz</span>
                </div>
              </div>

              {/* Uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="border-2 border-bauhaus-charcoal p-4">
                  <h4 className="font-medium mb-3">
                    Selected Files ({uploadedFiles.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uploadedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate">{file.name}</span>
                        <span className="text-bauhaus-gray ml-2">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-4">
                <Button variant="outline" onClick={() => setStep('info')}>
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back
                </Button>
                <Button
                  variant="blue"
                  onClick={handleUpload}
                  disabled={uploadedFiles.length === 0 || uploadMutation.isPending}
                  loading={uploadMutation.isPending}
                >
                  Upload & Analyze
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Choose CLI Tool */}
        {step === 'cli' && (
          <div className="space-y-6">
            {/* Detection Results Summary */}
            {detection && (
              <Card variant="yellow">
                <CardHeader>
                  <CardTitle>Detected Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {detection.images && (
                      <div className="flex items-center gap-3">
                        <ImageIcon className="w-8 h-8 text-bauhaus-blue" />
                        <div>
                          <p className="font-bold">{detection.images.count}</p>
                          <p className="text-sm text-bauhaus-gray">Images</p>
                        </div>
                      </div>
                    )}
                    {detection.data && (
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-terminal-green" />
                        <div>
                          <p className="font-bold">{detection.data.row_count}</p>
                          <p className="text-sm text-bauhaus-gray">Data Rows</p>
                        </div>
                      </div>
                    )}
                    {detection.schema && (
                      <div className="flex items-center gap-3">
                        <FileJson className="w-8 h-8 text-bauhaus-yellow-dark" />
                        <div>
                          <p className="font-bold">Schema</p>
                          <p className="text-sm text-bauhaus-gray">{detection.schema.source}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CLI Tool Selection */}
            <Card variant="red">
              <CardHeader>
                <CardTitle>Choose Your CLI Tool</CardTitle>
                <CardDescription>
                  Select which AI coding assistant will help with fine-tuning
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CLI_TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => handleCLISelect(tool.id)}
                      className={cn(
                        'p-6 border-2 text-left transition-all',
                        selectedCLI === tool.id
                          ? 'border-bauhaus-red bg-bauhaus-red/5'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      )}
                    >
                      <span className="text-3xl mb-3 block">{tool.icon}</span>
                      <h4 className="font-bold text-lg mb-1">{tool.name}</h4>
                      <p className="text-sm text-bauhaus-gray">{tool.description}</p>
                      <Badge variant="gray" className="mt-3">
                        {tool.file}
                      </Badge>
                    </button>
                  ))}
                </div>

                {!hasApiConfigured && (
                  <div className="p-4 bg-bauhaus-yellow/10 border-l-4 border-bauhaus-yellow">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-bauhaus-yellow-dark flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-bauhaus-charcoal">API Not Configured</p>
                        <p className="text-sm text-bauhaus-gray mt-1">
                          You need to configure an OpenAI-compatible API in{' '}
                          <button
                            onClick={() => navigate('/settings')}
                            className="text-bauhaus-blue underline"
                          >
                            Settings
                          </button>{' '}
                          to generate skill files.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <Button variant="outline" onClick={() => setStep('upload')}>
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back
                  </Button>
                  <Button
                    variant="red"
                    onClick={handleContinueToSkills}
                    disabled={!selectedCLI || !hasApiConfigured}
                  >
                    Generate Skills
                    <Sparkles className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Generate Skills with Variations */}
        {step === 'skills' && (
          <div className="space-y-6">
            <Card variant="blue">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Skill Configurations
                    </CardTitle>
                    <CardDescription>
                      Choose a configuration for {CLI_TOOLS.find(t => t.id === selectedCLI)?.name}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSkillVariations}
                    loading={isGeneratingSkills}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isGeneratingSkills ? (
                  <div className="text-center py-12">
                    <RefreshCw className="w-12 h-12 animate-spin text-bauhaus-blue mx-auto mb-4" />
                    <p className="text-bauhaus-gray">Generating skill variations...</p>
                  </div>
                ) : skillVariations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {skillVariations.map((variation) => (
                      <div
                        key={variation.id}
                        className={cn(
                          'border-2 p-4 cursor-pointer transition-all',
                          selectedVariation === variation.id
                            ? 'border-bauhaus-blue bg-bauhaus-blue/5'
                            : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                        )}
                        onClick={() => setSelectedVariation(variation.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold">{variation.name}</h4>
                          {selectedVariation === variation.id && (
                            <CheckCircle className="w-5 h-5 text-bauhaus-blue" />
                          )}
                        </div>
                        <p className="text-sm text-bauhaus-gray mb-3">
                          {variation.description}
                        </p>
                        <div className="space-y-1">
                          {variation.features.map((feature, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <div className="w-1.5 h-1.5 bg-bauhaus-blue rounded-full" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopySkill(variation.content, variation.id)
                          }}
                          className="mt-4 flex items-center gap-1 text-xs text-bauhaus-gray hover:text-bauhaus-blue transition"
                        >
                          {copiedVariation === variation.id ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy Config
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-bauhaus-gray">
                    No variations generated yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview Selected Variation */}
            {selectedVariation && skillVariations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Configuration Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-terminal-bg text-terminal-text p-4 rounded overflow-x-auto max-h-64 text-sm">
                    <code>
                      {skillVariations.find(v => v.id === selectedVariation)?.content || ''}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between gap-4">
              <Button variant="outline" onClick={() => setStep('cli')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <Button
                variant="blue"
                onClick={handleContinueToReview}
                disabled={!selectedVariation}
              >
                Continue
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Start */}
        {step === 'review' && (
          <div className="space-y-6">
            <Card variant="red">
              <CardHeader>
                <CardTitle>Project Summary</CardTitle>
                <CardDescription>
                  Review your project configuration before starting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-bauhaus-gray text-sm mb-1">Project Name</h4>
                    <p className="font-bold">{projectName}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-bauhaus-gray text-sm mb-1">CLI Tool</h4>
                    <p className="font-bold flex items-center gap-2">
                      <span>{CLI_TOOLS.find(t => t.id === selectedCLI)?.icon}</span>
                      {CLI_TOOLS.find(t => t.id === selectedCLI)?.name}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-bauhaus-gray text-sm mb-1">Base Model</h4>
                    <p className="font-mono text-sm">
                      {selectedModel || 'Default (Qwen2.5-VL-2B-Instruct)'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-bauhaus-gray text-sm mb-1">Configuration</h4>
                    <p className="font-bold">
                      {skillVariations.find(v => v.id === selectedVariation)?.name}
                    </p>
                  </div>
                </div>

                {detection && (
                  <div className="border-t border-bauhaus-silver pt-6">
                    <h4 className="font-medium mb-3">Data Summary</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {detection.images && (
                        <div className="bg-bauhaus-light p-3">
                          <p className="text-bauhaus-gray">Images</p>
                          <p className="font-bold text-lg">{detection.images.count}</p>
                        </div>
                      )}
                      {detection.data && (
                        <div className="bg-bauhaus-light p-3">
                          <p className="text-bauhaus-gray">Data Rows</p>
                          <p className="font-bold text-lg">{detection.data.row_count}</p>
                        </div>
                      )}
                      <div className="bg-bauhaus-light p-3">
                        <p className="text-bauhaus-gray">Training Method</p>
                        <p className="font-bold text-lg">{settings?.training?.method || 'LoRA'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {detection?.warnings && detection.warnings.length > 0 && (
                  <div className="space-y-2">
                    {detection.warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-bauhaus-red text-sm"
                      >
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detection?.suggestions && detection.suggestions.length > 0 && (
                  <div className="space-y-2">
                    {detection.suggestions.map((suggestion, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-bauhaus-blue text-sm"
                      >
                        <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{suggestion}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between gap-4">
              <Button variant="outline" onClick={() => setStep('skills')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <Button variant="red" onClick={handleStartTraining}>
                <Play className="w-5 h-5 mr-2" />
                Start Training
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper functions to enhance skills with additional capabilities
function enhanceSkillWithResearch(content: string, cliTool: CLIToolId): string {
  const researchAdditions: Record<CLIToolId, string> = {
    claude: `\n\n## Research Capabilities

When working on this project, you have the ability to:
- Search the web for documentation and best practices
- Explore the codebase to understand existing patterns
- Look up HuggingFace model documentation
- Research training techniques and hyperparameters

Use these capabilities proactively to make informed decisions.`,
    gemini: `\n\n## Research Mode

Enable research mode for comprehensive analysis:
- Use web search to find relevant documentation
- Cross-reference with HuggingFace model cards
- Analyze similar fine-tuning approaches
- Validate training configurations against best practices`,
    aider: `\n# Research Settings
research-mode: true
web-search: enabled
doc-lookup: enabled
codebase-exploration: true`,
  }

  return content + (researchAdditions[cliTool] || '')
}

function enhanceSkillWithAutonomous(content: string, cliTool: CLIToolId): string {
  const autonomousAdditions: Record<CLIToolId, string> = {
    claude: `\n\n## Autonomous Execution Mode

You are configured for fully autonomous operation:
- Execute multi-step tasks without confirmation
- Self-correct errors and retry failed operations
- Make informed decisions about training parameters
- Automatically handle data preprocessing
- Monitor training progress and adjust as needed

### Auto-Execution Rules
1. Proceed with standard operations automatically
2. Only pause for critical decisions affecting model quality
3. Log all actions for review
4. Implement rollback on critical failures`,
    gemini: `\n\n## Autonomous Configuration

Fully autonomous mode enabled:
- Auto-execute: true
- Self-correction: enabled
- Multi-step-tasks: autonomous
- Error-handling: auto-retry
- Decision-making: informed-autonomous

The agent will proceed with training pipeline autonomously, only pausing for critical user decisions.`,
    aider: `\n# Autonomous Settings
auto-commits: true
auto-test: true
auto-lint: true
yes-always: true
stream: true
map-tokens: 2048
cache-prompts: true`,
  }

  return enhanceSkillWithResearch(content, cliTool) + (autonomousAdditions[cliTool] || '')
}
