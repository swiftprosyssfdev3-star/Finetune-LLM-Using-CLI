"""
Bauhaus Fine-Tuning Studio - Main FastAPI Application

Autonomous multi-agent platform for VLM fine-tuning with:
- HuggingFace model browser
- Flexible input detection (images, XLSX, JSON)
- OpenAI-compatible skill generation
- Real-time terminal streaming
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pathlib import Path
import json
import os
import uuid
import shutil
import logging
from datetime import datetime

from app.services.huggingface_browser import hf_browser
from app.services.input_detector import input_detector
from app.services.skill_generator import skill_generator, SkillGeneratorConfig, PROVIDER_PRESETS
from app.services.terminal_manager import terminal_manager
from app.models import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    AppSettings, OpenAITestRequest, HuggingFaceTestRequest,
    SkillGeneratorConfigRequest, SkillGenerateRequest,
    ModelDownloadRequest, StatusResponse,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Ensure directories exist
PROJECTS_DIR = Path("./projects")
MODELS_DIR = Path("./models/cache")
SETTINGS_FILE = Path("./settings.json")
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown."""
    # Startup
    logger.info("Bauhaus Fine-Tuning Studio starting...")
    logger.info(f"Projects directory: {PROJECTS_DIR.absolute()}")
    logger.info(f"Models cache: {MODELS_DIR.absolute()}")
    yield
    # Shutdown
    logger.info("Bauhaus Fine-Tuning Studio shutting down...")


