import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSettings } from '@/lib/api'
import { Card, CardContent } from '@/components/bauhaus'
import { Button } from '@/components/bauhaus'
import {
  Search,
  Download,
  Box,
  Settings,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  LayoutDashboard,
} from 'lucide-react'

export default function Welcome() {
  const navigate = useNavigate()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const hasApiConfigured = !!(
    settings?.openai?.base_url &&
    settings?.openai?.api_key
  )

  const handleStartProject = () => {
    if (hasApiConfigured) {
      navigate('/new')
    } else {
      navigate('/settings')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bauhaus-light">
      <div className="max-w-4xl w-full mx-auto p-8">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-bauhaus-red mb-6">
            <Box className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-bauhaus-black mb-3">
            Bauhaus Fine-Tuning Studio
          </h1>
          <p className="text-lg text-bauhaus-gray max-w-xl mx-auto">
            Autonomous VLM fine-tuning with AI-powered CLI agents.
            Get started by downloading a model or configuring your settings.
          </p>
        </div>

        {/* Main Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Download Browser */}
          <Card variant="blue" className="hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-bauhaus-blue flex items-center justify-center">
                  <Download className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-bauhaus-black">
                    Download Browser
                  </h2>
                  <p className="text-sm text-bauhaus-gray">
                    Browse and download VLM models
                  </p>
                </div>
              </div>
              <p className="text-bauhaus-charcoal mb-6">
                Search Hugging Face for vision-language models.
                Filter by size, VRAM requirements, and fine-tuning support.
              </p>
              <Link to="/models">
                <Button variant="blue" className="w-full">
                  <Search className="w-5 h-5 mr-2" />
                  Browse Models
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Select Model for Finetuning */}
          <Card variant="red" className="hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-bauhaus-red flex items-center justify-center">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-bauhaus-black">
                    Start Fine-Tuning
                  </h2>
                  <p className="text-sm text-bauhaus-gray">
                    Create a new project
                  </p>
                </div>
              </div>
              <p className="text-bauhaus-charcoal mb-6">
                Upload your images and ground truth data,
                select a CLI agent, and start autonomous fine-tuning.
              </p>
              <Button
                variant="red"
                className="w-full"
                onClick={handleStartProject}
              >
                <Box className="w-5 h-5 mr-2" />
                {hasApiConfigured ? 'New Project' : 'Configure Settings First'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Settings Status */}
        <Card className="border-2 border-bauhaus-silver">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Settings className="w-6 h-6 text-bauhaus-charcoal" />
                <div>
                  <h3 className="font-medium text-bauhaus-black">
                    API Configuration
                  </h3>
                  <p className="text-sm text-bauhaus-gray">
                    {hasApiConfigured
                      ? 'OpenAI-compatible API is configured'
                      : 'Configure your API to enable skill generation'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {hasApiConfigured ? (
                  <div className="flex items-center gap-2 text-terminal-green">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-bauhaus-yellow-dark">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Not Configured</span>
                  </div>
                )}
                <Link to="/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-1" />
                    Settings
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Projects Link */}
        <div className="text-center mt-8">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-bauhaus-charcoal hover:text-bauhaus-black transition">
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">View Existing Projects</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-bauhaus-gray">
          <p>
            Powered by Claude Code, Gemini CLI, and Aider
          </p>
        </div>
      </div>
    </div>
  )
}
