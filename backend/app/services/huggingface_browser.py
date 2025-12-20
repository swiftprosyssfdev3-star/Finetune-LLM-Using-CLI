"""
HuggingFace Model Browser Service
Search, filter, preview, and download models from HuggingFace Hub

Features:
- Full-text search with filters
- VLM-specific filtering
- Download with progress tracking
- Fine-tuning compatibility detection
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple, Callable
from dataclasses import dataclass, asdict, field

from huggingface_hub import HfApi, snapshot_download, hf_hub_download

logger = logging.getLogger(__name__)


@dataclass
class ModelSearchResult:
    """Model search result."""
    model_id: str
    author: str
    model_name: str
    downloads: int
    likes: int
    tags: List[str]
    pipeline_tag: Optional[str]
    last_modified: str
    library_name: Optional[str]
    license: Optional[str]
    size_gb: Optional[float] = None
    vram_min_gb: Optional[int] = None
    vram_recommended_gb: Optional[int] = None
    vram_qlora_gb: Optional[int] = None
    is_vlm: bool = False


@dataclass
class ModelDetails:
    """Detailed model information."""
    model_id: str
    author: str
    description: str
    downloads: int
    likes: int
    tags: List[str]
    files: List[Dict[str, Any]]
    total_size_bytes: int
    total_size_gb: float
    supports_lora: bool
    supports_qlora: bool
    vram_min_gb: int
    vram_recommended_gb: int
    vram_qlora_gb: int
    recommended_frameworks: List[str]
    pipeline_tag: Optional[str] = None
    library_name: Optional[str] = None
    license: Optional[str] = None
    model_card: Optional[str] = None


class HuggingFaceBrowser:
    """
    Browse, search, and download models from HuggingFace Hub.

    Features:
    - Full-text search with filters
    - VLM-specific filtering
    - Download with progress tracking
    - Fine-tuning compatibility detection
    """

    # Vision-Language Model tags
    VLM_TAGS = {
        'vision', 'vlm', 'vision-language', 'image-to-text',
        'ocr', 'document-understanding', 'multimodal',
        'image-text-to-text', 'visual-question-answering',
        'document-question-answering', 'video-text-to-text'
    }

    # Known VLM model patterns
    VLM_PATTERNS = [
        'qwen-vl', 'qwen2-vl', 'qwen2.5-vl', 'florence',
        'paligemma', 'llava', 'internvl', 'cogvlm', 'got-ocr',
        'idefics', 'fuyu', 'moondream', 'phi-3-vision', 'phi-3.5-vision',
        'molmo', 'pixtral', 'llama-vision', 'minicpm-v', 'glm-4v',
        'deepseek-vl', 'yi-vl', 'internlm-xcomposer', 'emu',
        'blip', 'git-', 'kosmos', 'flamingo'
    ]

    # VRAM requirements by model size (params in billions)
    # Format: (min_params, max_params): (min_vram, recommended_vram, qlora_vram)
    VRAM_BY_SIZE = {
        (0, 1): (4, 6, 3),       # < 1B
        (1, 3): (8, 12, 6),      # 1-3B
        (3, 8): (16, 24, 8),     # 3-8B
        (8, 15): (24, 32, 12),   # 8-15B
        (15, 40): (48, 80, 24),  # 15-40B
        (40, 100): (80, 160, 48), # 40-100B
    }

    # Recommended fine-tuning frameworks
    FINE_TUNING_FRAMEWORKS = [
        'LLaMA-Factory',
        'Unsloth',
        'PEFT/LoRA',
        'ms-swift',
        'Axolotl',
    ]

    def __init__(
        self,
        token: Optional[str] = None,
        cache_dir: str = "./models/cache"
    ):
        """
        Initialize the HuggingFace browser.

        Args:
            token: HuggingFace API token (for private models)
            cache_dir: Directory to cache downloaded models
        """
        self.token = token or os.environ.get('HF_TOKEN')
        self.api = HfApi(token=self.token)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    async def search_models(
        self,
        query: str,
        task: Optional[str] = None,
        library: Optional[str] = None,
        max_size_gb: Optional[float] = None,
        vlm_only: bool = True,
        limit: int = 20,
        offset: int = 0,
        sort: str = "downloads",
    ) -> Dict[str, Any]:
        """
        Search for models on HuggingFace Hub.

        Args:
            query: Search query string
            task: Filter by task (image-to-text, etc.)
            library: Filter by library (transformers, etc.)
            max_size_gb: Maximum model size in GB
            vlm_only: Only return vision-language models
            limit: Results per page
            offset: Pagination offset
            sort: Sort field (downloads, likes, lastModified)

        Returns:
            Dict with 'models', 'total', 'page', 'pages'
        """

        # Build filter
        filter_kwargs = {}
        if task:
            filter_kwargs['task'] = task
        if library:
            filter_kwargs['library'] = library

        task_filter = filter_kwargs.get('task')
        library_filter = filter_kwargs.get('library')

        # Run search in executor to avoid blocking
        loop = asyncio.get_event_loop()
        models = await loop.run_in_executor(
            None,
            lambda: list(self.api.list_models(
                search=query,
                task=task_filter,
                library=library_filter,
                sort=sort,
                direction=-1,
                limit=limit + offset + 200,  # Get extra for filtering
                full=True,
            ))
        )

        # Filter VLM only
        if vlm_only:
            models = [m for m in models if self._is_vlm(m)]

        # Filter by size
        if max_size_gb:
            filtered_models = []
            for m in models:
                size = self._estimate_size(m)
                if size is None or size <= max_size_gb:
                    filtered_models.append(m)
            models = filtered_models

        total = len(models)
        models = models[offset:offset + limit]

        # Convert to results
        results = []
        for m in models:
            vram = self._estimate_vram(m)
            size = self._estimate_size(m)

            results.append(ModelSearchResult(
                model_id=m.id,
                author=m.id.split('/')[0] if '/' in m.id else 'unknown',
                model_name=m.id.split('/')[-1],
                downloads=m.downloads or 0,
                likes=m.likes or 0,
                tags=m.tags or [],
                pipeline_tag=m.pipeline_tag,
                last_modified=str(m.lastModified) if m.lastModified else '',
                library_name=m.library_name,
                license=self._extract_license(m.tags),
                size_gb=size,
                vram_min_gb=vram[0],
                vram_recommended_gb=vram[1],
                vram_qlora_gb=vram[2],
                is_vlm=self._is_vlm(m),
            ))

        return {
            'models': [asdict(r) for r in results],
            'total': total,
            'page': offset // limit + 1 if limit > 0 else 1,
            'pages': (total + limit - 1) // limit if limit > 0 else 1,
        }

    async def get_model_details(self, model_id: str) -> ModelDetails:
        """
        Get detailed information about a model.

        Args:
            model_id: Full model ID (e.g., 'Qwen/Qwen2.5-VL-2B-Instruct')

        Returns:
            ModelDetails object with full information
        """

        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(
            None,
            lambda: self.api.model_info(model_id, files_metadata=True)
        )

        # Get files
        files = []
        total_size = 0
        if info.siblings:
            for f in info.siblings:
                size = f.size or 0
                files.append({
                    'filename': f.rfilename,
                    'size': size,
                    'size_human': self._format_size(size) if size else 'Unknown',
                })
                total_size += size

        vram = self._estimate_vram(info)

        # Try to get model card
        model_card = None
        try:
            card_info = await loop.run_in_executor(
                None,
                lambda: self.api.model_info(model_id)
            )
            if hasattr(card_info, 'card_data') and card_info.card_data:
                model_card = str(card_info.card_data)[:2000]
        except Exception as e:
            logger.debug(f"Failed to get model card for {model_id}: {e}")

        return ModelDetails(
            model_id=info.id,
            author=info.id.split('/')[0] if '/' in info.id else 'unknown',
            description=model_card or '',
            downloads=info.downloads or 0,
            likes=info.likes or 0,
            tags=info.tags or [],
            files=files,
            total_size_bytes=total_size,
            total_size_gb=round(total_size / (1024**3), 2),
            supports_lora=True,  # Most transformer models support LoRA
            supports_qlora='transformers' in (info.library_name or '').lower(),
            vram_min_gb=vram[0],
            vram_recommended_gb=vram[1],
            vram_qlora_gb=vram[2],
            recommended_frameworks=self.FINE_TUNING_FRAMEWORKS[:4],
            pipeline_tag=info.pipeline_tag,
            library_name=info.library_name,
            license=self._extract_license(info.tags),
        )

    async def download_model(
        self,
        model_id: str,
        local_dir: Optional[str] = None,
        progress_callback: Optional[Callable[[float], None]] = None,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None,
    ) -> str:
        """
        Download a model from HuggingFace Hub.

        Args:
            model_id: Full model ID
            local_dir: Local directory to save model
            progress_callback: Callback for download progress
            include_patterns: Only download files matching these patterns
            exclude_patterns: Skip files matching these patterns

        Returns:
            Path to downloaded model directory
        """

        if local_dir is None:
            local_dir = str(self.cache_dir / model_id.replace('/', '--'))

        # Default exclude patterns (skip large unnecessary files)
        if exclude_patterns is None:
            exclude_patterns = [
                "*.msgpack",  # Skip msgpack format
                "*.h5",       # Skip H5 format if safetensors available
                "original/*", # Skip original checkpoint directories
            ]

        loop = asyncio.get_event_loop()
        local_path = await loop.run_in_executor(
            None,
            lambda: snapshot_download(
                model_id,
                local_dir=local_dir,
                token=self.token,
                local_dir_use_symlinks=False,
                ignore_patterns=exclude_patterns,
                allow_patterns=include_patterns,
            )
        )

        return local_path

    async def download_file(
        self,
        model_id: str,
        filename: str,
        local_dir: Optional[str] = None,
    ) -> str:
        """Download a single file from a model."""

        if local_dir is None:
            local_dir = str(self.cache_dir / model_id.replace('/', '--'))

        loop = asyncio.get_event_loop()
        local_path = await loop.run_in_executor(
            None,
            lambda: hf_hub_download(
                model_id,
                filename=filename,
                local_dir=local_dir,
                token=self.token,
            )
        )

        return local_path

    def _is_vlm(self, model_info) -> bool:
        """Check if model is a vision-language model."""

        # Check tags
        tags = set(t.lower() for t in (model_info.tags or []))
        if tags & self.VLM_TAGS:
            return True

        # Check pipeline tag
        if model_info.pipeline_tag in [
            'image-to-text', 'visual-question-answering',
            'document-question-answering', 'image-text-to-text',
            'video-text-to-text'
        ]:
            return True

        # Check model name patterns
        model_name = model_info.id.lower()
        return any(p in model_name for p in self.VLM_PATTERNS)

    def _estimate_size(self, model_info) -> Optional[float]:
        """Estimate model size in GB from name or metadata."""

        # Try to extract from model name
        name = model_info.id.lower()

        # Common patterns: 2B, 7B, 13B, 70B, 2.7B, etc.
        patterns = [
            r'(\d+\.?\d*)b(?:-|_|$|\s)',  # 2B, 7B, 2.5B
            r'(\d+\.?\d*)billion',
        ]

        for pattern in patterns:
            match = re.search(pattern, name)
            if match:
                params_b = float(match.group(1))
                # Approximate size: ~2 bytes per param for fp16/bf16
                return round(params_b * 2, 1)

        return None

    def _estimate_vram(self, model_info) -> Tuple[int, int, int]:
        """
        Estimate VRAM requirements.

        Returns:
            Tuple of (min_vram, recommended_vram, qlora_vram) in GB
        """

        size_gb = self._estimate_size(model_info)

        if size_gb is None:
            return (8, 12, 6)  # Default for unknown models

        params_b = size_gb / 2  # Approximate params from size

        for (min_p, max_p), vram in self.VRAM_BY_SIZE.items():
            if min_p <= params_b < max_p:
                return vram

        # Very large model
        return (80, 160, 48)

    def _extract_license(self, tags: List[str]) -> Optional[str]:
        """Extract license from tags."""
        for tag in (tags or []):
            if tag.startswith('license:'):
                return tag.replace('license:', '')
        return None

    def _format_size(self, size_bytes: int) -> str:
        """Format file size for display."""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} PB"

    def get_recommended_models(self) -> List[Dict[str, Any]]:
        """Get a list of recommended VLM models for fine-tuning."""
        return [
            {
                "model_id": "Qwen/Qwen2.5-VL-2B-Instruct",
                "name": "Qwen2.5-VL-2B",
                "description": "Excellent for document understanding and OCR",
                "size_gb": 4.5,
                "vram_min": 8,
            },
            {
                "model_id": "Qwen/Qwen2.5-VL-7B-Instruct",
                "name": "Qwen2.5-VL-7B",
                "description": "Higher quality, more VRAM required",
                "size_gb": 15,
                "vram_min": 16,
            },
            {
                "model_id": "microsoft/Florence-2-large",
                "name": "Florence-2-large",
                "description": "Microsoft's vision foundation model",
                "size_gb": 1.5,
                "vram_min": 6,
            },
            {
                "model_id": "google/paligemma-3b-pt-224",
                "name": "PaliGemma-3B",
                "description": "Google's vision-language model",
                "size_gb": 6,
                "vram_min": 10,
            },
            {
                "model_id": "llava-hf/llava-1.5-7b-hf",
                "name": "LLaVA-1.5-7B",
                "description": "Popular open VLM",
                "size_gb": 14,
                "vram_min": 16,
            },
            {
                "model_id": "stepfun-ai/GOT-OCR2_0",
                "name": "GOT-OCR2.0",
                "description": "Specialized for OCR tasks",
                "size_gb": 3,
                "vram_min": 8,
            },
        ]


# Global instance
hf_browser = HuggingFaceBrowser()
