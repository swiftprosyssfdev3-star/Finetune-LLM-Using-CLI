import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createProject, uploadFiles, updateProject, searchModels, type DetectionResult, type ModelSearchResult } from '@/lib/api'
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
  FolderPlus,
  Box,
  Search,
  Download,
  Cpu,
} from 'lucide-react'

export default function NewProject() {
  const navigate = useNavigate()

  const [step, setStep] = useState<'info' | 'upload' | 'model' | 'review'>('info')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])

  // Model selection state
  const [selectedModel, setSelectedModel] = useState<ModelSearchResult | null>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState('Qwen VL')
  const [customModelId, setCustomModelId] = useState('')

  // Model search query
  const { data: modelResults, isLoading: isSearching, refetch: searchModelsRefetch } = useQuery({
    queryKey: ['model-search', modelSearchQuery],
    queryFn: () => searchModels({ query: modelSearchQuery, vlm_only: true, limit: 12 }),
    enabled: step === 'model' && modelSearchQuery.length > 0,
  })

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
      setStep('model') // Go to model selection instead of review
    },
  })

  const updateModelMutation = useMutation({
    mutationFn: (modelId: string) => updateProject(projectId!, { model_id: modelId }),
    onSuccess: () => {
      setStep('review')
    },
  })

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

  const handleContinue = () => {
    navigate(`/project/${projectId}`)
  }

  const handleSelectModel = (model: ModelSearchResult) => {
    setSelectedModel(model)
    setCustomModelId('')
  }

  const handleModelContinue = () => {
    const modelId = selectedModel?.model_id || customModelId
    if (modelId && projectId) {
      updateModelMutation.mutate(modelId)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Create New Project</h1>
        <p className="page-subtitle">Set up a new VLM fine-tuning project</p>
      </div>

      <div className="p-8 max-w-4xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {['Project Info', 'Upload Data', 'Select Model', 'Review'].map((label, index) => {
            const stepNames = ['info', 'upload', 'model', 'review'] as const
            const isActive = stepNames[index] === step
            const isCompleted =
              stepNames.indexOf(step) > index ||
              (step === 'review' && index === 3)

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
                  {isCompleted && index !== stepNames.indexOf(step) ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'ml-3 font-medium',
                    isActive ? 'text-bauhaus-black' : 'text-bauhaus-gray'
                  )}
                >
                  {label}
                </span>
                {index < 3 && (
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

              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => setStep('info')}>
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

        {/* Step 3: Select Model */}
        {step === 'model' && (
          <Card variant="blue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Box className="w-5 h-5" />
                Select Base Model
              </CardTitle>
              <CardDescription>
                Choose the Vision Language Model to fine-tune
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bauhaus-gray" />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-3 border-2 border-bauhaus-charcoal bg-white focus:outline-none focus:border-bauhaus-blue transition-colors"
                    placeholder="Search HuggingFace models..."
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        searchModelsRefetch()
                      }
                    }}
                  />
                </div>
                <Button
                  variant="blue"
                  onClick={() => searchModelsRefetch()}
                  loading={isSearching}
                >
                  Search
                </Button>
              </div>

              {/* Popular Models */}
              <div>
                <h4 className="font-medium text-sm text-bauhaus-gray mb-3">
                  {modelResults?.models?.length ? 'Search Results' : 'Popular VLM Models'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(modelResults?.models || [
                    { model_id: 'Qwen/Qwen2.5-VL-2B-Instruct', model_name: 'Qwen2.5-VL-2B-Instruct', author: 'Qwen', downloads: 50000, is_vlm: true, size_gb: 4.5, tags: ['vision', 'language'] },
                    { model_id: 'Qwen/Qwen2.5-VL-7B-Instruct', model_name: 'Qwen2.5-VL-7B-Instruct', author: 'Qwen', downloads: 35000, is_vlm: true, size_gb: 15, tags: ['vision', 'language'] },
                    { model_id: 'microsoft/Florence-2-base', model_name: 'Florence-2-base', author: 'microsoft', downloads: 25000, is_vlm: true, size_gb: 0.5, tags: ['vision', 'ocr'] },
                    { model_id: 'llava-hf/llava-1.5-7b-hf', model_name: 'llava-1.5-7b-hf', author: 'llava-hf', downloads: 20000, is_vlm: true, size_gb: 14, tags: ['vision', 'language'] },
                  ] as ModelSearchResult[]).slice(0, 6).map((model) => (
                    <button
                      key={model.model_id}
                      onClick={() => handleSelectModel(model)}
                      className={cn(
                        'p-4 border-2 text-left transition-all',
                        selectedModel?.model_id === model.model_id
                          ? 'border-bauhaus-blue bg-bauhaus-blue/5'
                          : 'border-bauhaus-silver hover:border-bauhaus-charcoal'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{model.model_name}</div>
                          <div className="text-sm text-bauhaus-gray">{model.author}</div>
                        </div>
                        {selectedModel?.model_id === model.model_id && (
                          <CheckCircle className="w-5 h-5 text-bauhaus-blue flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-bauhaus-gray">
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {(model.downloads / 1000).toFixed(0)}k
                        </span>
                        {model.size_gb && (
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            {model.size_gb.toFixed(1)} GB
                          </span>
                        )}
                        {model.is_vlm && (
                          <Badge variant="blue" className="text-xs py-0">VLM</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Model ID */}
              <div className="border-t-2 border-bauhaus-silver pt-6">
                <h4 className="font-medium text-sm mb-3">Or enter a custom model ID</h4>
                <Input
                  placeholder="e.g., organization/model-name"
                  value={customModelId}
                  onChange={(e) => {
                    setCustomModelId(e.target.value)
                    setSelectedModel(null)
                  }}
                />
              </div>

              {/* Selected Model Summary */}
              {(selectedModel || customModelId) && (
                <div className="bg-bauhaus-light p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-terminal-green" />
                    <span className="font-medium">Selected Model:</span>
                    <span className="font-mono">{selectedModel?.model_id || customModelId}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  Back
                </Button>
                <Button
                  variant="blue"
                  onClick={handleModelContinue}
                  disabled={(!selectedModel && !customModelId) || updateModelMutation.isPending}
                  loading={updateModelMutation.isPending}
                >
                  Continue
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review */}
        {step === 'review' && detection && (
          <div className="space-y-6">
            <Card variant="yellow">
              <CardHeader>
                <CardTitle>Auto-Detected Data</CardTitle>
                <CardDescription>
                  Review what we found in your uploaded files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Images */}
                {detection.images && (
                  <div className="border-2 border-bauhaus-charcoal p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ImageIcon className="w-5 h-5 text-bauhaus-blue" />
                      <h4 className="font-bold">Images Detected</h4>
                      <Badge variant="blue">{detection.images.count} files</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-bauhaus-gray">Formats:</span>
                        <span className="ml-2">
                          {detection.images.formats.join(', ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-bauhaus-gray">Total Size:</span>
                        <span className="ml-2">
                          {detection.images.total_size_mb.toFixed(1)} MB
                        </span>
                      </div>
                      {detection.images.sample_dimensions && (
                        <div>
                          <span className="text-bauhaus-gray">Dimensions:</span>
                          <span className="ml-2">
                            {detection.images.sample_dimensions[0]} x{' '}
                            {detection.images.sample_dimensions[1]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Data */}
                {detection.data && (
                  <div className="border-2 border-bauhaus-charcoal p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileSpreadsheet className="w-5 h-5 text-terminal-green" />
                      <h4 className="font-bold">Ground Truth Data</h4>
                      <Badge variant="green">{detection.data.row_count} rows</Badge>
                    </div>
                    <div className="mb-3 text-sm">
                      <span className="text-bauhaus-gray">File:</span>
                      <span className="ml-2 font-mono">
                        {detection.data.path.split('/').pop()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-bauhaus-gray">Columns:</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {detection.data.columns.map((col) => (
                          <Badge key={col} variant="gray">
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Schema */}
                {detection.schema && (
                  <div className="border-2 border-bauhaus-charcoal p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileJson className="w-5 h-5 text-bauhaus-yellow-dark" />
                      <h4 className="font-bold">Output Schema</h4>
                      <Badge variant="yellow">{detection.schema.source}</Badge>
                    </div>
                    <pre className="text-sm bg-bauhaus-light p-4 overflow-x-auto">
                      {detection.schema.sample_output}
                    </pre>
                  </div>
                )}

                {/* Warnings */}
                {detection.warnings.length > 0 && (
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

                {/* Suggestions */}
                {detection.suggestions.length > 0 && (
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

            {/* Selected Model Display */}
            {(selectedModel || customModelId) && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Box className="w-5 h-5 text-bauhaus-blue" />
                    <div>
                      <div className="text-sm text-bauhaus-gray">Selected Model</div>
                      <div className="font-mono font-medium">{selectedModel?.model_id || customModelId}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => setStep('model')}>
                Back
              </Button>
              <Button variant="red" onClick={handleContinue}>
                Continue to Project
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
