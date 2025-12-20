/**
 * API Client for Bauhaus Fine-Tuning Studio
 */

const API_BASE = '/api';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Helper function to handle API responses consistently
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      // Response body is not JSON
    }
    const message = typeof errorBody === 'object' && errorBody && 'detail' in errorBody
      ? String((errorBody as { detail: unknown }).detail)
      : `API request failed: ${response.statusText}`;
    throw new APIError(message, response.status, response.statusText, errorBody);
  }
  return response.json();
}

// Types
export interface Project {
  id: string;
  name: string;
  description?: string;
  created: string;
  updated?: string;
  status: string;
  model_id?: string;
  method?: string;
  stats?: {
    images: number;
    uploads: number;
    generated_files: number;
  };
}

export interface ModelSearchResult {
  model_id: string;
  author: string;
  model_name: string;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag?: string;
  last_modified: string;
  library_name?: string;
  license?: string;
  size_gb?: number;
  vram_min_gb?: number;
  vram_recommended_gb?: number;
  is_vlm: boolean;
}

export interface ModelDetails {
  model_id: string;
  author: string;
  description: string;
  downloads: number;
  likes: number;
  tags: string[];
  files: Array<{ filename: string; size: number; size_human: string }>;
  total_size_bytes: number;
  total_size_gb: number;
  supports_lora: boolean;
  supports_qlora: boolean;
  vram_min_gb: number;
  vram_recommended_gb: number;
  vram_qlora_gb: number;
  recommended_frameworks: string[];
}

export interface ImageSet {
  paths: string[];
  count: number;
  formats: string[];
  sample_dimensions?: [number, number];
  total_size_mb: number;
}

export interface DataFile {
  path: string;
  format: string;
  row_count: number;
  column_count: number;
  columns: string[];
  sample_rows: Record<string, unknown>[];
  detected_schema: Record<string, string>;
}

export interface OutputSchema {
  schema: Record<string, unknown>;
  source: string;
  sample_output: string;
}

export interface DetectionResult {
  images?: ImageSet;
  data?: DataFile;
  schema?: OutputSchema;
  warnings: string[];
  suggestions: string[];
}

export interface SkillConfig {
  base_url: string;
  api_key: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  extra_headers?: Record<string, string>;
}

export interface GeneratedSkill {
  filename: string;
  content: string;
  agent: string;
}

export interface AppSettings {
  openai?: {
    base_url?: string;
    api_key?: string;
    model?: string;
  };
  huggingface?: {
    token?: string;
  };
  training?: {
    method?: string;
    batch_size?: number;
    learning_rate?: string;
    epochs?: number;
  };
  storage?: {
    model_cache_dir?: string;
  };
  app?: {
    auto_save_interval?: number;
    terminal_theme?: string;
  };
}

// API Functions

// Projects
export async function listProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/projects`);
  const data = await handleResponse<{ projects: Project[] }>(response);
  return data.projects;
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const data = await handleResponse<{ project: Project }>(response);
  return data.project;
}

export async function getProject(projectId: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects/${projectId}`);
  const data = await handleResponse<{ project: Project }>(response);
  return data.project;
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
  await handleResponse<{ status: string }>(response);
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
  const response = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await handleResponse<{ project: Project }>(response);
  return data.project;
}

// File Upload
export async function uploadFiles(projectId: string, files: File[]): Promise<DetectionResult> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const response = await fetch(`${API_BASE}/projects/${projectId}/upload`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<DetectionResult>(response);
}

export async function detectProjectInputs(projectId: string): Promise<DetectionResult> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/detect`, {
    method: 'POST',
  });
  return handleResponse<DetectionResult>(response);
}

export async function saveSchema(projectId: string, schema: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  });
  await handleResponse<{ status: string }>(response);
}

// HuggingFace
export async function searchModels(params: {
  query: string;
  task?: string;
  library?: string;
  max_size_gb?: number;
  vlm_only?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ models: ModelSearchResult[]; total: number; page: number; pages: number }> {
  const searchParams = new URLSearchParams();
  searchParams.append('query', params.query);
  if (params.task) searchParams.append('task', params.task);
  if (params.library) searchParams.append('library', params.library);
  if (params.max_size_gb) searchParams.append('max_size_gb', String(params.max_size_gb));
  if (params.vlm_only !== undefined) searchParams.append('vlm_only', String(params.vlm_only));
  if (params.limit) searchParams.append('limit', String(params.limit));
  if (params.offset) searchParams.append('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/hf/search?${searchParams}`);
  return handleResponse<{ models: ModelSearchResult[]; total: number; page: number; pages: number }>(response);
}

export async function getModelDetails(modelId: string): Promise<ModelDetails> {
  const response = await fetch(`${API_BASE}/hf/models/${encodeURIComponent(modelId)}`);
  return handleResponse<ModelDetails>(response);
}

