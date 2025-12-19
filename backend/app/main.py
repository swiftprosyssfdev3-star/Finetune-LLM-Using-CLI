"""
Bauhaus Fine-Tuning Studio - Main FastAPI Application

Autonomous multi-agent platform for VLM fine-tuning with:
- HuggingFace model browser
- Flexible input detection (images, XLSX, JSON)
- OpenAI-compatible skill generation
- Real-time terminal streaming
"""

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
from datetime import datetime

from app.services.huggingface_browser import hf_browser
from app.services.input_detector import input_detector
from app.services.skill_generator import skill_generator, SkillGeneratorConfig, PROVIDER_PRESETS
from app.services.terminal_manager import terminal_manager
from app.services.bulk_processor import bulk_processor

# Create FastAPI app
app = FastAPI(
    title="Bauhaus Fine-Tuning Studio",
    description="Autonomous multi-agent VLM fine-tuning platform",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
PROJECTS_DIR = Path("./projects")
MODELS_DIR = Path("./models/cache")
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)


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
async def download_model(
    model_id: str,
    local_dir: Optional[str] = None,
    project_id: Optional[str] = None,
):
    """Download a model from HuggingFace."""
    try:
        if project_id and not local_dir:
            local_dir = str(PROJECTS_DIR / project_id / "model")

        path = await hf_browser.download_model(model_id, local_dir)
        return {"status": "completed", "path": path, "model_id": model_id}
    except Exception as e:
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
async def create_project(name: str, description: Optional[str] = None):
    """Create a new project."""
    project_id = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}"
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
        "name": name,
        "description": description or "",
        "created": datetime.utcnow().isoformat(),
        "status": "created",
        "model_id": None,
        "method": "lora",
    }
    (project_dir / "project.json").write_text(json.dumps(meta, indent=2))

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
async def update_project(project_id: str, updates: Dict[str, Any]):
    """Update project metadata."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    meta_file = project_dir / "project.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    meta.update(updates)
    meta["updated"] = datetime.utcnow().isoformat()
    meta_file.write_text(json.dumps(meta, indent=2))

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
# BULK UPLOAD API
# ═══════════════════════════════════════════════════════════════

@app.post("/api/projects/{project_id}/bulk-upload")
async def bulk_upload_files(project_id: str, files: List[UploadFile] = File(...)):
    """
    Bulk upload images and truth data files.

    Supports:
    - Image files (jpg, png, tiff, pdf, webp, bmp, gif)
    - Truth data (xlsx, json, docx, markdown, csv)
    - Archives (zip, tar.gz) containing images and data

    The system automatically:
    - Detects file types
    - Matches images to truth data
    - Generates review prompts for CLI agent
    """
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    upload_dir = project_dir / "bulk_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded files
    paths = []
    for file in files:
        file_path = upload_dir / file.filename
        content = await file.read()
        file_path.write_bytes(content)
        paths.append(str(file_path))

    # Process the bulk upload
    try:
        result = await bulk_processor.process_folder(
            folder_path=upload_dir,
            project_id=project_id
        )

        # Save results
        await bulk_processor.save_processing_result(result, project_dir)

        # Update project metadata
        meta_file = project_dir / "project.json"
        meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
        meta["bulk_upload"] = {
            "images_count": result.images.count if result.images else 0,
            "truth_data_rows": result.truth_data.row_count if result.truth_data else 0,
            "matched_pairs": len(result.matched_pairs),
            "processed_at": datetime.utcnow().isoformat()
        }
        meta_file.write_text(json.dumps(meta, indent=2))

        return {
            "status": "processed",
            "uploaded_files": len(paths),
            "images": result.images.__dict__ if result.images else None,
            "truth_data": result.truth_data.__dict__ if result.truth_data else None,
            "matched_pairs": len(result.matched_pairs),
            "unmatched_images": len(result.unmatched_images),
            "review_prompt": result.review_prompt,
            "suggestions": result.suggestions,
            "warnings": result.warnings,
            "processing_time": result.processing_time_seconds
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk processing failed: {str(e)}")


@app.post("/api/projects/{project_id}/bulk-upload/folder")
async def bulk_upload_folder(
    project_id: str,
    folder_path: str,
):
    """
    Process an existing folder path on the server.

    This endpoint is useful when files are already on the server
    (e.g., mounted volumes, network shares).
    """
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    source_folder = Path(folder_path)
    if not source_folder.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: {folder_path}")

    if not source_folder.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    try:
        result = await bulk_processor.process_folder(
            folder_path=source_folder,
            project_id=project_id
        )

        # Save results
        await bulk_processor.save_processing_result(result, project_dir)

        return {
            "status": "processed",
            "source_folder": str(source_folder),
            "images": result.images.__dict__ if result.images else None,
            "truth_data": result.truth_data.__dict__ if result.truth_data else None,
            "matched_pairs": len(result.matched_pairs),
            "unmatched_images": len(result.unmatched_images),
            "review_prompt": result.review_prompt,
            "suggestions": result.suggestions,
            "warnings": result.warnings,
            "processing_time": result.processing_time_seconds
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk processing failed: {str(e)}")


@app.get("/api/projects/{project_id}/bulk-upload/result")
async def get_bulk_upload_result(project_id: str):
    """Get the result of the most recent bulk upload processing."""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    result_file = project_dir / "bulk_processing_result.json"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="No bulk upload result found")

    return json.loads(result_file.read_text())


@app.post("/api/projects/{project_id}/bulk-upload/agent-review")
async def generate_agent_review(project_id: str, agent_type: str = "claude"):
    """
    Generate CLI agent instructions for reviewing the bulk upload.

    Returns formatted instructions for the specified agent type
    to review and process the uploaded data.
    """
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    result_file = project_dir / "bulk_processing_result.json"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="No bulk upload result found. Run bulk-upload first.")

    result_data = json.loads(result_file.read_text())

    # Build a simplified result object for instruction generation
    from app.services.bulk_processor import BulkProcessingResult, MatchedPair
    from app.services.input_detector import ImageSet, DataFile

    # Reconstruct objects for instruction generation
    images = None
    if result_data.get('images_count'):
        images = ImageSet(
            paths=[],
            count=result_data['images_count'],
            formats=[],
            sample_dimensions=None,
            total_size_mb=0
        )

    truth_data = None
    if result_data.get('truth_data_rows'):
        truth_data = DataFile(
            path="",
            format="",
            row_count=result_data['truth_data_rows'],
            column_count=0,
            columns=[],
            sample_rows=[],
            detected_schema={}
        )

    matched_pairs = [
        MatchedPair(
            image_path=mp['image_path'],
            image_name=mp['image_name'],
            truth_data=mp['truth_data'],
            confidence=mp['confidence']
        )
        for mp in result_data.get('matched_pairs', [])
    ]

    # Read review prompt from saved file
    review_file = project_dir / "bulk_upload_review.md"
    review_prompt = review_file.read_text() if review_file.exists() else ""

    result = BulkProcessingResult(
        project_id=project_id,
        images=images,
        truth_data=truth_data,
        matched_pairs=matched_pairs,
        unmatched_images=result_data.get('unmatched_images', []),
        review_prompt=review_prompt,
        suggestions=result_data.get('suggestions', []),
        warnings=result_data.get('warnings', []),
        processing_time_seconds=result_data.get('processing_time_seconds', 0)
    )

    instructions = await bulk_processor.generate_agent_instructions(result, agent_type)

    # Save instructions to file
    instructions_file = project_dir / f"agent_instructions_{agent_type}.md"
    instructions_file.write_text(instructions)

    return {
        "agent_type": agent_type,
        "instructions": instructions,
        "saved_to": str(instructions_file)
    }


# ═══════════════════════════════════════════════════════════════
# SKILL GENERATOR API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/skills/presets")
async def get_skill_presets():
    """Get available provider presets for skill generation."""
    return {"presets": PROVIDER_PRESETS}


@app.post("/api/skills/configure")
async def configure_skill_generator(config: Dict[str, Any]):
    """Configure the skill generator API."""
    try:
        skill_generator.configure(SkillGeneratorConfig(
            base_url=config['base_url'],
            api_key=config['api_key'],
            model=config['model'],
            temperature=config.get('temperature', 0.7),
            max_tokens=config.get('max_tokens', 4096),
            extra_headers=config.get('extra_headers'),
        ))
        return {"status": "configured", "model": config['model']}
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
async def generate_skills(
    project_info: Dict[str, Any],
    agent_types: Optional[List[str]] = None
):
    """Generate skill files for agents."""
    try:
        skills = await skill_generator.generate_all_skills(project_info, agent_types)
        return {
            "skills": [
                {"filename": s.filename, "content": s.content, "agent": s.agent_type}
                for s in skills
            ]
        }
    except Exception as e:
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
            if skill.filename.startswith("."):
                file_path = project_dir / skill.filename
            else:
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

    await terminal_manager.handle_websocket(websocket, project_id, agent)


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
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__}
    )


# ═══════════════════════════════════════════════════════════════
# STARTUP
# ═══════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    """Initialize services on startup."""
    print("Bauhaus Fine-Tuning Studio starting...")
    print(f"Projects directory: {PROJECTS_DIR.absolute()}")
    print(f"Models cache: {MODELS_DIR.absolute()}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
