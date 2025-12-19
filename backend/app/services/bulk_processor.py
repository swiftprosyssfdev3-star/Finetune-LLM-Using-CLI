"""
Bulk Image & Truth Data Processor Service

Handles bulk folder uploads containing:
- Images (jpg, png, tiff, pdf, webp, etc.)
- Truth data (xlsx, json, docx, markdown)

Features:
- Automatic folder structure detection
- Image-to-truth-data matching
- CLI agent auto-review integration
- Progress tracking with callbacks
"""

from pathlib import Path
from typing import Dict, Any, List, Optional, Callable, Tuple
from dataclasses import dataclass, asdict, field
import json
import shutil
import asyncio
import logging
import os
from datetime import datetime

from .input_detector import input_detector, ProjectInput, ImageSet, DataFile

logger = logging.getLogger(__name__)


@dataclass
class ProcessingProgress:
    """Tracks bulk processing progress."""
    total_files: int = 0
    processed_files: int = 0
    images_found: int = 0
    truth_data_files: int = 0
    matched_pairs: int = 0
    unmatched_images: int = 0
    status: str = "pending"
    current_step: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class MatchedPair:
    """Represents an image matched with its truth data."""
    image_path: str
    image_name: str
    truth_data: Dict[str, Any]
    confidence: float  # 0-1 score for match confidence


@dataclass
class BulkProcessingResult:
    """Complete result of bulk processing."""
    project_id: str
    images: Optional[ImageSet]
    truth_data: Optional[DataFile]
    matched_pairs: List[MatchedPair]
    unmatched_images: List[str]
    review_prompt: str
    suggestions: List[str]
    warnings: List[str]
    processing_time_seconds: float


