import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSettings, getCachedModels } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Badge } from '@/components/bauhaus'
import {
  Search,
  Box,
  CheckCircle,
  ArrowRight,
  Settings,
  Download,
} from 'lucide-react'

export default function Welcome() {
  const navigate = useNavigate()

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
  const hasCachedModels = cachedModels && cachedModels.length > 0

  const handleModelBrowser = () => {
    navigate('/models')
  }

  const handleSelectModel = () => {
    if (!hasApiConfigured) {
      // Guide user to settings first
      navigate('/settings', { state: { returnTo: '/new' } })
    } else {
      navigate('/new')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bauhaus-light">
      <div className="max-w-4xl w-full px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-bauhaus-red flex items-center justify-center mx-auto mb-6">
            <Box className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-bauhaus-black mb-3">
            Bauhaus Fine-Tuning Studio
          </h1>
          <p className="text-lg text-bauhaus-gray">
            Autonomous VLM Fine-Tuning with CLI Agents
          </p>
        </div>

        {/* Main Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Option 1: Model Browser */}
          <Card variant="blue" className="cursor-pointer hover:shadow-xl transition-shadow" onClick={handleModelBrowser}>
            <CardHeader>
              <div className="w-16 h-16 bg-bauhaus-blue/10 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-bauhaus-blue" />
              </div>
              <CardTitle className="text-xl">Browse & Download Models</CardTitle>
              <CardDescription>
                Search HuggingFace for Vision-Language Models, preview specs, and download to your local cache
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasCachedModels && (
                    <Badge variant="blue">
                      <Download className="w-3 h-3 mr-1" />
                      {cachedModels.length} cached
                    </Badge>
                  )}
                </div>
                <Button variant="blue">
                  Open Browser
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Select Model for Finetuning */}
          <Card
            variant="red"
            className="cursor-pointer hover:shadow-xl transition-shadow"
            onClick={handleSelectModel}
          >
            <CardHeader>
              <div className="w-16 h-16 bg-bauhaus-red/10 flex items-center justify-center mb-4">
                <Box className="w-8 h-8 text-bauhaus-red" />
              </div>
              <CardTitle className="text-xl">Start Fine-Tuning Project</CardTitle>
              <CardDescription>
                Select a model, upload your data, and configure CLI agents for autonomous fine-tuning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasApiConfigured ? (
                    <Badge variant="green">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      API Configured
                    </Badge>
                  ) : (
                    <Badge variant="yellow">
                      Setup Required
                    </Badge>
                  )}
                </div>
                <Button variant="red">
                  {hasApiConfigured ? 'New Project' : 'Configure & Start'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings Link */}
        <div className="text-center">
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 text-bauhaus-gray hover:text-bauhaus-charcoal transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Configure API Keys & Settings</span>
          </button>
        </div>

        {/* Status Info */}
        {!hasApiConfigured && (
          <div className="mt-8 p-4 bg-bauhaus-yellow/10 border-l-4 border-bauhaus-yellow">
            <p className="text-sm text-bauhaus-charcoal">
              <strong>First time?</strong> You'll need to configure an OpenAI-compatible API
              in Settings before creating fine-tuning projects. The API is used for generating
              agent skill files.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
