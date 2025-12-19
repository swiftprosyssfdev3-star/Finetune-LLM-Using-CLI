"""
Flexible Input Detection Service
Automatically detect and parse any input format

Supports:
- Image folders/archives (jpg, png, tiff, pdf, webp, bmp)
- Data files (xlsx, xls, csv, tsv, json, jsonl, parquet)
- Schema files (json with schema definition)
- Archives (zip, tar.gz with mixed content)
"""

from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, asdict
import json
import re
import zipfile
import tarfile
import tempfile
import shutil


@dataclass
class ImageSet:
    """Detected image set."""
    paths: List[str]
    count: int
    formats: List[str]
    sample_dimensions: Optional[Tuple[int, int]]
    total_size_mb: float


@dataclass
class DataFile:
    """Detected data file."""
    path: str
    format: str  # xlsx, csv, json, jsonl
    row_count: int
    column_count: int
    columns: List[str]
    sample_rows: List[Dict[str, Any]]
    detected_schema: Dict[str, str]


@dataclass
class OutputSchema:
    """Output schema definition."""
    schema: Dict[str, Any]
    source: str  # auto, file, manual
    sample_output: str


@dataclass
class ProjectInput:
    """Complete project input."""
    images: Optional[ImageSet]
    data: Optional[DataFile]
    schema: Optional[OutputSchema]
    warnings: List[str]
    suggestions: List[str]


