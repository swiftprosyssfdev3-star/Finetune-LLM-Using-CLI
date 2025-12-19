import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getProject } from '@/lib/api'
import { BauhausTerminal } from '@/components/terminal'
import { Button, Badge, ProgressBar } from '@/components/bauhaus'
import { getAgentColor } from '@/lib/utils'
import {
  Play,
  Terminal,
  Cpu,
  Activity,
  ChevronLeft,
  FileCode,
} from 'lucide-react'

const AGENTS = [
  { id: 'claude', name: 'Claude Code', description: 'Anthropic\'s AI coding assistant' },
  { id: 'gemini', name: 'Gemini CLI', description: 'Google\'s AI with 1M context' },
  { id: 'codex', name: 'OpenAI Codex', description: 'OpenAI\'s code-focused model' },
  { id: 'qwen', name: 'Qwen Code', description: 'Alibaba\'s coding assistant' },
  { id: 'aider', name: 'Aider', description: 'Open source pair programmer' },
  { id: 'bash', name: 'Bash Shell', description: 'Direct shell access' },
] as const

type AgentId = typeof AGENTS[number]['id']

export default function Training() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const agentFromUrl = searchParams.get('agent') as AgentId | null

  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const [isTraining, setIsTraining] = useState(false)

  // Set agent from URL on mount
  useEffect(() => {
    if (agentFromUrl && AGENTS.some(a => a.id === agentFromUrl)) {
      setSelectedAgent(agentFromUrl)
    }
  }, [agentFromUrl])

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  if (!projectId) {
    return <div>Project not found</div>
  }

  return (
    <div className="min-h-screen bg-terminal-bg">
      {/* Header */}
      <div className="bg-terminal-surface border-b border-terminal-border px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/project/${projectId}`}>
              <Button variant="ghost" size="sm" className="text-terminal-text">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-terminal-text">
                Training: {project?.name || projectId}
              </h1>
              <p className="text-sm text-terminal-text/60">
                Select an agent and start training
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isTraining && (
              <Badge variant="green" className="animate-pulse">
                <Activity className="w-3 h-3 mr-1" />
                Running
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Agent Selection Sidebar */}
        <div className="w-72 bg-terminal-surface border-r border-terminal-border p-4 space-y-4 overflow-y-auto">
          <div>
            <h2 className="text-sm font-medium text-terminal-text mb-3">
              Select Agent
            </h2>
            <div className="space-y-2">
              {AGENTS.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`w-full p-3 text-left rounded transition-all ${
                    selectedAgent === agent.id
                      ? 'bg-terminal-border'
                      : 'hover:bg-terminal-border/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getAgentColor(agent.id) }}
                    />
                    <div>
                      <p className="font-medium text-terminal-text text-sm">
                        {agent.name}
                      </p>
                      <p className="text-xs text-terminal-text/60">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Project Info */}
          {project && (
            <div className="pt-4 border-t border-terminal-border">
              <h2 className="text-sm font-medium text-terminal-text mb-3">
                Project Info
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Model</span>
                  <span className="text-terminal-cyan text-xs font-mono">
                    {project.model_id?.split('/').pop() || 'Not set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Method</span>
                  <span className="text-terminal-text">
                    {project.method || 'LoRA'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Images</span>
                  <span className="text-terminal-text">
                    {project.stats?.images || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Status</span>
                  <Badge
                    variant={project.status === 'ready' ? 'green' : 'gray'}
                    size="sm"
                  >
                    {project.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Quick Commands */}
          {selectedAgent && (
            <div className="pt-4 border-t border-terminal-border">
              <h2 className="text-sm font-medium text-terminal-text mb-3">
                Quick Commands
              </h2>
              <div className="space-y-2">
                <button className="w-full px-3 py-2 text-left text-sm bg-terminal-border/50 hover:bg-terminal-border rounded text-terminal-text">
                  <FileCode className="w-4 h-4 inline-block mr-2 text-terminal-cyan" />
                  Generate training code
                </button>
                <button className="w-full px-3 py-2 text-left text-sm bg-terminal-border/50 hover:bg-terminal-border rounded text-terminal-text">
                  <Play className="w-4 h-4 inline-block mr-2 text-terminal-green" />
                  Start training
                </button>
                <button className="w-full px-3 py-2 text-left text-sm bg-terminal-border/50 hover:bg-terminal-border rounded text-terminal-text">
                  <Cpu className="w-4 h-4 inline-block mr-2 text-terminal-orange" />
                  Check GPU status
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Terminal Area */}
        <div className="flex-1 flex flex-col">
          {selectedAgent ? (
            <BauhausTerminal
              projectId={projectId}
              agent={selectedAgent}
              className="flex-1"
              onStatusChange={setIsTraining}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Terminal className="w-16 h-16 mx-auto text-terminal-border mb-4" />
                <h2 className="text-xl font-medium text-terminal-text mb-2">
                  Select an Agent
                </h2>
                <p className="text-terminal-text/60 max-w-md">
                  Choose a CLI agent from the sidebar to start an interactive
                  training session. The agent will help you prepare data,
                  generate code, and run training.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        {selectedAgent && (
          <div className="w-72 bg-terminal-surface border-l border-terminal-border p-4 space-y-4">
            <div>
              <h2 className="text-sm font-medium text-terminal-text mb-3">
                Training Progress
              </h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-terminal-text/60">Epoch</span>
                    <span className="text-terminal-text">0 / 15</span>
                  </div>
                  <ProgressBar value={0} variant="blue" showLabel={false} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-terminal-text/60">Step</span>
                    <span className="text-terminal-text">0 / 0</span>
                  </div>
                  <ProgressBar value={0} variant="green" showLabel={false} />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-terminal-border">
              <h2 className="text-sm font-medium text-terminal-text mb-3">
                Metrics
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Loss</span>
                  <span className="text-terminal-cyan font-mono">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">Learning Rate</span>
                  <span className="text-terminal-cyan font-mono">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-text/60">ETA</span>
                  <span className="text-terminal-text">--</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-terminal-border">
              <h2 className="text-sm font-medium text-terminal-text mb-3">
                System
              </h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-terminal-text/60">GPU</span>
                    <span className="text-terminal-text">--</span>
                  </div>
                  <ProgressBar value={0} variant="yellow" showLabel={false} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-terminal-text/60">VRAM</span>
                    <span className="text-terminal-text">-- / --</span>
                  </div>
                  <ProgressBar value={0} variant="red" showLabel={false} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
