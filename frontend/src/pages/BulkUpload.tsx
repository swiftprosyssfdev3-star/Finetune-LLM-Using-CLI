import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  bulkUploadFiles,
  getBulkUploadResult,
  generateAgentReview,
  getProject,
  type BulkUploadResult,
  type BulkProcessingResult,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Input, Badge, ProgressBar } from '@/components/bauhaus'
import { cn, formatBytes } from '@/lib/utils'
import {
  Upload,
  FolderOpen,
  Image as ImageIcon,
  FileSpreadsheet,
  FileText,
  FileJson,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  Bot,
  RefreshCw,
  Download,
  Eye,
} from 'lucide-react'

type UploadStep = 'select' | 'uploading' | 'review' | 'agent'

export default function BulkUpload() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState<UploadStep>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadResult, setUploadResult] = useState<BulkUploadResult | null>(null)
  const [agentInstructions, setAgentInstructions] = useState<string>('')
  const [selectedAgent, setSelectedAgent] = useState<string>('claude')

  // Fetch project details
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  // Check for existing bulk upload result
  const { data: existingResult, refetch: refetchResult } = useQuery({
    queryKey: ['bulk-upload-result', projectId],
    queryFn: () => getBulkUploadResult(projectId!),
    enabled: !!projectId,
    retry: false,
  })

  useEffect(() => {
    if (existingResult) {
      setStep('review')
    }
  }, [existingResult])

  // Bulk upload mutation
  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => bulkUploadFiles(projectId!, files),
    onSuccess: (data) => {
      setUploadResult(data)
      setStep('review')
      refetchResult()
    },
  })

  // Agent review mutation
  const agentReviewMutation = useMutation({
    mutationFn: (agentType: string) => generateAgentReview(projectId!, agentType),
    onSuccess: (data) => {
      setAgentInstructions(data.instructions)
      setStep('agent')
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

    const items = e.dataTransfer.items
    const files: File[] = []

    // Handle both files and folders
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    setSelectedFiles((prev) => [...prev, ...files])
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedFiles((prev) => [...prev, ...files])
  }, [])

  const handleUpload = () => {
    if (selectedFiles.length > 0 && projectId) {
      setStep('uploading')
      uploadMutation.mutate(selectedFiles)
    }
  }

  const handleAgentReview = () => {
    if (projectId) {
      agentReviewMutation.mutate(selectedAgent)
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearFiles = () => {
    setSelectedFiles([])
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'tiff', 'webp', 'bmp', 'pdf'].includes(ext || '')) {
      return <ImageIcon className="w-4 h-4 text-bauhaus-blue" />
    }
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-4 h-4 text-terminal-green" />
    }
    if (['json', 'jsonl'].includes(ext || '')) {
      return <FileJson className="w-4 h-4 text-bauhaus-yellow-dark" />
    }
    if (['docx', 'doc', 'md', 'txt'].includes(ext || '')) {
      return <FileText className="w-4 h-4 text-bauhaus-red" />
    }
    return <FileText className="w-4 h-4 text-bauhaus-gray" />
  }

  const result = uploadResult || (existingResult ? {
    images: existingResult.images_count ? { count: existingResult.images_count } : null,
    truth_data: existingResult.truth_data_rows ? { row_count: existingResult.truth_data_rows } : null,
    matched_pairs: existingResult.matched_pairs_count,
    unmatched_images: existingResult.unmatched_images_count,
    suggestions: existingResult.suggestions,
    warnings: existingResult.warnings,
    processing_time: existingResult.processing_time_seconds,
  } as any : null)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/project/${projectId}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="page-title">Bulk Upload</h1>
            <p className="page-subtitle">
              Upload a folder of images with truth data for {project?.name || 'project'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {[
            { key: 'select', label: 'Select Files' },
            { key: 'uploading', label: 'Processing' },
            { key: 'review', label: 'Review Results' },
            { key: 'agent', label: 'Agent Review' },
          ].map(({ key, label }, index) => {
            const steps: UploadStep[] = ['select', 'uploading', 'review', 'agent']
            const currentIndex = steps.indexOf(step)
            const isActive = key === step
            const isCompleted = currentIndex > index

            return (
              <div key={key} className="flex items-center">
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
                      'w-12 h-0.5 mx-4',
                      isCompleted ? 'bg-bauhaus-black' : 'bg-bauhaus-silver'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step 1: Select Files */}
        {step === 'select' && (
          <Card variant="blue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="w-6 h-6" />
                Select Files or Folder
              </CardTitle>
              <CardDescription>
                Upload images and truth data (XLSX, JSON, DOCX, Markdown)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dropzone */}
              <div
                className={cn(
                  'dropzone min-h-[200px]',
                  isDragging && 'dropzone-active'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('bulk-file-input')?.click()}
              >
                <input
                  id="bulk-file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  // @ts-ignore - webkitdirectory is valid
                  webkitdirectory=""
                  directory=""
                />
                <Upload className="w-16 h-16 mx-auto text-bauhaus-gray mb-4" />
                <p className="text-xl font-medium text-bauhaus-charcoal mb-2">
                  Drop files or folders here
                </p>
                <p className="text-bauhaus-gray">or click to browse</p>
              </div>

              {/* Supported formats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border-2 border-bauhaus-charcoal p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="w-5 h-5 text-bauhaus-blue" />
                    <span className="font-medium">Images</span>
                  </div>
                  <p className="text-sm text-bauhaus-gray">
                    .jpg .png .tiff .pdf .webp .bmp
                  </p>
                </div>
                <div className="border-2 border-bauhaus-charcoal p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="w-5 h-5 text-terminal-green" />
                    <span className="font-medium">Spreadsheets</span>
                  </div>
                  <p className="text-sm text-bauhaus-gray">
                    .xlsx .xls .csv .tsv
                  </p>
                </div>
                <div className="border-2 border-bauhaus-charcoal p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-bauhaus-red" />
                    <span className="font-medium">Documents</span>
                  </div>
                  <p className="text-sm text-bauhaus-gray">
                    .docx .md .markdown .txt
                  </p>
                </div>
                <div className="border-2 border-bauhaus-charcoal p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileJson className="w-5 h-5 text-bauhaus-yellow-dark" />
                    <span className="font-medium">Data Files</span>
                  </div>
                  <p className="text-sm text-bauhaus-gray">
                    .json .jsonl .zip .tar.gz
                  </p>
                </div>
              </div>

              {/* Selected files */}
              {selectedFiles.length > 0 && (
                <div className="border-2 border-bauhaus-charcoal p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">
                      Selected Files ({selectedFiles.length})
                    </h4>
                    <Button variant="outline" size="sm" onClick={clearFiles}>
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm bg-bauhaus-light p-2"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getFileIcon(file.name)}
                          <span className="truncate">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-bauhaus-gray">
                            {formatBytes(file.size)}
                          </span>
                          <button
                            onClick={() => removeFile(i)}
                            className="text-bauhaus-red hover:text-bauhaus-red/80"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="blue"
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0}
                  loading={uploadMutation.isPending}
                >
                  Process Files
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Processing */}
        {step === 'uploading' && (
          <Card variant="yellow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin" />
                Processing Files
              </CardTitle>
              <CardDescription>
                Analyzing images and truth data...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center py-8">
                <ProgressBar
                  value={uploadMutation.isPending ? 50 : 100}
                  variant="blue"
                  className="mb-4"
                />
                <p className="text-bauhaus-gray">
                  {uploadMutation.isPending
                    ? 'Processing your files. This may take a moment for large datasets...'
                    : 'Processing complete!'}
                </p>
              </div>

              {uploadMutation.isError && (
                <div className="bg-bauhaus-red/10 border-2 border-bauhaus-red p-4">
                  <div className="flex items-center gap-2 text-bauhaus-red">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">Processing Error</span>
                  </div>
                  <p className="mt-2 text-sm">
                    {(uploadMutation.error as Error)?.message || 'An error occurred'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review Results */}
        {step === 'review' && result && (
          <div className="space-y-6">
            <Card variant="yellow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-6 h-6" />
                  Processing Results
                </CardTitle>
                <CardDescription>
                  Review the analysis of your bulk upload
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border-2 border-bauhaus-charcoal p-4 text-center">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-bauhaus-blue" />
                    <div className="text-2xl font-bold">
                      {result.images?.count || 0}
                    </div>
                    <div className="text-sm text-bauhaus-gray">Images Found</div>
                  </div>
                  <div className="border-2 border-bauhaus-charcoal p-4 text-center">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-terminal-green" />
                    <div className="text-2xl font-bold">
                      {result.truth_data?.row_count || 0}
                    </div>
                    <div className="text-sm text-bauhaus-gray">Truth Data Rows</div>
                  </div>
                  <div className="border-2 border-bauhaus-charcoal p-4 text-center">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-bauhaus-blue" />
                    <div className="text-2xl font-bold">{result.matched_pairs}</div>
                    <div className="text-sm text-bauhaus-gray">Matched Pairs</div>
                  </div>
                  <div className="border-2 border-bauhaus-charcoal p-4 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-bauhaus-red" />
                    <div className="text-2xl font-bold">{result.unmatched_images}</div>
                    <div className="text-sm text-bauhaus-gray">Unmatched</div>
                  </div>
                </div>

                {/* Processing Time */}
                {result.processing_time && (
                  <div className="text-sm text-bauhaus-gray text-center">
                    Processed in {result.processing_time.toFixed(1)} seconds
                  </div>
                )}

                {/* Warnings */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="border-2 border-bauhaus-red p-4">
                    <div className="flex items-center gap-2 mb-3 text-bauhaus-red">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">Warnings</span>
                    </div>
                    <ul className="space-y-2">
                      {result.warnings.map((warning, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-bauhaus-red">•</span>
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggestions */}
                {result.suggestions && result.suggestions.length > 0 && (
                  <div className="border-2 border-bauhaus-blue p-4">
                    <div className="flex items-center gap-2 mb-3 text-bauhaus-blue">
                      <Lightbulb className="w-5 h-5" />
                      <span className="font-medium">Suggestions</span>
                    </div>
                    <ul className="space-y-2">
                      {result.suggestions.map((suggestion, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-bauhaus-blue">•</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Selection */}
            <Card variant="red">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-6 h-6" />
                  CLI Agent Review
                </CardTitle>
                <CardDescription>
                  Select an agent to review and process your data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                  {['claude', 'gemini', 'codex', 'qwen', 'aider', 'bash'].map((agent) => (
                    <button
                      key={agent}
                      onClick={() => setSelectedAgent(agent)}
                      className={cn(
                        'p-4 border-2 transition-colors text-center',
                        selectedAgent === agent
                          ? 'border-bauhaus-red bg-bauhaus-red/10'
                          : 'border-bauhaus-charcoal hover:border-bauhaus-blue'
                      )}
                    >
                      <span className="font-medium capitalize">{agent}</span>
                    </button>
                  ))}
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep('select')}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Upload More
                  </Button>
                  <Button
                    variant="red"
                    onClick={handleAgentReview}
                    loading={agentReviewMutation.isPending}
                  >
                    Generate Agent Instructions
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Agent Instructions */}
        {step === 'agent' && agentInstructions && (
          <Card variant="red">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-6 h-6" />
                Agent Instructions Generated
              </CardTitle>
              <CardDescription>
                Copy these instructions to the {selectedAgent} CLI agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-bauhaus-black text-white p-6 font-mono text-sm overflow-x-auto max-h-[500px] overflow-y-auto">
                <pre className="whitespace-pre-wrap">{agentInstructions}</pre>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('review')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Review
                </Button>
                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(agentInstructions)
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </Button>
                  <Button
                    variant="red"
                    onClick={() => navigate(`/training?project=${projectId}&agent=${selectedAgent}`)}
                  >
                    Start Agent
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