class BulkProcessor:
    """
    Processes bulk uploads of images and truth data.

    Handles:
    - Folder structure detection (flat, nested, categorized)
    - Image-truth data matching strategies
    - CLI agent review prompt generation
    """

    def __init__(self, projects_dir: str = "./projects"):
        """Initialize the bulk processor."""
        self.projects_dir = Path(projects_dir)
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    async def process_folder(
        self,
        folder_path: Path,
        project_id: str,
        progress_callback: Optional[Callable[[ProcessingProgress], None]] = None
    ) -> BulkProcessingResult:
        """
        Process an entire folder of images with truth data.

        Args:
            folder_path: Path to the folder containing images and truth data
            project_id: ID of the project to process for
            progress_callback: Optional callback for progress updates

        Returns:
            BulkProcessingResult with matched pairs and analysis
        """
        start_time = datetime.now()
        progress = ProcessingProgress(status="analyzing")

        def update_progress(step: str, **kwargs):
            progress.current_step = step
            for key, value in kwargs.items():
                setattr(progress, key, value)
            if progress_callback:
                progress_callback(progress)

        update_progress("Scanning folder structure")

        # Get project directory
        project_dir = self.projects_dir / project_id
        if not project_dir.exists():
            raise ValueError(f"Project not found: {project_id}")

        # Detect folder structure
        structure = await self._analyze_folder_structure(folder_path)
        update_progress("Detecting files", total_files=structure['total_files'])

        # Use input detector to find all inputs
        result = await input_detector.detect_inputs([str(folder_path)])

        update_progress(
            "Processing inputs",
            images_found=result.images.count if result.images else 0,
            truth_data_files=1 if result.data else 0
        )

        # Copy images to project directory
        images_dir = project_dir / "images"
        images_dir.mkdir(exist_ok=True)

        if result.images:
            progress.status = "copying_images"
            update_progress("Copying images to project")

            for i, img_path in enumerate(result.images.paths[:5000]):  # Safety limit
                src = Path(img_path)
                if src.exists():
                    dst = images_dir / src.name
                    if not dst.exists():
                        shutil.copy2(src, dst)
                progress.processed_files = i + 1
                if progress_callback and i % 100 == 0:
                    progress_callback(progress)

        # Match images to truth data
        matched_pairs = []
        unmatched_images = []

        if result.images and result.data:
            update_progress("Matching images to truth data")
            matched_pairs, unmatched_images = await self._match_images_to_data(
                result.images, result.data, structure
            )
            progress.matched_pairs = len(matched_pairs)
            progress.unmatched_images = len(unmatched_images)
        elif result.images:
            unmatched_images = result.images.paths

        # Generate review prompt for CLI agent
        review_prompt = self._generate_review_prompt(
            result, matched_pairs, unmatched_images, structure
        )

        # Collect suggestions
        suggestions = result.suggestions.copy() if result.suggestions else []

        if matched_pairs and len(matched_pairs) != (result.images.count if result.images else 0):
            suggestions.append(
                f"Only {len(matched_pairs)} of {result.images.count if result.images else 0} images "
                f"were matched to truth data. Review unmatched images."
            )

        if structure.get('nested_depth', 0) > 2:
            suggestions.append(
                f"Deep folder structure detected ({structure['nested_depth']} levels). "
                f"Consider flattening for easier processing."
            )

        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()

        progress.status = "completed"
        update_progress("Processing complete")

        return BulkProcessingResult(
            project_id=project_id,
            images=result.images,
            truth_data=result.data,
            matched_pairs=matched_pairs,
            unmatched_images=unmatched_images,
            review_prompt=review_prompt,
            suggestions=suggestions,
            warnings=result.warnings or [],
            processing_time_seconds=processing_time
        )

    async def _analyze_folder_structure(self, folder: Path) -> Dict[str, Any]:
        """Analyze the folder structure to determine processing strategy."""
        structure = {
            'total_files': 0,
            'total_folders': 0,
            'nested_depth': 0,
            'has_images_subfolder': False,
            'has_data_subfolder': False,
            'categories': [],
            'pattern': 'flat'
        }

        # Count files and analyze structure
        max_depth = 0
        for item in folder.rglob('*'):
            relative = item.relative_to(folder)
            depth = len(relative.parts)
            max_depth = max(max_depth, depth)

            if item.is_file():
                structure['total_files'] += 1
            elif item.is_dir():
                structure['total_folders'] += 1
                name_lower = item.name.lower()
                if name_lower in ('images', 'imgs', 'photos', 'pictures'):
                    structure['has_images_subfolder'] = True
                elif name_lower in ('data', 'labels', 'truth', 'annotations', 'metadata'):
                    structure['has_data_subfolder'] = True
                elif depth == 1 and not name_lower.startswith('.'):
                    structure['categories'].append(item.name)

        structure['nested_depth'] = max_depth

        # Determine pattern
        if structure['has_images_subfolder'] and structure['has_data_subfolder']:
            structure['pattern'] = 'separated'
        elif structure['categories'] and len(structure['categories']) > 1:
            structure['pattern'] = 'categorized'
        elif max_depth > 2:
            structure['pattern'] = 'nested'
        else:
            structure['pattern'] = 'flat'

        return structure

    async def _match_images_to_data(
        self,
        images: ImageSet,
        data: DataFile,
        structure: Dict[str, Any]
    ) -> Tuple[List[MatchedPair], List[str]]:
        """Match images to their corresponding truth data rows."""
        matched = []
        unmatched = list(images.paths)

        # Build lookup maps from data
        data_by_filename = {}
        data_by_index = {}

        # Common field names for filename matching
        filename_fields = ['filename', 'file', 'image', 'image_name', 'name', 'path', 'image_path']

        for i, row in enumerate(data.sample_rows):
            # Index-based matching
            data_by_index[i] = row

            # Filename-based matching
            for field in filename_fields:
                if field in row and row[field]:
                    filename = str(row[field])
                    # Normalize: strip path, handle extensions
                    clean_name = Path(filename).stem.lower()
                    data_by_filename[clean_name] = row
                    data_by_filename[filename.lower()] = row

        # Try to match each image
        new_unmatched = []
        for img_path in unmatched:
            img_name = Path(img_path).name
            img_stem = Path(img_path).stem.lower()

            matched_row = None
            confidence = 0.0

            # Try exact filename match (with extension)
            if img_name.lower() in data_by_filename:
                matched_row = data_by_filename[img_name.lower()]
                confidence = 1.0
            # Try stem match (without extension)
            elif img_stem in data_by_filename:
                matched_row = data_by_filename[img_stem]
                confidence = 0.95
            # Try partial match
            else:
                for key, row in data_by_filename.items():
                    if img_stem in key or key in img_stem:
                        matched_row = row
                        confidence = 0.7
                        break

            if matched_row:
                matched.append(MatchedPair(
                    image_path=img_path,
                    image_name=img_name,
                    truth_data=matched_row,
                    confidence=confidence
                ))
            else:
                new_unmatched.append(img_path)

        # If no filename-based matches, try index-based matching
        if not matched and len(new_unmatched) == len(images.paths):
            # Sort images by name for consistent ordering
            sorted_images = sorted(images.paths)
            if len(sorted_images) == data.row_count:
                for i, img_path in enumerate(sorted_images):
                    if i in data_by_index:
                        matched.append(MatchedPair(
                            image_path=img_path,
                            image_name=Path(img_path).name,
                            truth_data=data_by_index[i],
                            confidence=0.5  # Lower confidence for index-based
                        ))
                new_unmatched = []

        return matched, new_unmatched

    def _generate_review_prompt(
        self,
        detection: ProjectInput,
        matched_pairs: List[MatchedPair],
        unmatched_images: List[str],
        structure: Dict[str, Any]
    ) -> str:
        """Generate a review prompt for the CLI agent."""
        lines = [
            "# Bulk Upload Analysis Report",
            "",
            "## Summary",
        ]

        if detection.images:
            lines.extend([
                f"- **Images Found:** {detection.images.count}",
                f"- **Image Formats:** {', '.join(detection.images.formats)}",
                f"- **Total Size:** {detection.images.total_size_mb:.1f} MB",
            ])

        if detection.data:
            lines.extend([
                f"- **Truth Data File:** {Path(detection.data.path).name}",
                f"- **Data Format:** {detection.data.format.upper()}",
                f"- **Data Rows:** {detection.data.row_count}",
                f"- **Columns:** {', '.join(detection.data.columns)}",
            ])

        lines.extend([
            "",
            "## Matching Results",
            f"- **Matched Pairs:** {len(matched_pairs)}",
            f"- **Unmatched Images:** {len(unmatched_images)}",
        ])

        if matched_pairs:
            avg_confidence = sum(p.confidence for p in matched_pairs) / len(matched_pairs)
            lines.append(f"- **Average Match Confidence:** {avg_confidence:.0%}")

        lines.extend([
            "",
            "## Folder Structure",
            f"- **Pattern:** {structure['pattern'].title()}",
            f"- **Total Files:** {structure['total_files']}",
            f"- **Nesting Depth:** {structure['nested_depth']}",
        ])

        if structure['categories']:
            lines.append(f"- **Categories:** {', '.join(structure['categories'][:10])}")

        # Recommendations
        lines.extend([
            "",
            "## Recommendations",
        ])

        if detection.images and detection.data:
            if len(matched_pairs) == detection.images.count:
                lines.append("- All images matched to truth data. Ready for dataset preparation.")
            elif len(matched_pairs) > 0:
                lines.append(f"- Review {len(unmatched_images)} unmatched images for missing data.")
                lines.append("- Consider adding filename column to truth data for better matching.")
            else:
                lines.append("- No automatic matches found. Please ensure truth data contains image filenames.")
                lines.append("- Add a 'filename' or 'image' column to your truth data file.")
        elif detection.images:
            lines.append("- No truth data file detected. Please upload XLSX, JSON, DOCX, or Markdown file.")
        elif detection.data:
            lines.append("- No images detected. Please include image files in your upload.")

        if detection.warnings:
            lines.extend([
                "",
                "## Warnings",
            ])
            for warning in detection.warnings:
                lines.append(f"- {warning}")

        if detection.suggestions:
            lines.extend([
                "",
                "## Suggestions",
            ])
            for suggestion in detection.suggestions:
                lines.append(f"- {suggestion}")

        # Add sample data preview
        if detection.data and detection.data.sample_rows:
            lines.extend([
                "",
                "## Sample Truth Data",
                "```json",
                json.dumps(detection.data.sample_rows[:3], indent=2, default=str),
                "```",
            ])

        return '\n'.join(lines)

    async def generate_agent_instructions(
        self,
        result: BulkProcessingResult,
        agent_type: str = "claude"
    ) -> str:
        """
        Generate instructions for the CLI agent to review the bulk upload.

        Args:
            result: The bulk processing result
            agent_type: Type of CLI agent (claude, gemini, codex, etc.)

        Returns:
            Instructions string for the agent
        """
        instructions = f"""
You are reviewing a bulk upload for a VLM fine-tuning project.

{result.review_prompt}

## Your Tasks

1. **Validate Data Quality**
   - Check if the truth data structure is appropriate for VLM training
   - Verify that all required fields are present
   - Identify any data quality issues

2. **Review Matching**
   - Examine the matched pairs for accuracy
   - Suggest strategies for unmatched images
   - Recommend any data transformations needed

3. **Prepare Dataset**
   - Convert the matched pairs to ShareGPT/Alpaca format
   - Create training/validation splits
   - Generate the final dataset files

4. **Report Findings**
   - Summarize any issues found
   - Provide recommendations for improvement
   - Confirm readiness for training

Project ID: {result.project_id}
Images: {result.images.count if result.images else 0}
Truth Data Rows: {result.truth_data.row_count if result.truth_data else 0}
Matched Pairs: {len(result.matched_pairs)}
Processing Time: {result.processing_time_seconds:.1f}s
"""
        return instructions

    async def save_processing_result(
        self,
        result: BulkProcessingResult,
        project_dir: Path
    ) -> str:
        """Save the processing result to the project directory."""
        output = {
            'project_id': result.project_id,
            'images_count': result.images.count if result.images else 0,
            'truth_data_rows': result.truth_data.row_count if result.truth_data else 0,
            'matched_pairs_count': len(result.matched_pairs),
            'unmatched_images_count': len(result.unmatched_images),
            'matched_pairs': [
                {
                    'image_path': mp.image_path,
                    'image_name': mp.image_name,
                    'truth_data': mp.truth_data,
                    'confidence': mp.confidence
                }
                for mp in result.matched_pairs
            ],
            'unmatched_images': result.unmatched_images[:100],  # Limit for file size
            'suggestions': result.suggestions,
            'warnings': result.warnings,
            'processing_time_seconds': result.processing_time_seconds,
            'processed_at': datetime.now().isoformat()
        }

        output_path = project_dir / 'bulk_processing_result.json'
        output_path.write_text(json.dumps(output, indent=2, default=str))

        # Also save the review prompt as markdown
        review_path = project_dir / 'bulk_upload_review.md'
        review_path.write_text(result.review_prompt)

        return str(output_path)


# Global instance
bulk_processor = BulkProcessor()