class InputDetector:
    """
    Automatically detect and parse any input format.

    Supports:
    - Image folders/archives (jpg, png, tiff, pdf, webp, bmp)
    - Data files (xlsx, xls, csv, tsv, json, jsonl, parquet)
    - Schema files (json with schema definition)
    - Archives (zip, tar.gz with mixed content)
    """

    IMAGE_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.tiff', '.tif',
        '.bmp', '.webp', '.pdf', '.gif'
    }

    DATA_EXTENSIONS = {
        '.xlsx', '.xls', '.csv', '.tsv',
        '.json', '.jsonl', '.parquet'
    }

    def __init__(self, upload_dir: str = "./uploads"):
        """
        Initialize the input detector.

        Args:
            upload_dir: Directory for uploaded/extracted files
        """
        self.upload_dir = Path(upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def detect_inputs(self, paths: List[str]) -> ProjectInput:
        """
        Detect and parse all inputs.

        Args:
            paths: List of file/folder paths

        Returns:
            ProjectInput with detected images, data, schema
        """

        images = None
        data = None
        schema = None
        warnings = []
        suggestions = []

        all_images = []

        for path_str in paths:
            path = Path(path_str)

            if not path.exists():
                warnings.append(f"Path not found: {path}")
                continue

            if path.is_dir():
                # Scan folder
                result = await self._scan_folder(path)
                if result['images']:
                    all_images.extend(result['images'].paths)
                if result['data'] and data is None:
                    data = result['data']
                if result['schema'] and schema is None:
                    schema = result['schema']

            elif path.suffix.lower() in ('.zip', '.tar', '.gz', '.tgz'):
                # Extract and scan archive
                try:
                    extracted = await self._extract_archive(path)
                    result = await self._scan_folder(extracted)
                    if result['images']:
                        all_images.extend(result['images'].paths)
                    if result['data'] and data is None:
                        data = result['data']
                except Exception as e:
                    warnings.append(f"Failed to extract archive {path}: {str(e)}")

            elif path.suffix.lower() in self.IMAGE_EXTENSIONS:
                all_images.append(str(path))

            elif path.suffix.lower() in self.DATA_EXTENSIONS:
                try:
                    data = await self._parse_data_file(path)
                except Exception as e:
                    warnings.append(f"Failed to parse data file {path}: {str(e)}")

            elif path.suffix.lower() == '.json':
                try:
                    content = json.loads(path.read_text())
                    if self._is_schema_file(path, content):
                        schema = OutputSchema(
                            schema=content,
                            source='file',
                            sample_output=json.dumps(content, indent=2)[:500]
                        )
                    else:
                        data = await self._parse_data_file(path)
                except Exception as e:
                    warnings.append(f"Failed to parse JSON file {path}: {str(e)}")

        # Consolidate images
        if all_images:
            formats = list(set(Path(p).suffix.lower() for p in all_images))
            total_size = 0
            for p in all_images:
                try:
                    total_size += Path(p).stat().st_size
                except:
                    pass

            sample_dims = self._get_image_dimensions(Path(all_images[0])) if all_images else None

            images = ImageSet(
                paths=all_images,
                count=len(all_images),
                formats=formats,
                sample_dimensions=sample_dims,
                total_size_mb=round(total_size / (1024 * 1024), 2)
            )

        # Auto-generate schema from data
        if schema is None and data is not None:
            schema = self._generate_schema(data)
            suggestions.append(
                "Schema auto-generated from data columns. "
                "Review and adjust field types if needed."
            )

        # Validate matching
        if images and data:
            if images.count != data.row_count:
                ratio = data.row_count / images.count if images.count > 0 else 0
                if ratio > 1 and abs(ratio - round(ratio)) < 0.01:
                    suggestions.append(
                        f"Detected approximately {int(round(ratio))} records per image. "
                        f"The dataset will be prepared accordingly."
                    )
                elif ratio < 1:
                    suggestions.append(
                        f"More images ({images.count}) than data rows ({data.row_count}). "
                        f"Some images may not have ground truth data."
                    )
                else:
                    warnings.append(
                        f"Image count ({images.count}) differs from data rows ({data.row_count}). "
                        f"The agent will attempt to match them automatically."
                    )

        return ProjectInput(
            images=images,
            data=data,
            schema=schema,
            warnings=warnings,
            suggestions=suggestions
        )

    async def _scan_folder(self, folder: Path) -> Dict[str, Any]:
        """Scan a folder for images, data files, and schemas."""

        result = {'images': None, 'data': None, 'schema': None}
        image_paths = []
        data_files = []

        # Skip hidden files and directories
        for item in folder.rglob('*'):
            if item.is_file() and not any(p.startswith('.') for p in item.parts):
                ext = item.suffix.lower()
                if ext in self.IMAGE_EXTENSIONS:
                    image_paths.append(str(item))
                elif ext in self.DATA_EXTENSIONS:
                    data_files.append(item)

        # Create ImageSet if images found
        if image_paths:
            formats = list(set(Path(p).suffix.lower() for p in image_paths))
            total_size = sum(
                Path(p).stat().st_size
                for p in image_paths
                if Path(p).exists()
            )

            result['images'] = ImageSet(
                paths=sorted(image_paths),
                count=len(image_paths),
                formats=formats,
                sample_dimensions=self._get_image_dimensions(Path(image_paths[0])),
                total_size_mb=round(total_size / (1024 * 1024), 2)
            )

        # Parse first data file found
        if data_files:
            # Prefer xlsx/csv over json
            data_files.sort(key=lambda f: (
                0 if f.suffix in ['.xlsx', '.xls'] else
                1 if f.suffix == '.csv' else
                2
            ))
            try:
                result['data'] = await self._parse_data_file(data_files[0])
            except Exception:
                pass

        return result

    async def _parse_data_file(self, path: Path) -> DataFile:
        """Parse a data file and extract schema information."""

        ext = path.suffix.lower()
        df = None
        rows = []
        columns = []

        try:
            import pandas as pd

            if ext in ('.xlsx', '.xls'):
                df = pd.read_excel(path)
            elif ext == '.csv':
                df = pd.read_csv(path)
            elif ext == '.tsv':
                df = pd.read_csv(path, sep='\t')
            elif ext == '.jsonl':
                df = pd.read_json(path, lines=True)
            elif ext == '.json':
                content = json.loads(path.read_text())
                if isinstance(content, list):
                    df = pd.DataFrame(content)
                elif isinstance(content, dict) and 'data' in content:
                    df = pd.DataFrame(content['data'])
                elif isinstance(content, dict) and 'records' in content:
                    df = pd.DataFrame(content['records'])
                else:
                    df = pd.DataFrame([content])
            elif ext == '.parquet':
                df = pd.read_parquet(path)
            else:
                raise ValueError(f"Unsupported format: {ext}")

            columns = list(df.columns)
            rows = df.head(5).to_dict('records')

            # Clean NaN values
            for row in rows:
                for k, v in row.items():
                    if pd.isna(v):
                        row[k] = None

        except ImportError:
            # Fallback without pandas
            if ext == '.json':
                content = json.loads(path.read_text())
                if isinstance(content, list) and content:
                    columns = list(content[0].keys())
                    rows = content[:5]
                elif isinstance(content, dict):
                    columns = list(content.keys())
                    rows = [content]
            elif ext == '.jsonl':
                with open(path) as f:
                    for i, line in enumerate(f):
                        if i >= 5:
                            break
                        row = json.loads(line)
                        rows.append(row)
                        if not columns:
                            columns = list(row.keys())
            elif ext == '.csv':
                with open(path) as f:
                    lines = f.readlines()[:6]
                    if lines:
                        columns = lines[0].strip().split(',')
                        for line in lines[1:]:
                            values = line.strip().split(',')
                            rows.append(dict(zip(columns, values)))

        # Detect column types
        detected_schema = {}
        for col in columns:
            sample_values = [r.get(col) for r in rows if r.get(col) is not None]
            detected_schema[col] = self._detect_type(sample_values)

        row_count = len(df) if df is not None else len(rows)

        return DataFile(
            path=str(path),
            format=ext.replace('.', ''),
            row_count=row_count,
            column_count=len(columns),
            columns=columns,
            sample_rows=rows,
            detected_schema=detected_schema
        )

    def _detect_type(self, values: List[Any]) -> str:
        """Detect the type of a column based on sample values."""

        if not values:
            return 'string'

        # Check for dates
        date_patterns = [
            r'^\d{4}-\d{2}-\d{2}$',
            r'^\d{2}/\d{2}/\d{4}$',
            r'^\d{2}\.\d{2}\.\d{4}$',
            r'^\d{4}/\d{2}/\d{2}$',
        ]

        str_values = [str(v) for v in values if v is not None]

        for pattern in date_patterns:
            if all(re.match(pattern, v) for v in str_values if v):
                return 'date'

        # Check for numbers
        int_count = 0
        float_count = 0
        for v in values:
            if isinstance(v, int):
                int_count += 1
            elif isinstance(v, float):
                float_count += 1
            elif isinstance(v, str):
                try:
                    int(v)
                    int_count += 1
                except ValueError:
                    try:
                        float(v)
                        float_count += 1
                    except ValueError:
                        pass

        if int_count == len(values):
            return 'integer'
        if int_count + float_count == len(values):
            return 'number'

        return 'string'

    def _generate_schema(self, data: DataFile) -> OutputSchema:
        """Auto-generate JSON schema from data."""

        schema = {
            "type": "object",
            "properties": {
                "records": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {}
                    }
                }
            }
        }

        type_mapping = {
            'integer': 'integer',
            'number': 'number',
            'date': 'string',
            'string': 'string'
        }

        for col, dtype in data.detected_schema.items():
            json_type = type_mapping.get(dtype, 'string')

            prop = {"type": json_type}
            if dtype == 'date':
                prop["format"] = "date"
                prop["description"] = f"{col} (YYYY-MM-DD format)"

            schema["properties"]["records"]["items"]["properties"][col] = prop

        # Create sample output
        sample = {"records": data.sample_rows[:1]} if data.sample_rows else {"records": []}

        return OutputSchema(
            schema=schema,
            source='auto',
            sample_output=json.dumps(sample, indent=2, default=str)
        )

    def _is_schema_file(self, path: Path, content: Any) -> bool:
        """Check if a JSON file is a schema definition."""

        name = path.name.lower()

        # Check filename
        schema_keywords = ['schema', 'output', 'format', 'template', 'spec']
        if any(kw in name for kw in schema_keywords):
            return True

        # Check content structure
        if isinstance(content, dict):
            # JSON Schema indicators
            if any(k in content for k in ['$schema', 'type', 'properties', 'required', 'items']):
                return True

        return False

    def _get_image_dimensions(self, path: Path) -> Optional[Tuple[int, int]]:
        """Get image dimensions."""
        try:
            from PIL import Image
            with Image.open(path) as img:
                return img.size
        except ImportError:
            # Try without PIL
            try:
                import struct
                import imghdr

                with open(path, 'rb') as f:
                    head = f.read(24)

                if imghdr.what(path) == 'png':
                    w, h = struct.unpack('>ii', head[16:24])
                    return (w, h)
                elif imghdr.what(path) == 'jpeg':
                    f.seek(0)
                    f.read(2)
                    while True:
                        marker = f.read(2)
                        if marker[0] != 0xFF:
                            break
                        if marker[1] in (0xC0, 0xC2):
                            f.read(3)
                            h, w = struct.unpack('>HH', f.read(4))
                            return (w, h)
                        else:
                            length = struct.unpack('>H', f.read(2))[0]
                            f.read(length - 2)
            except:
                pass
        except:
            pass

        return None

    async def _extract_archive(self, path: Path) -> Path:
        """Extract archive to temp folder."""

        extract_dir = self.upload_dir / f"extracted_{path.stem}"
        extract_dir.mkdir(exist_ok=True)

        suffix = path.suffix.lower()

        if suffix == '.zip':
            with zipfile.ZipFile(path, 'r') as zf:
                zf.extractall(extract_dir)

        elif suffix in ('.tar', '.gz', '.tgz'):
            mode = 'r:*'
            if suffix == '.gz':
                mode = 'r:gz'
            elif suffix == '.tgz':
                mode = 'r:gz'

            with tarfile.open(path, mode) as tf:
                tf.extractall(extract_dir)

        return extract_dir


# Global instance
input_detector = InputDetector()
