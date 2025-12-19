import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createProject,
  uploadFiles,
  getSettings,
  generateSkillsWithSettings,
  type DetectionResult,
  type GeneratedSkill,
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
  ArrowRight,
  ArrowLeft,
  Terminal,
  Sparkles,
  Play,
} from 'lucide-react'

type Step = 'info' | 'upload' | 'cli' | 'skills' | 'ready'

const CLI_AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Anthropic\'s AI coding assistant with autonomous execution',
    icon: '🟠',
    color: 'bg-agent-claude',
    features: ['Autonomous research', 'Code generation', 'File operations'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s AI with 1M context window',
    icon: '🔵',
    color: 'bg-bauhaus-blue',
    features: ['Large context', 'Multi-modal', 'Code analysis'],
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'Open source pair programming assistant',
    icon: '🟢',
    color: 'bg-terminal-green',
    features: ['Git integration', 'Code refactoring', 'Test generation'],
  },
] as const

type CliAgent = typeof CLI_AGENTS[number]['id']

interface SkillVariation {
  id: string
  name: string
  description: string
  skills: GeneratedSkill[]
  focus: 'speed' | 'quality' | 'balanced'
}

export default function NewProject() {
  const navigate = useNavigate()

  // Core state
  const [step, setStep] = useState<Step>('info')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detection, setDetection] = useState<DetectionResult | null>(null)

  // File upload state
  const [isDragging, setIsDragging] = useState(false)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [groundTruthFiles, setGroundTruthFiles] = useState<File[]>([])

  // CLI and skills state
  const [selectedCli, setSelectedCli] = useState<CliAgent | null>(null)
  const [skillVariations, setSkillVariations] = useState<SkillVariation[]>([])
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null)

  // Check if API is configured
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const hasApiConfigured = !!(
    settings?.openai?.base_url &&
    settings?.openai?.api_key
  )

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => createProject(projectName, projectDescription),
    onSuccess: (data) => {
      setProjectId(data.id)
      setStep('upload')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadFiles(projectId!, files),
    onSuccess: (data) => {
      setDetection(data)
      setStep('cli')
    },
  })

  const generateSkillsMutation = useMutation({
    mutationFn: () => {
      const projectInfo = {
        name: projectName,
        model_id: 'Qwen/Qwen2.5-VL-2B-Instruct',
        method: settings?.training?.method || 'LoRA',
        image_count: detection?.images?.count || 0,
        data_rows: detection?.data?.row_count || 0,
        schema: detection?.schema?.schema || {},
        cli_agent: selectedCli,
      }
      // Use the unified settings for skill generation
      return generateSkillsWithSettings(projectInfo, [selectedCli!])
    },
    onSuccess: (skills) => {
      // Generate 3 variations based on the skills
      const variations: SkillVariation[] = [
        {
          id: 'speed',
          name: 'Speed Optimized',
          description: 'Prioritizes quick iterations with smaller batch sizes',
          skills: skills.map((s) => ({
            ...s,
            content: s.content.replace(/batch_size: \d+/, 'batch_size: 2')
              .replace(/epochs: \d+/, 'epochs: 5'),
          })),
          focus: 'speed',
        },
        {
          id: 'balanced',
          name: 'Balanced',
          description: 'Recommended settings for most use cases',
          skills,
          focus: 'balanced',
        },
        {
          id: 'quality',
          name: 'Quality Focused',
          description: 'Higher epochs and larger batches for better results',
          skills: skills.map((s) => ({
            ...s,
            content: s.content.replace(/batch_size: \d+/, 'batch_size: 8')
              .replace(/epochs: \d+/, 'epochs: 15'),
          })),
          focus: 'quality',
        },
      ]
      setSkillVariations(variations)
      setSelectedVariation('balanced')
      setStep('skills')
    },
  })

  // Handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    setImageFiles((prev) => [...prev, ...files])
  }, [])

  const handleGroundTruthDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    setGroundTruthFiles((prev) => [...prev, ...files])
  }, [])

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setImageFiles((prev) => [...prev, ...files])
  }, [])

  const handleGroundTruthSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setGroundTruthFiles((prev) => [...prev, ...files])
  }, [])

  const handleUpload = () => {
    const allFiles = [...imageFiles, ...groundTruthFiles]
    if (allFiles.length > 0 && projectId) {
      uploadMutation.mutate(allFiles)
    }
  }

  const handleSelectCli = (cliId: CliAgent) => {
    setSelectedCli(cliId)
  }

  const handleGenerateSkills = () => {
    if (selectedCli && hasApiConfigured) {
      generateSkillsMutation.mutate()
    }
  }

  const handleStartTraining = () => {
    if (projectId && selectedCli) {
      navigate(`/project/${projectId}/train?agent=${selectedCli}`)
    }
  }

  const getStepNumber = () => {
    const steps: Step[] = ['info', 'upload', 'cli', 'skills', 'ready']
    return steps.indexOf(step) + 1
  }

  const canProceed = () => {
    switch (step) {
      case 'info':
        return projectName.length > 0
      case 'upload':
        return imageFiles.length > 0 || groundTruthFiles.length > 0
      case 'cli':
        return selectedCli !== null
      case 'skills':
        return selectedVariation !== null
      default:
        return true
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">New Fine-Tuning Project</h1>
        <p className="page-subtitle">
          Set up your data, select a CLI agent, and start autonomous fine-tuning
        </p>
      </div>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {['Project Info', 'Upload Data', 'Select CLI', 'Generate Skills', 'Ready'].map((label, index) => {
            const stepNumber = index + 1
            const currentStep = getStepNumber()
            const isActive = stepNumber === currentStep
            const isCompleted = stepNumber < currentStep

            return (
              <div key={label} className="flex items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold',
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
                    stepNumber
                  )}
                </div>
                <span
                  className={cn(
                    'ml-2 font-medium text-sm hidden md:inline',
                    isActive ? 'text-bauhaus-black' : 'text-bauhaus-gray'
                  )}
                >
                  {label}
                </span>
                {index < 4 && (
                  <div
                    className={cn(
                      'w-8 md:w-12 h-0.5 mx-2',
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
          <div className="space-y-6">
            <Card variant="blue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Upload Images
                </CardTitle>
                <CardDescription>
                  Upload your training images or image folders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    'dropzone',
                    isDragging && 'dropzone-active'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleImageDrop}
                  onClick={() => document.getElementById('image-input')?.click()}
                >
                  <input
                    id="image-input"
                    type="file"
                    multiple
                    accept="image/*,.zip,.tar.gz"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <Upload className="w-10 h-10 mx-auto text-bauhaus-gray mb-3" />
                  <p className="text-bauhaus-charcoal font-medium">
                    Drop images or folders here
                  </p>
                  <p className="text-sm text-bauhaus-gray">
                    Supports: .jpg, .png, .tiff, .pdf, .zip, .tar.gz
                  </p>
                </div>

                {imageFiles.length > 0 && (
                  <div className="border-2 border-bauhaus-charcoal p-4">
                    <h4 className="font-medium mb-2">
                      Images ({imageFiles.length})
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                      {imageFiles.map((file, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate">{file.name}</span>
                          <span className="text-bauhaus-gray">{formatBytes(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card variant="yellow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Upload Ground Truth
                </CardTitle>
                <CardDescription>
                  Upload your output/label file (CSV, Excel, JSON, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    'dropzone',
                    isDragging && 'dropzone-active'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleGroundTruthDrop}
                  onClick={() => document.getElementById('gt-input')?.click()}
                >
                  <input
                    id="gt-input"
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.jsonl,.tsv"
                    className="hidden"
                    onChange={handleGroundTruthSelect}
                  />
                  <Upload className="w-10 h-10 mx-auto text-bauhaus-gray mb-3" />
                  <p className="text-bauhaus-charcoal font-medium">
                    Drop ground truth file here
                  </p>
                  <p className="text-sm text-bauhaus-gray">
                    Supports: .xlsx, .csv, .tsv, .json, .jsonl
                  </p>
                </div>

                {groundTruthFiles.length > 0 && (
                  <div className="border-2 border-bauhaus-charcoal p-4">
                    <h4 className="font-medium mb-2">
                      Ground Truth ({groundTruthFiles.length})
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                      {groundTruthFiles.map((file, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate">{file.name}</span>
                          <span className="text-bauhaus-gray">{formatBytes(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('info')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <Button
                variant="blue"
                onClick={handleUpload}
                disabled={!canProceed() || uploadMutation.isPending}
                loading={uploadMutation.isPending}
              >
                Upload & Analyze
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Select CLI Agent */}
        {step === 'cli' && (
          <div className="space-y-6">
            {/* Detection Summary */}
            {detection && (
              <Card>
                <CardHeader>
                  <CardTitle>Data Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {detection.images && (
                      <div className="text-center p-4 bg-bauhaus-light">
                        <ImageIcon className="w-8 h-8 mx-auto text-bauhaus-blue mb-2" />
                        <div className="text-2xl font-bold">{detection.images.count}</div>
                        <div className="text-sm text-bauhaus-gray">Images</div>
                      </div>
                    )}
                    {detection.data && (
                      <div className="text-center p-4 bg-bauhaus-light">
                        <FileSpreadsheet className="w-8 h-8 mx-auto text-terminal-green mb-2" />
                        <div className="text-2xl font-bold">{detection.data.row_count}</div>
                        <div className="text-sm text-bauhaus-gray">Data Rows</div>
                      </div>
                    )}
                    {detection.schema && (
                      <div className="text-center p-4 bg-bauhaus-light">
                        <FileJson className="w-8 h-8 mx-auto text-bauhaus-yellow-dark mb-2" />
                        <div className="text-2xl font-bold">
                          {Object.keys(detection.schema.schema).length}
                        </div>
                        <div className="text-sm text-bauhaus-gray">Schema Fields</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card variant="red">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Select CLI Agent
                </CardTitle>
                <CardDescription>
                  Choose the AI agent that will handle your fine-tuning process
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CLI_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectCli(agent.id)}
                      className={cn(
                        'p-6 border-2 text-left transition-all',
                        selectedCli === agent.id
                          ? 'border-bauhaus-red bg-bauhaus-red/5'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      )}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{agent.icon}</span>
                        <div>
                          <div className="font-bold text-bauhaus-black">
                            {agent.name}
                          </div>
                          <div className="text-xs text-bauhaus-gray">
                            {agent.description}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {agent.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-2 text-sm text-bauhaus-charcoal">
                            <CheckCircle className="w-3 h-3 text-terminal-green" />
                            {feature}
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Generate Skills Button - appears directly after selection */}
                {selectedCli && (
                  <div className="mt-6 p-4 bg-bauhaus-light border-2 border-bauhaus-silver">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-bauhaus-black">
                          Ready to Generate Skills
                        </h4>
                        <p className="text-sm text-bauhaus-gray">
                          {hasApiConfigured
                            ? `Create ${selectedCli.toUpperCase()} configuration with research and autonomous execution capabilities`
                            : 'Configure API in Settings first to generate skills'}
                        </p>
                      </div>
                      <Button
                        variant="red"
                        onClick={handleGenerateSkills}
                        disabled={!hasApiConfigured || generateSkillsMutation.isPending}
                        loading={generateSkillsMutation.isPending}
                      >
                        <Sparkles className="w-5 h-5 mr-2" />
                        Generate Skills
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Skill Variations */}
        {step === 'skills' && (
          <div className="space-y-6">
            <Card variant="yellow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Select Configuration Variation
                </CardTitle>
                <CardDescription>
                  Choose the setup that best fits your needs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {skillVariations.map((variation) => (
                    <button
                      key={variation.id}
                      onClick={() => setSelectedVariation(variation.id)}
                      className={cn(
                        'p-6 border-2 text-left transition-all',
                        selectedVariation === variation.id
                          ? 'border-bauhaus-yellow-dark bg-bauhaus-yellow/10'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-bauhaus-black">
                          {variation.name}
                        </div>
                        {variation.focus === 'balanced' && (
                          <Badge variant="green" size="sm">Recommended</Badge>
                        )}
                      </div>
                      <p className="text-sm text-bauhaus-gray mb-4">
                        {variation.description}
                      </p>
                      <div className="text-xs text-bauhaus-charcoal">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'w-2 h-2 rounded-full',
                            variation.focus === 'speed' ? 'bg-terminal-green' :
                            variation.focus === 'quality' ? 'bg-bauhaus-blue' :
                            'bg-bauhaus-yellow-dark'
                          )} />
                          {variation.focus === 'speed' ? 'Fast iterations' :
                           variation.focus === 'quality' ? 'High quality output' :
                           'Best of both worlds'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Preview selected variation */}
                {selectedVariation && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-3">Generated Files Preview</h4>
                    <div className="bg-terminal-bg rounded-lg p-4 max-h-64 overflow-auto">
                      <pre className="text-sm text-terminal-text font-mono">
                        {skillVariations
                          .find((v) => v.id === selectedVariation)
                          ?.skills.map((s) => `# ${s.filename}\n${s.content.slice(0, 500)}...`)
                          .join('\n\n')}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('cli')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <Button
                variant="yellow"
                onClick={() => setStep('ready')}
                disabled={!selectedVariation}
              >
                Save & Continue
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Ready to Start */}
        {step === 'ready' && (
          <div className="space-y-6">
            <Card variant="blue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-terminal-green" />
                  Project Ready
                </CardTitle>
                <CardDescription>
                  Your project is configured and ready to start fine-tuning
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-bauhaus-light">
                    <div className="text-sm text-bauhaus-gray">Project</div>
                    <div className="font-bold text-bauhaus-black">{projectName}</div>
                  </div>
                  <div className="p-4 bg-bauhaus-light">
                    <div className="text-sm text-bauhaus-gray">CLI Agent</div>
                    <div className="font-bold text-bauhaus-black">
                      {CLI_AGENTS.find((a) => a.id === selectedCli)?.name}
                    </div>
                  </div>
                  {detection?.images && (
                    <div className="p-4 bg-bauhaus-light">
                      <div className="text-sm text-bauhaus-gray">Images</div>
                      <div className="font-bold text-bauhaus-black">
                        {detection.images.count} files
                      </div>
                    </div>
                  )}
                  {detection?.data && (
                    <div className="p-4 bg-bauhaus-light">
                      <div className="text-sm text-bauhaus-gray">Data Rows</div>
                      <div className="font-bold text-bauhaus-black">
                        {detection.data.row_count} rows
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-2 border-terminal-green bg-terminal-green/5">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-8 h-8 text-terminal-green" />
                    <div>
                      <div className="font-bold text-bauhaus-black">
                        Ready to Start Training
                      </div>
                      <p className="text-sm text-bauhaus-gray">
                        Click below to open the terminal and start autonomous fine-tuning
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('skills')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <Button
                variant="red"
                size="lg"
                onClick={handleStartTraining}
              >
                <Play className="w-5 h-5 mr-2" />
                Start Fine-Tuning
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