# Create FastAPI app with lifespan
app = FastAPI(
    title="Bauhaus Fine-Tuning Studio",
    description="Autonomous multi-agent VLM fine-tuning platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


@app.get("/api/status")
async def get_status():
    """Get system status."""
    return {
        "projects_count": len(list(PROJECTS_DIR.glob("*"))),
        "models_cached": len(list(MODELS_DIR.glob("*"))),
        "services": {
            "huggingface": "available",
            "skill_generator": "configured" if skill_generator.config else "not_configured",
            "terminal": "available"
        }
    }


# ═══════════════════════════════════════════════════════════════
# SETTINGS API
# ═══════════════════════════════════════════════════════════════

def load_settings() -> Dict[str, Any]:
    """Load settings from file."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse settings file: {e}")
            return {}
        except OSError as e:
            logger.warning(f"Failed to read settings file: {e}")
            return {}
    return {}


def save_settings(settings: Dict[str, Any]) -> None:
    """Save settings to file."""
    try:
        SETTINGS_FILE.write_text(json.dumps(settings, indent=2))
    except OSError as e:
        logger.error(f"Failed to save settings: {e}")
        raise


@app.get("/api/settings")
async def get_settings():
    """Get application settings."""
    settings = load_settings()
    # Mask sensitive fields
    masked_settings = settings.copy()
    if 'openai' in masked_settings and masked_settings['openai'].get('api_key'):
        key = masked_settings['openai']['api_key']
        masked_settings['openai']['api_key'] = key[:8] + '...' + key[-4:] if len(key) > 12 else '***'
    if 'huggingface' in masked_settings and masked_settings['huggingface'].get('token'):
        token = masked_settings['huggingface']['token']
        masked_settings['huggingface']['token'] = token[:8] + '...' + token[-4:] if len(token) > 12 else '***'
    return {"settings": masked_settings}


@app.post("/api/settings")
async def update_settings(settings: Dict[str, Any]):
    """Update application settings."""
    try:
        # Load existing settings to preserve any unmasked keys
        existing = load_settings()

        # Handle masked API keys - don't overwrite with masked value
        if 'openai' in settings:
            if settings['openai'].get('api_key', '').endswith('...'):
                settings['openai']['api_key'] = existing.get('openai', {}).get('api_key', '')
        if 'huggingface' in settings:
            if settings['huggingface'].get('token', '').endswith('...'):
                settings['huggingface']['token'] = existing.get('huggingface', {}).get('token', '')

        # Merge with existing settings
        merged = {**existing, **settings}

        # Deep merge nested dicts
        for key in ['openai', 'huggingface', 'training', 'storage', 'app']:
            if key in existing and key in settings:
                merged[key] = {**existing.get(key, {}), **settings.get(key, {})}

        save_settings(merged)

        # Also update the skill generator config if OpenAI settings changed
        if 'openai' in settings and settings['openai'].get('api_key'):
            openai_config = merged.get('openai', {})
            if openai_config.get('base_url') and openai_config.get('api_key'):
                skill_generator.configure(SkillGeneratorConfig(
                    base_url=openai_config['base_url'],
                    api_key=openai_config['api_key'],
                    model=openai_config.get('model', 'gpt-4o'),
                ))

        # Set HuggingFace token as environment variable
        if 'huggingface' in settings and settings['huggingface'].get('token'):
            os.environ['HF_TOKEN'] = merged['huggingface']['token']

        return {"status": "saved", "settings": merged}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/test/openai")
async def test_openai_connection(config: OpenAITestRequest):
    """Test OpenAI-compatible API connection."""
    import httpx

    base_url = config.base_url.rstrip('/')
    api_key = config.api_key

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )

            if response.status_code == 200:
                data = response.json()
                models = [m.get('id', m.get('name', 'unknown')) for m in data.get('data', data.get('models', []))]
                return {"success": True, "models": models[:20]}
            elif response.status_code == 401:
                return {"success": False, "error": "Invalid API key"}
            elif response.status_code == 404:
                # Some providers don't have /models endpoint, try a simple completion
                return {"success": True, "models": [], "message": "Connected (models list not available)"}
            else:
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text[:100]}"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Connection timed out"}
    except httpx.ConnectError as e:
        return {"success": False, "error": f"Connection failed: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/settings/test/huggingface")
async def test_huggingface_connection(config: HuggingFaceTestRequest):
    """Test HuggingFace token."""
    import httpx

    token = config.token

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://huggingface.co/api/whoami-v2",
                headers={"Authorization": f"Bearer {token}"}
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "username": data.get('name', data.get('fullname', 'user')),
                    "email": data.get('email'),
                }
            elif response.status_code == 401:
                return {"success": False, "error": "Invalid token"}
            else:
                return {"success": False, "error": f"HTTP {response.status_code}"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Connection timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════
# HUGGINGFACE BROWSER API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/hf/search")
async def search_models(
    query: str = Query(..., description="Search query"),
    task: Optional[str] = Query(None, description="Filter by task"),
    library: Optional[str] = Query(None, description="Filter by library"),
    max_size_gb: Optional[float] = Query(None, description="Max model size in GB"),
    vlm_only: bool = Query(True, description="Only VLM models"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    sort: str = Query("downloads", description="Sort field"),
):
    """Search HuggingFace for models."""
    try:
        result = await hf_browser.search_models(
            query=query,
            task=task,
            library=library,
            max_size_gb=max_size_gb,
            vlm_only=vlm_only,
            limit=limit,
            offset=offset,
            sort=sort,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/hf/models/{model_id:path}")
async def get_model_details(model_id: str):
    """Get detailed model information."""
    try:
        result = await hf_browser.get_model_details(model_id)
        return result.__dict__
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Model not found: {str(e)}")


@app.post("/api/hf/download")
async def download_model(request: ModelDownloadRequest):
    """Download a model from HuggingFace."""
    try:
        local_dir = request.local_dir
        if request.project_id and not local_dir:
            local_dir = str(PROJECTS_DIR / request.project_id / "model")

        logger.info(f"Downloading model: {request.model_id}")
        path = await hf_browser.download_model(request.model_id, local_dir)
        logger.info(f"Model downloaded to: {path}")
        return {"status": "completed", "path": path, "model_id": request.model_id}
    except Exception as e:
        logger.error(f"Failed to download model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/hf/cached")
async def get_cached_models():
    """Get list of locally cached models."""
    cached = []
    for model_dir in MODELS_DIR.glob("*"):
        if model_dir.is_dir():
            cached.append({
                "name": model_dir.name.replace("--", "/"),
                "path": str(model_dir),
                "size_mb": sum(f.stat().st_size for f in model_dir.rglob("*") if f.is_file()) / (1024 * 1024)
            })
    return {"models": cached}


# ═══════════════════════════════════════════════════════════════
# PROJECT MANAGEMENT API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/projects")
async def list_projects():
    """List all projects."""
    projects = []
    for project_dir in PROJECTS_DIR.glob("*"):
        if project_dir.is_dir():
            meta_file = project_dir / "project.json"
            if meta_file.exists():
                meta = json.loads(meta_file.read_text())
            else:
                meta = {"name": project_dir.name, "created": "unknown"}

            meta["id"] = project_dir.name
            meta["path"] = str(project_dir)
            projects.append(meta)

    return {"projects": sorted(projects, key=lambda x: x.get("created", ""), reverse=True)}


@app.post("/api/projects")
async def create_project(project: ProjectCreate):
    """Create a new project."""
    # Sanitize name for filesystem
    safe_name = project.name.lower().replace(' ', '-')
    safe_name = ''.join(c for c in safe_name if c.isalnum() or c == '-')
    project_id = f"{safe_name}-{uuid.uuid4().hex[:8]}"
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories
    (project_dir / "uploads").mkdir(exist_ok=True)
    (project_dir / "images").mkdir(exist_ok=True)
    (project_dir / "dataset").mkdir(exist_ok=True)
    (project_dir / "generated_code").mkdir(exist_ok=True)
    (project_dir / "checkpoints").mkdir(exist_ok=True)
    (project_dir / "outputs").mkdir(exist_ok=True)

    # Create project metadata
    meta = {
        "id": project_id,
        "name": project.name,
        "description": project.description or "",
        "created": datetime.utcnow().isoformat(),
        "status": "created",
        "model_id": None,
        "method": "lora",
    }
    (project_dir / "project.json").write_text(json.dumps(meta, indent=2))
    logger.info(f"Created project: {project_id}")

    return {"project": meta}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """Get project details."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    meta_file = project_dir / "project.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    meta["id"] = project_id

    # Count files
    meta["stats"] = {
        "images": len(list((project_dir / "images").glob("*"))) if (project_dir / "images").exists() else 0,
        "uploads": len(list((project_dir / "uploads").glob("*"))) if (project_dir / "uploads").exists() else 0,
        "generated_files": len(list((project_dir / "generated_code").glob("*"))) if (project_dir / "generated_code").exists() else 0,
    }

    return {"project": meta}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    shutil.rmtree(project_dir)
    return {"status": "deleted", "project_id": project_id}


@app.patch("/api/projects/{project_id}")
async def update_project(project_id: str, updates: ProjectUpdate):
    """Update project metadata."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    meta_file = project_dir / "project.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}

    # Only update fields that are provided
    update_data = updates.model_dump(exclude_unset=True)
    meta.update(update_data)
    meta["updated"] = datetime.utcnow().isoformat()
    meta_file.write_text(json.dumps(meta, indent=2))
    logger.info(f"Updated project: {project_id}")

    return {"project": meta}


# ═══════════════════════════════════════════════════════════════
# FILE UPLOAD & INPUT DETECTION API
# ═══════════════════════════════════════════════════════════════

@app.post("/api/projects/{project_id}/upload")
async def upload_files(project_id: str, files: List[UploadFile] = File(...)):
    """Upload files and auto-detect format."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    upload_dir = project_dir / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    paths = []
    for file in files:
        file_path = upload_dir / file.filename
        content = await file.read()
        file_path.write_bytes(content)
        paths.append(str(file_path))

    # Detect inputs
    result = await input_detector.detect_inputs(paths)

    # Copy images to images directory if detected
    if result.images:
        images_dir = project_dir / "images"
        images_dir.mkdir(exist_ok=True)
        for img_path in result.images.paths[:1000]:  # Limit for safety
            src = Path(img_path)
            if src.exists():
                dst = images_dir / src.name
                if not dst.exists():
                    shutil.copy2(src, dst)

    return {
        "uploaded": len(paths),
        "images": result.images.__dict__ if result.images else None,
        "data": result.data.__dict__ if result.data else None,
        "schema": result.schema.__dict__ if result.schema else None,
        "warnings": result.warnings,
        "suggestions": result.suggestions,
    }


@app.post("/api/projects/{project_id}/detect")
async def detect_project_inputs(project_id: str):
    """Re-detect inputs for existing project files."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    paths = []
    for subdir in ["uploads", "images"]:
        dir_path = project_dir / subdir
        if dir_path.exists():
            paths.extend([str(f) for f in dir_path.glob("*") if f.is_file()])

    result = await input_detector.detect_inputs(paths)

    return {
        "images": result.images.__dict__ if result.images else None,
        "data": result.data.__dict__ if result.data else None,
        "schema": result.schema.__dict__ if result.schema else None,
        "warnings": result.warnings,
        "suggestions": result.suggestions,
    }


@app.post("/api/projects/{project_id}/schema")
async def save_schema(project_id: str, schema: Dict[str, Any]):
    """Save output schema for project."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    schema_file = project_dir / "schema.json"
    schema_file.write_text(json.dumps(schema, indent=2))

    return {"status": "saved", "path": str(schema_file)}


# ═══════════════════════════════════════════════════════════════
# SKILL GENERATOR API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/skills/presets")
async def get_skill_presets():
    """Get available provider presets for skill generation."""
    return {"presets": PROVIDER_PRESETS}


@app.post("/api/skills/configure")
async def configure_skill_generator(config: SkillGeneratorConfigRequest):
    """Configure the skill generator API."""
    try:
        skill_generator.configure(SkillGeneratorConfig(
            base_url=config.base_url,
            api_key=config.api_key,
            model=config.model,
            temperature=config.temperature or 0.7,
            max_tokens=config.max_tokens or 4096,
            extra_headers=config.extra_headers,
        ))
        logger.info(f"Skill generator configured with model: {config.model}")
        return {"status": "configured", "model": config.model}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/skills/configure/preset")
async def configure_from_preset(
    preset: str,
    api_key: str,
    model: Optional[str] = None
):
    """Configure skill generator from a provider preset."""
    try:
        skill_generator.configure_from_preset(preset, api_key, model)
        return {"status": "configured", "preset": preset}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/skills/test")
async def test_skill_generator():
    """Test the skill generator API connection."""
    result = await skill_generator.test_connection()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))
    return result


