import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createProject, uploadFiles, type DetectionResult } from '@/lib/api'
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
  FileText,
  FolderOpen,
  Cog,
  Terminal,
} from 'lucide-react'

export default function NewProject() {
  const navigate = useNavigate()

  const [step, setStep] = useState<'info' | 'upload' | 'review'>('info')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [uploadMode, setUploadMode] = useState<'files' | 'folder'>('files')

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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const items = e.dataTransfer.items
    const files: File[] = []

    // Handle directory drops using webkitGetAsEntry
    const processEntry = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        return new Promise((resolve) => {
          fileEntry.file((file) => {
            // Preserve the relative path in the file object
            Object.defineProperty(file, 'webkitRelativePath', {
              value: entry.fullPath.slice(1), // Remove leading slash
              writable: false
            })
            files.push(file)
            resolve()
          })
        })
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry
        const reader = dirEntry.createReader()
        return new Promise((resolve) => {
          const readEntries = () => {
            reader.readEntries(async (entries) => {
              if (entries.length === 0) {
                resolve()
              } else {
                await Promise.all(entries.map(processEntry))
                readEntries() // Continue reading (directories may have batched results)
              }
            })
          }
          readEntries()
        })
      }
    }

    if (items) {
      const entries: FileSystemEntry[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry()
        if (entry) entries.push(entry)
      }
      await Promise.all(entries.map(processEntry))
      if (files.length > 0) {
        setUploadMode('folder')
        setUploadedFiles((prev) => [...prev, ...files])
      }
    } else {
      // Fallback for browsers that don't support webkitGetAsEntry
      const droppedFiles = Array.from(e.dataTransfer.files)
      setUploadedFiles((prev) => [...prev, ...droppedFiles])
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    // Check if files have webkitRelativePath (folder upload)
    if (files.length > 0 && files[0].webkitRelativePath) {
      setUploadMode('folder')
    }
    setUploadedFiles((prev) => [...prev, ...files])
  }, [])

  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadMode('folder')
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
          {['Project Info', 'Upload Data', 'Review'].map((label, index) => {
            const stepNames = ['info', 'upload', 'review'] as const
            const isActive = stepNames[index] === step
            const isCompleted =
              stepNames.indexOf(step) > index ||
              (step === 'review' && index === 2)

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
                {index < 2 && (
                  <div
                    className={cn(
                      'w-16 h-0.5 mx-4',
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
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <input
                  id="folder-input"
                  type="file"
                  // @ts-expect-error - webkitdirectory is not in standard types
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={handleFolderSelect}
                />
                <Upload className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                <p className="text-lg font-medium text-bauhaus-charcoal mb-2">
                  Drop files or folders here
                </p>
                <p className="text-bauhaus-gray mb-4">or choose an option below</p>
                <div className="flex gap-4 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      document.getElementById('file-input')?.click()
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Select Files
                  </Button>
                  <Button
                    variant="blue"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      document.getElementById('folder-input')?.click()
                    }}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Select Folder
                  </Button>
                </div>
              </div>

              {/* Supported formats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
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
                  <FileText className="w-4 h-4" />
                  <span>.docx .md .txt .rtf</span>
                </div>
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <FolderPlus className="w-4 h-4" />
                  <span>.zip .tar.gz</span>
                </div>
                <div className="flex items-center gap-2 text-bauhaus-gray">
                  <FolderOpen className="w-4 h-4" />
                  <span>Entire folders</span>
                </div>
              </div>

              {/* Uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="border-2 border-bauhaus-charcoal p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">
                      {uploadMode === 'folder' ? (
                        <span className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-bauhaus-blue" />
                          Folder Upload ({uploadedFiles.length} files)
                        </span>
                      ) : (
                        `Selected Files (${uploadedFiles.length})`
                      )}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUploadedFiles([])
                        setUploadMode('files')
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {uploadedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate font-mono text-xs">
                          {file.webkitRelativePath || file.name}
                        </span>
                        <span className="text-bauhaus-gray ml-2 flex-shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {uploadMode === 'folder' && (
                    <div className="mt-3 pt-3 border-t border-bauhaus-silver text-sm text-bauhaus-gray">
                      Total size: {formatBytes(uploadedFiles.reduce((sum, f) => sum + f.size, 0))}
                    </div>
                  )}
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

        {/* Step 3: Review */}
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

                {/* Processing Instructions */}
                {detection.processing && (
                  <div className="border-2 border-bauhaus-charcoal p-4 bg-bauhaus-light">
                    <div className="flex items-center gap-2 mb-3">
                      <Cog className="w-5 h-5 text-bauhaus-charcoal" />
                      <h4 className="font-bold">Auto-Detected Processing</h4>
                      <Badge variant="gray">{detection.processing.task_type}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-bauhaus-gray">Input Format:</span>
                        <span className="ml-2 font-medium">{detection.processing.input_format}</span>
                      </div>
                      <div>
                        <span className="text-bauhaus-gray">Output Format:</span>
                        <span className="ml-2 font-medium">{detection.processing.output_format}</span>
                      </div>
                      <div>
                        <span className="text-bauhaus-gray">Matching Strategy:</span>
                        <span className="ml-2 font-medium">{detection.processing.matching_strategy}</span>
                      </div>
                    </div>
                    {detection.processing.special_instructions.length > 0 && (
                      <div className="text-sm border-t border-bauhaus-silver pt-3 mt-3">
                        <span className="text-bauhaus-gray block mb-2">Special Instructions:</span>
                        <ul className="list-disc list-inside space-y-1">
                          {detection.processing.special_instructions.map((instr, i) => (
                            <li key={i}>{instr}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Agent Prompt Preview */}
                {detection.agent_prompt && (
                  <div className="border-2 border-bauhaus-blue p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal className="w-5 h-5 text-bauhaus-blue" />
                      <h4 className="font-bold">CLI Agent Prompt</h4>
                      <Badge variant="blue">Auto-generated</Badge>
                    </div>
                    <p className="text-sm text-bauhaus-gray mb-3">
                      This prompt will be automatically sent to the CLI agent for processing your data.
                    </p>
                    <details className="text-sm">
                      <summary className="cursor-pointer text-bauhaus-blue hover:underline">
                        View full prompt
                      </summary>
                      <pre className="mt-3 bg-bauhaus-black text-terminal-green p-4 overflow-x-auto text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {detection.agent_prompt}
                      </pre>
                    </details>
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

            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => setStep('upload')}>
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
