import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { searchModels, getModelDetails, downloadModel, getCachedModels, type ModelSearchResult } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Input, Badge, ProgressBar } from '@/components/bauhaus'
import { formatNumber } from '@/lib/utils'
import {
  Search,
  Download,
  Star,
  ArrowDown,
  Box,
  Cpu,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  ExternalLink,
} from 'lucide-react'

export default function HuggingFaceBrowser() {
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [vlmOnly, setVlmOnly] = useState(true)
  const [maxSize, setMaxSize] = useState<number | null>(null)

  const limit = 10

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['models', searchQuery, page, vlmOnly, maxSize],
    queryFn: () =>
      searchModels({
        query: searchQuery,
        vlm_only: vlmOnly,
        max_size_gb: maxSize || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
    enabled: searchQuery.length > 0,
  })

  const { data: modelDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['model-details', selectedModel],
    queryFn: () => getModelDetails(selectedModel!),
    enabled: !!selectedModel,
  })

  const { data: cachedModels } = useQuery({
    queryKey: ['cached-models'],
    queryFn: getCachedModels,
  })

  const downloadMutation = useMutation({
    mutationFn: (modelId: string) => downloadModel(modelId),
    onSuccess: () => {
      // Could show notification or refresh cached models
    },
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(query)
    setPage(1)
    setSelectedModel(null)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">HuggingFace Model Browser</h1>
        <p className="page-subtitle">Search, preview, and download Vision-Language Models</p>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Search Form */}
            <Card variant="blue">
              <CardContent>
                <form onSubmit={handleSearch} className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-bauhaus-gray" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search models (e.g., qwen vision ocr)"
                        className="w-full pl-12 pr-4 py-3 border-2 border-bauhaus-charcoal bg-white focus:outline-none focus:border-bauhaus-blue transition-colors"
                      />
                    </div>
                    <Button type="submit" variant="blue" disabled={searching}>
                      Search
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vlmOnly}
                        onChange={(e) => setVlmOnly(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">VLM Only</span>
                    </label>
                    <select
                      value={maxSize || ''}
                      onChange={(e) => setMaxSize(e.target.value ? Number(e.target.value) : null)}
                      className="px-3 py-1.5 border-2 border-bauhaus-charcoal bg-white text-sm"
                    >
                      <option value="">Any Size</option>
                      <option value="5">Max 5 GB</option>
                      <option value="10">Max 10 GB</option>
                      <option value="20">Max 20 GB</option>
                      <option value="50">Max 50 GB</option>
                    </select>
                  </div>

                  {/* Quick Filters */}
                  <div className="flex flex-wrap gap-2">
                    {['Qwen VL', 'Florence', 'LLaVA', 'PaliGemma', 'GOT-OCR'].map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term)
                          setSearchQuery(term)
                          setPage(1)
                        }}
                        className="px-3 py-1 text-sm bg-bauhaus-light hover:bg-bauhaus-silver transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Results */}
            {searching ? (
              <div className="text-center py-12 text-bauhaus-gray">Searching...</div>
            ) : searchResults?.models?.length ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-bauhaus-gray">
                  <span>
                    {searchResults.total} models found - Page {searchResults.page} of{' '}
                    {searchResults.pages}
                  </span>
                </div>

                {searchResults.models.map((model) => (
                  <ModelCard
                    key={model.model_id}
                    model={model}
                    selected={selectedModel === model.model_id}
                    onSelect={() => setSelectedModel(model.model_id)}
                    onDownload={() => downloadMutation.mutate(model.model_id)}
                    downloading={
                      downloadMutation.isPending &&
                      downloadMutation.variables === model.model_id
                    }
                    cached={cachedModels?.some(
                      (c) => c.name === model.model_id.replace('/', '--')
                    )}
                  />
                ))}

                {/* Pagination */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-bauhaus-gray">
                    Page {searchResults.page} of {searchResults.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= searchResults.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : searchQuery ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Search className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                  <p className="text-bauhaus-gray">No models found matching "{searchQuery}"</p>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Details Panel */}
          <div className="space-y-6">
            {selectedModel && modelDetails ? (
              <Card variant="red">
                <CardHeader>
                  <CardTitle className="text-lg break-all">
                    {modelDetails.model_id.split('/').pop()}
                  </CardTitle>
                  <CardDescription>by {modelDetails.author}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <ArrowDown className="w-4 h-4 text-bauhaus-gray" />
                      <span>{formatNumber(modelDetails.downloads)} downloads</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-bauhaus-gray" />
                      <span>{formatNumber(modelDetails.likes)} likes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-bauhaus-gray" />
                      <span>{modelDetails.total_size_gb} GB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-bauhaus-gray" />
                      <span>{modelDetails.vram_min_gb} GB VRAM</span>
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div>
                    <p className="text-sm font-medium mb-2">Fine-tuning Support</p>
                    <div className="flex flex-wrap gap-2">
                      {modelDetails.supports_lora && (
                        <Badge variant="green">LoRA</Badge>
                      )}
                      {modelDetails.supports_qlora && (
                        <Badge variant="blue">QLoRA</Badge>
                      )}
                    </div>
                  </div>

                  {/* Frameworks */}
                  <div>
                    <p className="text-sm font-medium mb-2">Compatible Frameworks</p>
                    <div className="flex flex-wrap gap-2">
                      {modelDetails.recommended_frameworks.map((fw) => (
                        <Badge key={fw} variant="gray">
                          {fw}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Files */}
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Files ({modelDetails.files.length})
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                      {modelDetails.files.slice(0, 10).map((file) => (
                        <div
                          key={file.filename}
                          className="flex justify-between text-bauhaus-gray"
                        >
                          <span className="truncate">{file.filename}</span>
                          <span>{file.size_human}</span>
                        </div>
                      ))}
                      {modelDetails.files.length > 10 && (
                        <p className="text-bauhaus-gray">
                          +{modelDetails.files.length - 10} more files
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-3 pt-4 border-t border-bauhaus-silver">
                    <Button
                      variant="red"
                      className="w-full"
                      onClick={() => downloadMutation.mutate(modelDetails.model_id)}
                      loading={downloadMutation.isPending}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Model
                    </Button>
                    <a
                      href={`https://huggingface.co/${modelDetails.model_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" className="w-full">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on HuggingFace
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Box className="w-12 h-12 mx-auto text-bauhaus-gray mb-4" />
                  <p className="text-bauhaus-gray">
                    Select a model to view details
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Cached Models */}
            {cachedModels && cachedModels.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cached Models</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {cachedModels.map((model) => (
                      <div
                        key={model.path}
                        className="flex items-center justify-between"
                      >
                        <span className="truncate">{model.name}</span>
                        <span className="text-bauhaus-gray">
                          {model.size_mb.toFixed(0)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Model Card Component
function ModelCard({
  model,
  selected,
  onSelect,
  onDownload,
  downloading,
  cached,
}: {
  model: ModelSearchResult
  selected: boolean
  onSelect: () => void
  onDownload: () => void
  downloading: boolean
  cached: boolean
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        selected ? 'ring-2 ring-bauhaus-blue' : ''
      }`}
      onClick={onSelect}
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-bauhaus-black truncate">
                {model.model_id}
              </h3>
              {cached && (
                <Badge variant="green" size="sm">
                  <Check className="w-3 h-3 mr-1" />
                  Cached
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-bauhaus-gray mb-2">
              <span className="flex items-center gap-1">
                <ArrowDown className="w-4 h-4" />
                {formatNumber(model.downloads)}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4" />
                {formatNumber(model.likes)}
              </span>
              {model.size_gb && (
                <span className="flex items-center gap-1">
                  <HardDrive className="w-4 h-4" />
                  {model.size_gb} GB
                </span>
              )}
              {model.vram_min_gb && (
                <span className="flex items-center gap-1">
                  <Cpu className="w-4 h-4" />
                  {model.vram_min_gb} GB VRAM
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {model.tags.slice(0, 5).map((tag) => (
                <Badge key={tag} variant="gray" size="sm">
                  {tag}
                </Badge>
              ))}
              {model.tags.length > 5 && (
                <Badge variant="gray" size="sm">
                  +{model.tags.length - 5}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="blue"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDownload()
            }}
            loading={downloading}
            className="ml-4 flex-shrink-0"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
