import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listProjects, getStatus } from '@/lib/api'
import { Card, CardContent } from '@/components/bauhaus'
import { Button, Badge } from '@/components/bauhaus'
import { formatTimeAgo } from '@/lib/utils'
import {
  FolderOpen,
  Plus,
  Box,
  Activity,
  ArrowRight,
  Home,
} from 'lucide-react'

export default function Dashboard() {
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  })

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
  })

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link to="/" className="text-bauhaus-gray hover:text-bauhaus-charcoal transition">
                <Home className="w-5 h-5" />
              </Link>
              <h1 className="page-title">Dashboard</h1>
            </div>
            <p className="page-subtitle">Manage your VLM fine-tuning projects</p>
          </div>
          <Link to="/new">
            <Button variant="red">
              <Plus className="w-5 h-5 mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card variant="red">
            <CardContent className="flex items-center gap-4">
              <div className="w-12 h-12 bg-bauhaus-red/10 flex items-center justify-center">
                <FolderOpen className="w-6 h-6 text-bauhaus-red" />
              </div>
              <div>
                <p className="text-2xl font-bold">{status?.projects_count || 0}</p>
                <p className="text-sm text-bauhaus-gray">Projects</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="blue">
            <CardContent className="flex items-center gap-4">
              <div className="w-12 h-12 bg-bauhaus-blue/10 flex items-center justify-center">
                <Box className="w-6 h-6 text-bauhaus-blue" />
              </div>
              <div>
                <p className="text-2xl font-bold">{status?.models_cached || 0}</p>
                <p className="text-sm text-bauhaus-gray">Cached Models</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="yellow">
            <CardContent className="flex items-center gap-4">
              <div className="w-12 h-12 bg-bauhaus-yellow/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-bauhaus-yellow-dark" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {status?.services?.skill_generator === 'configured' ? 'Ready' : 'Setup'}
                </p>
                <p className="text-sm text-bauhaus-gray">Skill Generator</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects List */}
        <div className="section-bauhaus">
          <h2 className="text-xl font-bold mb-6">Recent Projects</h2>

          {projectsLoading ? (
            <div className="text-center py-12 text-bauhaus-gray">Loading projects...</div>
          ) : projects && projects.length > 0 ? (
            <div className="grid gap-4">
              {projects.map((project) => (
                <Link key={project.id} to={`/project/${project.id}`}>
                  <Card className="hover:shadow-xl transition-shadow cursor-pointer">
                    <CardContent className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-bauhaus-light flex items-center justify-center">
                          <FolderOpen className="w-6 h-6 text-bauhaus-charcoal" />
                        </div>
                        <div>
                          <h3 className="font-bold text-bauhaus-black">{project.name}</h3>
                          <p className="text-sm text-bauhaus-gray">
                            {project.description || 'No description'}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <Badge variant="gray">{project.status}</Badge>
                            {project.model_id && (
                              <Badge variant="blue">{project.model_id.split('/').pop()}</Badge>
                            )}
                            <span className="text-xs text-bauhaus-gray">
                              {formatTimeAgo(project.created)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-bauhaus-gray" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <FolderOpen className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                <h3 className="text-lg font-medium text-bauhaus-charcoal mb-2">
                  No projects yet
                </h3>
                <p className="text-bauhaus-gray mb-6">
                  Create your first VLM fine-tuning project to get started.
                </p>
                <Link to="/new">
                  <Button variant="red">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Project
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
