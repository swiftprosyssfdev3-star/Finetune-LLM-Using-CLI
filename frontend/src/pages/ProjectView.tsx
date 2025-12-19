import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject,
  detectProjectInputs,
  updateProject,
  generateProjectSkills,
  getGeneratedFiles,
} from '@/lib/api'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/bauhaus'
import { Button, Badge, Input, ProgressBar } from '@/components/bauhaus'
import { formatDate } from '@/lib/utils'
import {
  FolderOpen,
  Image as ImageIcon,
  FileSpreadsheet,
  Box,
  Settings,
  Play,
  FileCode,
  RefreshCw,
  CheckCircle,
  Sparkles,
  Upload,
} from 'lucide-react'

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [modelId, setModelId] = useState('')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  const { data: generatedFiles } = useQuery({
    queryKey: ['generated-files', projectId],
    queryFn: () => getGeneratedFiles(projectId!),
    enabled: !!projectId,
  })

  const detectMutation = useMutation({
    mutationFn: () => detectProjectInputs(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  const updateModelMutation = useMutation({
    mutationFn: (model_id: string) => updateProject(projectId!, { model_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  const generateSkillsMutation = useMutation({
    mutationFn: () => generateProjectSkills(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-files', projectId] })
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-bauhaus-gray">Loading project...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-bauhaus-gray">Project not found</div>
      </div>
    )
  }

  const stats = project.stats || { images: 0, uploads: 0, generated_files: 0 }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FolderOpen className="w-8 h-8 text-bauhaus-red" />
              <h1 className="page-title">{project.name}</h1>
              <Badge
                variant={project.status === 'ready' ? 'green' : 'gray'}
              >
                {project.status}
              </Badge>
            </div>
            <p className="page-subtitle">
              {project.description || 'No description'}
            </p>
            <p className="text-xs text-bauhaus-gray mt-1">
              Created {formatDate(project.created)}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => detectMutation.mutate()}
              loading={detectMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-detect Files
            </Button>
            <Link to={`/project/${projectId}/train`}>
              <Button variant="red">
                <Play className="w-4 h-4 mr-2" />
                Start Training
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <ImageIcon className="w-8 h-8 text-bauhaus-blue" />
                  <div>
                    <p className="text-2xl font-bold">{stats.images}</p>
                    <p className="text-sm text-bauhaus-gray">Images</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <FileSpreadsheet className="w-8 h-8 text-terminal-green" />
                  <div>
                    <p className="text-2xl font-bold">{stats.uploads}</p>
                    <p className="text-sm text-bauhaus-gray">Uploads</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <FileCode className="w-8 h-8 text-bauhaus-yellow-dark" />
                  <div>
                    <p className="text-2xl font-bold">{stats.generated_files}</p>
                    <p className="text-sm text-bauhaus-gray">Generated</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Model Selection */}
            <Card variant="blue">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Box className="w-5 h-5" />
                  Base Model
                </CardTitle>
                <CardDescription>
                  Select the VLM to fine-tune
                </CardDescription>
              </CardHeader>
              <CardContent>
                {project.model_id ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-terminal-green" />
                      <span className="font-mono">{project.model_id}</span>
                    </div>
                    <Link to="/models">
                      <Button variant="outline" size="sm">
                        Change Model
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Input
                        placeholder="Enter model ID (e.g., Qwen/Qwen2.5-VL-2B-Instruct)"
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="blue"
                        onClick={() => updateModelMutation.mutate(modelId)}
                        disabled={!modelId || updateModelMutation.isPending}
                      >
                        Set Model
                      </Button>
                    </div>
                    <p className="text-sm text-bauhaus-gray">
                      Or{' '}
                      <Link to="/models" className="text-bauhaus-blue underline">
                        browse HuggingFace models
                      </Link>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generated Files */}
            <Card variant="yellow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Agent Skill Files
                    </CardTitle>
                    <CardDescription>
                      Configuration files for CLI agents
                    </CardDescription>
                  </div>
                  <Button
                    variant="yellow"
                    size="sm"
                    onClick={() => generateSkillsMutation.mutate()}
                    loading={generateSkillsMutation.isPending}
                  >
                    Generate Skills
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {generatedFiles && generatedFiles.length > 0 ? (
                  <div className="space-y-3">
                    {generatedFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-3 bg-bauhaus-light"
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-bauhaus-charcoal" />
                          <span className="font-mono text-sm">{file.name}</span>
                        </div>
                        <span className="text-xs text-bauhaus-gray">
                          {file.size} bytes
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-bauhaus-gray text-sm">
                    No skill files generated yet. Configure the skill generator
                    and click "Generate Skills" to create agent configuration files.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link to={`/project/${projectId}/bulk-upload`} className="block">
                  <Button variant="blue" className="w-full justify-start">
                    <Upload className="w-4 h-4 mr-2" />
                    Bulk Upload
                  </Button>
                </Link>
                <Link to={`/project/${projectId}/train`} className="block">
                  <Button variant="red" className="w-full justify-start">
                    <Play className="w-4 h-4 mr-2" />
                    Start Training
                  </Button>
                </Link>
                <Link to="/models" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Box className="w-4 h-4 mr-2" />
                    Browse Models
                  </Button>
                </Link>
                <Link to="/skills" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="w-4 h-4 mr-2" />
                    Skill Generator
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <span className="text-bauhaus-gray">ID:</span>
                  <p className="font-mono">{project.id}</p>
                </div>
                <div>
                  <span className="text-bauhaus-gray">Method:</span>
                  <p className="font-medium">{project.method || 'LoRA'}</p>
                </div>
                <div>
                  <span className="text-bauhaus-gray">Created:</span>
                  <p>{formatDate(project.created)}</p>
                </div>
                {project.updated && (
                  <div>
                    <span className="text-bauhaus-gray">Updated:</span>
                    <p>{formatDate(project.updated)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
