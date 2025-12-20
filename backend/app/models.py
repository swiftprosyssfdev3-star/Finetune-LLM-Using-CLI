"""
Pydantic models for request/response validation
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field, field_validator
import re


# ═══════════════════════════════════════════════════════════════
# PROJECT MODELS
# ═══════════════════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    """Request model for creating a project."""
    name: str = Field(..., min_length=1, max_length=100, description="Project name")
    description: Optional[str] = Field(None, max_length=500, description="Project description")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        # Allow alphanumeric, spaces, hyphens, underscores
        if not re.match(r'^[\w\s\-]+$', v):
            raise ValueError('Name can only contain letters, numbers, spaces, hyphens, and underscores')
        return v.strip()


class ProjectUpdate(BaseModel):
    """Request model for updating a project."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = Field(None)
    model_id: Optional[str] = Field(None)
    method: Optional[str] = Field(None)


class ProjectStats(BaseModel):
    """Project statistics."""
    images: int = 0
    uploads: int = 0
    generated_files: int = 0


class ProjectResponse(BaseModel):
    """Response model for a project."""
    id: str
    name: str
    description: Optional[str] = None
    created: str
    updated: Optional[str] = None
    status: str = "created"
    model_id: Optional[str] = None
    method: Optional[str] = None
    stats: Optional[ProjectStats] = None
    path: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# SETTINGS MODELS
# ═══════════════════════════════════════════════════════════════

class OpenAISettings(BaseModel):
    """OpenAI-compatible API settings."""
    base_url: Optional[str] = Field(None, description="API base URL")
    api_key: Optional[str] = Field(None, description="API key")
    model: Optional[str] = Field(None, description="Default model")


class HuggingFaceSettings(BaseModel):
    """HuggingFace settings."""
    token: Optional[str] = Field(None, description="HuggingFace token")


class TrainingSettings(BaseModel):
    """Training default settings."""
    method: Optional[str] = Field("lora", description="Training method")
    batch_size: Optional[int] = Field(4, ge=1, le=128, description="Batch size")
    learning_rate: Optional[str] = Field("2e-5", description="Learning rate")
    epochs: Optional[int] = Field(3, ge=1, le=100, description="Number of epochs")


class StorageSettings(BaseModel):
    """Storage settings."""
    model_cache_dir: Optional[str] = Field(None, description="Model cache directory")


class AppUISettings(BaseModel):
    """Application UI settings."""
    auto_save_interval: Optional[int] = Field(30, ge=5, le=300, description="Auto-save interval in seconds")
    terminal_theme: Optional[str] = Field("dark", description="Terminal theme")


class AppSettings(BaseModel):
    """Complete application settings."""
    openai: Optional[OpenAISettings] = None
    huggingface: Optional[HuggingFaceSettings] = None
    training: Optional[TrainingSettings] = None
    storage: Optional[StorageSettings] = None
    app: Optional[AppUISettings] = None


class OpenAITestRequest(BaseModel):
    """Request for testing OpenAI connection."""
    base_url: str = Field(..., min_length=1, description="API base URL")
    api_key: str = Field(..., min_length=1, description="API key")
    model: Optional[str] = Field(None, description="Model to test")


class HuggingFaceTestRequest(BaseModel):
    """Request for testing HuggingFace connection."""
    token: str = Field(..., min_length=1, description="HuggingFace token")


# ═══════════════════════════════════════════════════════════════
# SKILL GENERATOR MODELS
# ═══════════════════════════════════════════════════════════════

class SkillGeneratorConfigRequest(BaseModel):
    """Request for configuring skill generator."""
    base_url: str = Field(..., min_length=1, description="API base URL")
    api_key: str = Field(..., min_length=1, description="API key")
    model: str = Field(..., min_length=1, description="Model to use")
    temperature: Optional[float] = Field(0.7, ge=0, le=2, description="Temperature")
    max_tokens: Optional[int] = Field(4096, ge=100, le=32000, description="Max tokens")
    extra_headers: Optional[Dict[str, str]] = Field(None, description="Extra headers")


class SkillGenerateRequest(BaseModel):
    """Request for generating skills."""
    project_info: Dict[str, Any] = Field(..., description="Project information")
    agent_types: Optional[List[str]] = Field(None, description="Agent types to generate for")


class GeneratedSkillResponse(BaseModel):
    """Response for a generated skill."""
    filename: str
    content: str
    agent: str


# ═══════════════════════════════════════════════════════════════
# HUGGINGFACE MODELS
# ═══════════════════════════════════════════════════════════════

class ModelDownloadRequest(BaseModel):
    """Request for downloading a model."""
    model_id: str = Field(..., min_length=1, description="Model ID")
    local_dir: Optional[str] = Field(None, description="Local directory")
    project_id: Optional[str] = Field(None, description="Project ID")


class ModelSearchResult(BaseModel):
    """Model search result."""
    model_id: str
    author: str
    model_name: str
    downloads: int
    likes: int
    tags: List[str]
    pipeline_tag: Optional[str] = None
    last_modified: str
    library_name: Optional[str] = None
    license: Optional[str] = None
    size_gb: Optional[float] = None
    vram_min_gb: Optional[int] = None
    vram_recommended_gb: Optional[int] = None
    vram_qlora_gb: Optional[int] = None
    is_vlm: bool = False


# ═══════════════════════════════════════════════════════════════
# SCHEMA MODELS
# ═══════════════════════════════════════════════════════════════

class SchemaField(BaseModel):
    """A field in the output schema."""
    type: str
    format: Optional[str] = None
    description: Optional[str] = None


class OutputSchemaRequest(BaseModel):
    """Request for saving output schema."""
    schema_data: Dict[str, Any] = Field(..., alias="schema", description="JSON schema")

    class Config:
        populate_by_name = True


# ═══════════════════════════════════════════════════════════════
# RESPONSE WRAPPERS
# ═══════════════════════════════════════════════════════════════

class StatusResponse(BaseModel):
    """Generic status response."""
    status: str
    message: Optional[str] = None


class SuccessResponse(BaseModel):
    """Success response with optional data."""
    success: bool
    error: Optional[str] = None
    models: Optional[List[str]] = None
    username: Optional[str] = None
    email: Optional[str] = None