@app.post("/api/skills/generate")
async def generate_skills(request: SkillGenerateRequest):
    """Generate skill files for agents."""
    try:
        skills = await skill_generator.generate_all_skills(
            request.project_info,
            request.agent_types
        )
        return {
            "skills": [
                {"filename": s.filename, "content": s.content, "agent": s.agent_type}
                for s in skills
            ]
        }
    except Exception as e:
        logger.error(f"Failed to generate skills: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/skills/generate")
async def generate_project_skills(
    project_id: str,
    agent_types: Optional[List[str]] = None
):
    """Generate and save skill files for a project."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    # Load project metadata
    meta_file = project_dir / "project.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}

    # Load schema
    schema_file = project_dir / "schema.json"
    schema = json.loads(schema_file.read_text()) if schema_file.exists() else {}

    # Count images and data
    images_dir = project_dir / "images"
    image_count = len(list(images_dir.glob("*"))) if images_dir.exists() else 0

    # Build project info
    project_info = {
        "name": meta.get("name", project_id),
        "model_id": meta.get("model_id", "Qwen/Qwen2.5-VL-2B-Instruct"),
        "method": meta.get("method", "lora"),
        "image_count": image_count,
        "data_rows": meta.get("data_rows", 0),
        "schema": schema,
    }

    try:
        skills = await skill_generator.generate_all_skills(project_info, agent_types)

        # Save skill files
        saved = []
        for skill in skills:
            file_path = project_dir / skill.filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(skill.content)
            saved.append(str(file_path))

        return {"saved": saved, "skills": [s.filename for s in skills]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════
# TERMINAL WEBSOCKET
# ═══════════════════════════════════════════════════════════════

@app.websocket("/ws/terminal/{project_id}/{agent}")
async def terminal_websocket(websocket: WebSocket, project_id: str, agent: str):
    """WebSocket for real-time terminal streaming."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        await websocket.close(code=4004, reason="Project not found")
        return

    # Load settings to get configured models
    settings = load_settings()
    openai_config = settings.get('openai', {})

    # Build model configuration for agents
    model_config = {
        'default_model': openai_config.get('model', 'gpt-4o'),
        'api_key': openai_config.get('api_key', ''),
        'base_url': openai_config.get('base_url', ''),
    }

    await terminal_manager.handle_websocket(websocket, project_id, agent, model_config)


