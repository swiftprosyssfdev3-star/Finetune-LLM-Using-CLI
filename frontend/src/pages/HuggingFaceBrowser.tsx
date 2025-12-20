import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { searchModels, getModelDetails, downloadModel, getCachedModels, subscribeToDownloadProgress, type ModelSearchResult, type DownloadProgress } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/bauhaus'
import { Button, Badge, ProgressBar } from '@/components/bauhaus'
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
  Check,
  ExternalLink,
  Home,
  FolderPlus,
  X,
  AlertCircle,
} from 'lucide-react'

interface ActiveDownload {
  modelId: string;
  downloadId: string;
  progress: DownloadProgress | null;
  cleanup: () => void;
}

export default function HuggingFaceBrowser() {
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [vlmOnly, setVlmOnly] = useState(true)
  const [maxSize, setMaxSize] = useState<number | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<Map<string, ActiveDownload>>(new Map())
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const cleanupRefs = useRef<Map<string, () => void>>(new Map())

  const limit = 10

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRefs.current.forEach(cleanup => cleanup())
    }
  }, [])

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

  const { data: modelDetails } = useQuery({
    queryKey: ['model-details', selectedModel],
    queryFn: () => getModelDetails(selectedModel!),
    enabled: !!selectedModel,
  })

  const { data: cachedModels, refetch: refetchCachedModels } = useQuery({
    queryKey: ['cached-models'],
    queryFn: getCachedModels,
  })

  const startDownload = useCallback(async (modelId: string) => {
    try {
      setDownloadError(null)
      const result = await downloadModel(modelId)

      // Create initial download entry
      const download: ActiveDownload = {
        modelId,
        downloadId: result.download_id,
        progress: null,
        cleanup: () => {},
      }

      // Subscribe to progress updates
      const cleanup = subscribeToDownloadProgress(
        result.download_id,
        (progress) => {
          setActiveDownloads(prev => {
            const newMap = new Map(prev)
            const existing = newMap.get(modelId)
            if (existing) {
              newMap.set(modelId, { ...existing, progress })
            }
            return newMap
          })
        },
        (completedProgress) => {
          // Download complete
          setActiveDownloads(prev => {
            const newMap = new Map(prev)
            newMap.delete(modelId)
            return newMap
          })
          cleanupRefs.current.delete(modelId)
          // Refresh cached models
          refetchCachedModels()
        },
        (error) => {
          setDownloadError(`Download failed: ${error}`)
          setActiveDownloads(prev => {
            const newMap = new Map(prev)
            newMap.delete(modelId)
            return newMap
          })
          cleanupRefs.current.delete(modelId)
        }
      )

      download.cleanup = cleanup
      cleanupRefs.current.set(modelId, cleanup)

      setActiveDownloads(prev => {
        const newMap = new Map(prev)
        newMap.set(modelId, download)
        return newMap
      })
    } catch (e) {
      setDownloadError(`Failed to start download: ${e}`)
    }
  }, [refetchCachedModels])

  const cancelDownload = useCallback((modelId: string) => {
    const cleanup = cleanupRefs.current.get(modelId)
    if (cleanup) {
      cleanup()
      cleanupRefs.current.delete(modelId)
    }
    setActiveDownloads(prev => {
      const newMap = new Map(prev)
      newMap.delete(modelId)
      return newMap
    })
  }, [])

  const isDownloading = useCallback((modelId: string) => {
    return activeDownloads.has(modelId)
  }, [activeDownloads])

  const getDownloadProgress = useCallback((modelId: string) => {
    return activeDownloads.get(modelId)?.progress
  }, [activeDownloads])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(query)
    setPage(1)
    setSelectedModel(null)
  }

  return (
    <div className="min-h-screen">
      {/* Navigation Bar */}
      <div className="bg-white border-b border-bauhaus-silver px-8 py-4">
        <div className="flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2 text-bauhaus-gray hover:text-bauhaus-black transition">
            <Home className="w-5 h-5" />
            <span className="font-medium">Home</span>
          </Link>
          <Link to="/new">
            <Button variant="red" size="sm">
              <FolderPlus className="w-4 h-4 mr-1" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

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

            {/* Download Error Alert */}
            {downloadError && (
              <div className="bg-red-50 border-2 border-bauhaus-red p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-bauhaus-red flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-bauhaus-red text-sm">{downloadError}</p>
                </div>
                <button onClick={() => setDownloadError(null)} className="text-bauhaus-red hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active Downloads Panel */}
            {activeDownloads.size > 0 && (
              <Card variant="blue">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Active Downloads ({activeDownloads.size})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from(activeDownloads.values()).map((download) => (
                    <div key={download.modelId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1">{download.modelId}</span>
                        <button
                          onClick={() => cancelDownload(download.modelId)}
                          className="text-bauhaus-gray hover:text-bauhaus-red ml-2"
                          title="Cancel download"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <ProgressBar
                        value={download.progress?.progress || 0}
                        variant="blue"
                        label={download.progress?.status === 'downloading' ? 'Downloading' : 'Starting...'}
                      />
                      {download.progress && (
                        <div className="flex justify-between text-xs text-bauhaus-gray">
                          <span>
                            {download.progress.downloaded_files} / {download.progress.total_files} files
                          </span>
                          <span>
                            {formatBytes(download.progress.downloaded_bytes)} / {formatBytes(download.progress.total_bytes)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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
                    onDownload={() => startDownload(model.model_id)}
                    downloading={isDownloading(model.model_id)}
                    downloadProgress={getDownloadProgress(model.model_id)}
                    cached={cachedModels?.some(
                      (c) => c.name === model.model_id.replace('/', '--')
                    ) || false}
                  />
                ))}

                {/* Pagination */}
                <PaginationControls
                  currentPage={page}
                  totalPages={searchResults.pages}
                  onPageChange={setPage}
                />
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
                    {isDownloading(modelDetails.model_id) ? (
                      <div className="space-y-2">
                        <ProgressBar
                          value={getDownloadProgress(modelDetails.model_id)?.progress || 0}
                          variant="red"
                          label="Downloading"
                        />
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => cancelDownload(modelDetails.model_id)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Cancel Download
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="red"
                        className="w-full"
                        onClick={() => startDownload(modelDetails.model_id)}
                        disabled={cachedModels?.some(
                          (c) => c.name === modelDetails.model_id.replace('/', '--')
                        )}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {cachedModels?.some(
                          (c) => c.name === modelDetails.model_id.replace('/', '--')
                        ) ? 'Already Downloaded' : 'Download Model'}
                      </Button>
                    )}
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

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// Pagination Controls Component
function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      // Always show first page
      pages.push(1)

      if (currentPage > 3) {
        pages.push('ellipsis')
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis')
      }

      // Always show last page
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex items-center justify-center gap-2 py-4 border-t border-bauhaus-silver mt-4">
      {/* Previous Button */}
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline ml-1">Previous</span>
      </Button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {getPageNumbers().map((pageNum, idx) =>
          pageNum === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-bauhaus-gray">
              ...
            </span>
          ) : (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-8 h-8 text-sm font-medium transition-colors ${
                pageNum === currentPage
                  ? 'bg-bauhaus-blue text-white'
                  : 'bg-bauhaus-light hover:bg-bauhaus-silver text-bauhaus-charcoal'
              }`}
            >
              {pageNum}
            </button>
          )
        )}
      </div>

      {/* Next Button */}
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <span className="hidden sm:inline mr-1">Next</span>
        <ChevronRight className="w-4 h-4" />
      </Button>

      {/* Jump to Page */}
      {totalPages > 5 && (
        <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-bauhaus-silver">
          <span className="text-sm text-bauhaus-gray">Go to:</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            className="w-16 px-2 py-1 text-sm border-2 border-bauhaus-charcoal bg-white"
            placeholder={String(currentPage)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const value = parseInt((e.target as HTMLInputElement).value)
                if (value >= 1 && value <= totalPages) {
                  onPageChange(value)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }
            }}
          />
        </div>
      )}
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
  downloadProgress,
  cached,
}: {
  model: ModelSearchResult
  selected: boolean
  onSelect: () => void
  onDownload: () => void
  downloading: boolean
  downloadProgress?: DownloadProgress | null
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
            {/* Inline Download Progress */}
            {downloading && downloadProgress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-bauhaus-gray mb-1">
                  <span>{downloadProgress.progress}% downloaded</span>
                  <span>{formatBytes(downloadProgress.downloaded_bytes)} / {formatBytes(downloadProgress.total_bytes)}</span>
                </div>
                <div className="w-full h-1.5 bg-bauhaus-silver rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bauhaus-blue transition-all duration-300"
                    style={{ width: `${downloadProgress.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex flex-col items-end gap-2">
            {downloading ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-bauhaus-blue font-medium">
                  {downloadProgress?.progress || 0}%
                </span>
                <div className="w-8 h-8 border-2 border-bauhaus-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Button
                variant="blue"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload()
                }}
                disabled={cached}
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