export async function downloadModel(modelId: string, projectId?: string): Promise<{ status: string; path: string }> {
  const response = await fetch(`${API_BASE}/hf/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId, project_id: projectId }),
  });
  return handleResponse<{ status: string; path: string }>(response);
}

export async function getCachedModels(): Promise<Array<{ name: string; path: string; size_mb: number }>> {
  const response = await fetch(`${API_BASE}/hf/cached`);
  const data = await handleResponse<{ models: Array<{ name: string; path: string; size_mb: number }> }>(response);
  return data.models;
}

// Skill Generator
export async function getSkillPresets(): Promise<Record<string, { name: string; base_url: string; models: string[]; description: string }>> {
  const response = await fetch(`${API_BASE}/skills/presets`);
  const data = await handleResponse<{ presets: Record<string, { name: string; base_url: string; models: string[]; description: string }> }>(response);
  return data.presets;
}

export async function configureSkillGenerator(config: SkillConfig): Promise<void> {
  const response = await fetch(`${API_BASE}/skills/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  await handleResponse<{ status: string }>(response);
}

export async function testSkillConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
  const response = await fetch(`${API_BASE}/skills/test`, { method: 'POST' });
  return handleResponse<{ success: boolean; models?: string[]; error?: string }>(response);
}

export async function generateSkills(
  projectInfo: Record<string, unknown>,
  agentTypes?: string[]
): Promise<GeneratedSkill[]> {
  const response = await fetch(`${API_BASE}/skills/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_info: projectInfo, agent_types: agentTypes }),
  });
  const data = await handleResponse<{ skills: GeneratedSkill[] }>(response);
  return data.skills;
}

// Generate skills using the global settings (unified provider)
export async function generateSkillsWithSettings(
  projectInfo: Record<string, unknown>,
  agentTypes?: string[]
): Promise<GeneratedSkill[]> {
  // First get the settings
  const settings = await getSettings();

  // Configure the skill generator with global settings
  if (settings.openai?.base_url && settings.openai?.api_key) {
    await configureSkillGenerator({
      base_url: settings.openai.base_url,
      api_key: settings.openai.api_key,
      model: settings.openai.model || 'gpt-4o',
      temperature: 0.7,
    });
  }

  // Now generate skills
  return generateSkills(projectInfo, agentTypes);
}

export async function generateProjectSkills(projectId: string, agentTypes?: string[]): Promise<string[]> {
  const params = agentTypes ? `?agent_types=${agentTypes.join(',')}` : '';
  const response = await fetch(`${API_BASE}/projects/${projectId}/skills/generate${params}`, {
    method: 'POST',
  });
  const data = await handleResponse<{ saved: string[] }>(response);
  return data.saved;
}

// Terminal
export function createTerminalWebSocket(projectId: string, agent: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/ws/terminal/${projectId}/${agent}`);
}

// Status
export async function getStatus(): Promise<{
  projects_count: number;
  models_cached: number;
  services: Record<string, string>;
}> {
  const response = await fetch(`${API_BASE}/status`);
  return handleResponse<{
    projects_count: number;
    models_cached: number;
    services: Record<string, string>;
  }>(response);
}

export async function listTerminals(): Promise<Array<{
  session_id: string;
  project_id: string;
  agent: string;
  running: boolean;
}>> {
  const response = await fetch(`${API_BASE}/terminals`);
  const data = await handleResponse<{ sessions: Array<{
    session_id: string;
    project_id: string;
    agent: string;
    running: boolean;
  }> }>(response);
  return data.sessions;
}

export async function getGeneratedFiles(projectId: string): Promise<Array<{
  name: string;
  path: string;
  size: number;
  content?: string;
}>> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/generated`);
  const data = await handleResponse<{ files: Array<{
    name: string;
    path: string;
    size: number;
    content?: string;
  }> }>(response);
  return data.files;
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE}/settings`);
  if (!response.ok) {
    // Return empty settings on error (e.g., settings file doesn't exist)
    return {};
  }
  const data = await response.json() as { settings?: AppSettings };
  return data.settings || {};
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const data = await handleResponse<{ settings: AppSettings }>(response);
  return data.settings;
}

export async function testOpenAIConnection(config: {
  base_url: string;
  api_key: string;
  model?: string;
}): Promise<{ success: boolean; models?: string[]; error?: string }> {
  const response = await fetch(`${API_BASE}/settings/test/openai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return handleResponse<{ success: boolean; models?: string[]; error?: string }>(response);
}

export async function testHuggingFaceConnection(token: string): Promise<{
  success: boolean;
  username?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/settings/test/huggingface`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse<{ success: boolean; username?: string; error?: string }>(response);
}