@app.get("/api/terminals")
async def list_terminals():
    """List active terminal sessions."""
    sessions = []
    for session_id, session in terminal_manager.sessions.items():
        sessions.append({
            "session_id": session_id,
            "project_id": session.project_id,
            "agent": session.agent,
            "running": session.running,
        })
    return {"sessions": sessions}


# ═══════════════════════════════════════════════════════════════
# TRAINING API
# ═══════════════════════════════════════════════════════════════

@app.post("/api/projects/{project_id}/prepare")
async def prepare_training(project_id: str):
    """Prepare training dataset in ShareGPT format."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    # This would typically be done by the CLI agent
    # Here we just return info about what would be prepared

    return {
        "status": "ready_for_agent",
        "message": "Start the CLI agent to prepare and run training",
        "project_dir": str(project_dir)
    }


@app.get("/api/projects/{project_id}/generated")
async def get_generated_files(project_id: str):
    """Get list of generated code files."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    gen_dir = project_dir / "generated_code"
    files = []
    if gen_dir.exists():
        for f in gen_dir.glob("*"):
            if f.is_file():
                files.append({
                    "name": f.name,
                    "path": str(f),
                    "size": f.stat().st_size,
                    "content": f.read_text()[:5000] if f.suffix in ['.py', '.yaml', '.yml', '.json', '.md'] else None
                })

    return {"files": files}


# ═══════════════════════════════════════════════════════════════
# ERROR HANDLERS
# ═══════════════════════════════════════════════════════════════

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
