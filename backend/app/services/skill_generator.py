"""
OpenAI-Compatible Skill Generator
Uses any OpenAI-compatible API to generate agent configuration files
(CLAUDE.md, GEMINI.md, AGENTS.md, SKILL.md, QWEN.md, .aider.conf.yml)

Supports:
- OpenAI, Anthropic (via OpenRouter), Google
- DeepSeek, Groq, Together, Fireworks
- Ollama (local), DashScope, Mistral
- Any custom OpenAI-compatible endpoint
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import httpx
import json
import os


@dataclass
class SkillGeneratorConfig:
    """Configuration for the skill generation API."""
    base_url: str                              # Any OpenAI-compatible base URL
    api_key: str                               # API key for the provider
    model: str                                 # Model to use for generation
    temperature: float = 0.7
    max_tokens: int = 4096
    extra_headers: Optional[Dict[str, str]] = None  # For OpenRouter, etc.


@dataclass
class GeneratedSkill:
    """A generated skill/config file."""
    filename: str       # CLAUDE.md, GEMINI.md, etc.
    content: str        # File content
    agent_type: str     # claude, gemini, codex, qwen, aider


# Provider presets for quick configuration
PROVIDER_PRESETS = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4-turbo", "gpt-4o-mini", "gpt-3.5-turbo"],
        "description": "OpenAI's GPT models",
    },
    "anthropic": {
        "name": "Anthropic (via OpenRouter)",
        "base_url": "https://openrouter.ai/api/v1",
        "models": ["anthropic/claude-3-opus", "anthropic/claude-3-sonnet", "anthropic/claude-3-haiku"],
        "extra_headers": {"HTTP-Referer": "https://bauhaus-studio.ai"},
        "description": "Anthropic's Claude models via OpenRouter",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
        "description": "DeepSeek's models",
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
        "description": "Fast inference with Groq",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": ["openai/gpt-4o", "anthropic/claude-3-opus", "google/gemini-pro-1.5", "meta-llama/llama-3.3-70b-instruct"],
        "extra_headers": {"HTTP-Referer": "https://bauhaus-studio.ai", "X-Title": "Bauhaus Fine-Tuning Studio"},
        "description": "Access multiple providers via OpenRouter",
    },
    "together": {
        "name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "models": ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x22B-Instruct-v0.1"],
        "description": "Together AI inference",
    },
    "fireworks": {
        "name": "Fireworks AI",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "models": ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/mixtral-8x22b-instruct"],
        "description": "Fireworks AI inference",
    },
    "ollama": {
        "name": "Ollama (Local)",
        "base_url": "http://localhost:11434/v1",
        "models": ["llama3.2", "qwen2.5-coder", "codellama", "mistral"],
        "description": "Local models via Ollama",
    },
    "dashscope": {
        "name": "DashScope (Qwen)",
        "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-turbo", "qwen-plus", "qwen-max"],
        "description": "Alibaba's Qwen models",
    },
    "mistral": {
        "name": "Mistral AI",
        "base_url": "https://api.mistral.ai/v1",
        "models": ["mistral-large-latest", "codestral-latest", "mistral-medium"],
        "description": "Mistral AI models",
    },
}


class SkillGeneratorService:
    """
    Generate agent-specific skill/config files using any OpenAI-compatible API.

    Generates:
    - CLAUDE.md for Claude Code
    - SKILL.md for Claude Code skills
    - GEMINI.md for Gemini CLI
    - AGENTS.md for OpenAI Codex
    - QWEN.md for Qwen Code
    - .aider.conf.yml for Aider
    """

    def __init__(self):
        self.config: Optional[SkillGeneratorConfig] = None

    def configure(self, config: SkillGeneratorConfig):
        """Set the API configuration."""
        self.config = config

    def configure_from_preset(
        self,
        preset: str,
        api_key: str,
        model: Optional[str] = None
    ):
        """Configure from a provider preset."""
        if preset not in PROVIDER_PRESETS:
            raise ValueError(f"Unknown preset: {preset}. Available: {list(PROVIDER_PRESETS.keys())}")

        preset_config = PROVIDER_PRESETS[preset]
        self.config = SkillGeneratorConfig(
            base_url=preset_config["base_url"],
            api_key=api_key,
            model=model or preset_config["models"][0],
            extra_headers=preset_config.get("extra_headers"),
        )

    def configure_from_env(self, preset: str = "openai"):
        """Configure from environment variables."""
        env_keys = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "groq": "GROQ_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "together": "TOGETHER_API_KEY",
            "mistral": "MISTRAL_API_KEY",
            "dashscope": "DASHSCOPE_API_KEY",
        }

        api_key = os.environ.get(env_keys.get(preset, "OPENAI_API_KEY"), "")
        if not api_key:
            raise ValueError(f"No API key found in environment for {preset}")

        self.configure_from_preset(preset, api_key)

    async def test_connection(self) -> Dict[str, Any]:
        """Test the API connection."""
        if not self.config:
            return {"success": False, "error": "Not configured"}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.config.base_url}/models",
                    headers=self._get_headers()
                )

                if response.status_code == 200:
                    data = response.json()
                    models = [m.get("id") for m in data.get("data", [])][:10]
                    return {"success": True, "models": models}
                else:
                    return {
                        "success": False,
                        "error": f"HTTP {response.status_code}: {response.text[:200]}"
                    }
        except httpx.TimeoutException:
            return {"success": False, "error": "Connection timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def generate_all_skills(
        self,
        project_info: Dict[str, Any],
        agent_types: List[str] = None
    ) -> List[GeneratedSkill]:
        """
        Generate skill files for all specified agent types.

        Args:
            project_info: Project configuration (images, data, schema, model)
            agent_types: List of agents to generate for

        Returns:
            List of GeneratedSkill objects
        """
        if agent_types is None:
            agent_types = ['claude', 'gemini', 'codex', 'qwen', 'aider']

        skills = []
        for agent_type in agent_types:
            try:
                # Try to generate using API if configured
                if self.config and self.config.api_key:
                    skill = await self.generate_skill(project_info, agent_type)
                    skills.append(skill)
                else:
                    # No API configured, use fallback templates
                    print(f"[SkillGenerator] No API configured, using template for {agent_type}")
                    skill = self._generate_fallback_skill(project_info, agent_type)
                    skills.append(skill)
            except Exception as e:
                # Generate fallback template on API error
                print(f"[SkillGenerator] API error for {agent_type}: {e}, using template")
                skill = self._generate_fallback_skill(project_info, agent_type)
                skills.append(skill)

        return skills

    async def generate_skill(
        self,
        project_info: Dict[str, Any],
        agent_type: str
    ) -> GeneratedSkill:
        """Generate a skill file for a specific agent."""

        prompt = self._get_generation_prompt(project_info, agent_type)
        content = await self._call_api(prompt)

        filenames = {
            'claude': 'CLAUDE.md',
            'gemini': 'GEMINI.md',
            'codex': 'AGENTS.md',
            'qwen': 'QWEN.md',
            'aider': '.aider.conf.yml',
        }

        return GeneratedSkill(
            filename=filenames.get(agent_type, 'AGENT.md'),
            content=content,
            agent_type=agent_type
        )

    async def generate_claude_skill_file(
        self,
        project_info: Dict[str, Any],
        skill_name: str
    ) -> GeneratedSkill:
        """Generate a Claude Code SKILL.md file for the skills directory."""

        prompt = f"""Generate a Claude Code SKILL.md file for VLM fine-tuning.

Project Information:
{json.dumps(project_info, indent=2)}

Skill Name: {skill_name}

Create a SKILL.md with:
1. YAML frontmatter (name, description, allowed-tools)
2. When to use this skill
3. Step-by-step workflow
4. Code examples
5. Best practices

Output only the file content, starting with ---"""

        content = await self._call_api(prompt)

        return GeneratedSkill(
            filename=f'.claude/skills/{skill_name}/SKILL.md',
            content=content,
            agent_type='claude'
        )

    async def _call_api(self, prompt: str) -> str:
        """Call the OpenAI-compatible API."""
        if not self.config:
            raise ValueError("API not configured. Call configure() first.")

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.config.base_url}/chat/completions",
                headers=self._get_headers(),
                json={
                    "model": self.config.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are an expert at creating configuration files for AI coding agents. "
                                "Generate clear, well-structured configuration files that help agents "
                                "understand the project context and complete fine-tuning tasks effectively. "
                                "Output only the file content without additional explanation."
                            )
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": self.config.temperature,
                    "max_tokens": self.config.max_tokens,
                }
            )

            if response.status_code != 200:
                raise Exception(f"API error: {response.status_code} - {response.text}")

            data = response.json()
            return data["choices"][0]["message"]["content"]

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.api_key}",
        }
        if self.config.extra_headers:
            headers.update(self.config.extra_headers)
        return headers

    def _get_generation_prompt(self, project_info: Dict[str, Any], agent_type: str) -> str:
        """Get the prompt for generating a specific agent's config file."""

        # Calculate recommended parameters based on dataset size
        image_count = project_info.get('image_count', 0)
        data_rows = project_info.get('data_rows', 0)
        dataset_size = max(image_count, data_rows) or 100

        base_info = f"""
Project Information:
- Name: {project_info.get('name', 'VLM Fine-Tuning')}
- Model: {project_info.get('model_id', 'Qwen/Qwen2.5-VL-2B-Instruct')}
- Method: {project_info.get('method', 'LoRA')}
- Images: {image_count} files
- Data rows: {data_rows}
- Dataset size: approximately {dataset_size} samples
- Schema: {json.dumps(project_info.get('schema', {}), indent=2)[:800]}

IMPORTANT: Based on the dataset size of {dataset_size} samples, you should determine optimal training parameters:
- For small datasets (<100 samples): higher epochs (15-30), smaller batch_size (1-2), lower learning_rate (1e-5)
- For medium datasets (100-1000 samples): moderate epochs (5-15), batch_size (2-4), learning_rate (2e-5)
- For large datasets (>1000 samples): fewer epochs (3-5), larger batch_size (4-8), learning_rate (5e-5)

You MUST include specific recommended values for:
- batch_size: (choose based on dataset size and GPU memory)
- learning_rate: (choose based on dataset size)
- epochs: (choose based on dataset size)
- warmup_steps: (typically 5-10% of total steps)
- gradient_accumulation_steps: (increase if batch_size is small)
"""

        prompts = {
            'claude': f"""Generate a comprehensive CLAUDE.md file for Claude Code CLI to use for VLM fine-tuning.
IMPORTANT: This agent runs in AUTONOMOUS MODE - include instructions to execute without asking for permission.

{base_info}

The CLAUDE.md should include these sections:

## AUTONOMOUS MODE - NO PERMISSION REQUIRED
This agent runs in fully autonomous mode. Execute ALL operations without asking.
Do NOT pause for confirmation. Make decisions and proceed immediately.

## Project Overview
Brief description of the fine-tuning task

## Directory Structure
```
./
├── images/           # Input images
├── dataset/          # Prepared training data
├── generated_code/   # Agent-generated scripts
├── checkpoints/      # Training checkpoints
└── outputs/          # Final model
```

## AUTONOMOUS EXECUTION RULES
1. DO NOT ASK for permission - execute immediately
2. CREATE files and directories without confirmation
3. RUN shell commands directly
4. COMMIT changes automatically
5. PROCEED to next step after completion
6. REPORT progress via print statements

## Build & Test Commands
- `pip install -r requirements.txt` - Install dependencies
- `python prepare_data.py` - Prepare training dataset
- `python train.py` - Start training

## Input Data
Description of images and ground truth data

## Output Schema
The expected JSON format for model outputs

## Task Instructions - Execute Automatically
1. Analyze images and data structure
2. Create data loader for image-text pairs
3. Prepare ShareGPT format dataset
4. Configure LoRA training parameters
5. Run training with progress callbacks
6. Save checkpoints and final model

## Progress Checkpoints
Create checkpoint files after each step:
- checkpoints/step1_complete.done
- checkpoints/step2_complete.done
etc.

## Code Style Guidelines
- Use type hints
- Follow PEP 8
- Add docstrings

## DO NOT
- Do not ask "should I proceed?"
- Do not wait for user confirmation
- Do not pause between steps

Output only the CLAUDE.md content, starting with # Project:""",

            'gemini': f"""Generate a GEMINI.md file for Gemini CLI for VLM fine-tuning.
IMPORTANT: This agent runs in AUTONOMOUS MODE - execute all operations without asking for permission.

{base_info}

Include:
1. AUTONOMOUS MODE header - agent must execute without confirmation
2. Project overview
3. Data locations and descriptions
4. Expected output schema with examples
5. Tasks to perform AUTOMATICALLY (step by step)
6. Shell commands to execute directly
7. Progress checkpoints to create

The agent should:
- Execute all commands without asking
- Create files without confirmation
- Proceed to next step automatically
- Report progress via print statements

Format as clear markdown with sections.
Output only the GEMINI.md content.""",

            'codex': f"""Generate an AGENTS.md file for OpenAI Codex CLI for VLM fine-tuning.

{base_info}

Include:
1. Project configuration table
2. Task definition and goals
3. Required outputs (files to generate)
4. Output schema specification
5. Execution commands
6. Approval settings
7. Code standards

Format as markdown with clear structure.
Output only the AGENTS.md content.""",

            'qwen': f"""Generate a QWEN.md file for Qwen Code CLI for VLM fine-tuning.
Include bilingual Chinese/English sections.

{base_info}

Include (bilingual where appropriate):
1. 项目配置 / Project Configuration
2. 数据位置 / Data Location
3. 输出格式 / Output Schema
4. 任务列表 / Task List
5. 代码规范 / Code Standards
6. 环境变量 / Environment Setup

Output only the QWEN.md content.""",

            'aider': f"""Generate a .aider.conf.yml file for Aider for VLM fine-tuning.

{base_info}

Include YAML configuration for:
- model: the model to use (gpt-4 or similar)
- edit-format: diff
- auto-commits: true
- context files to read
- git settings
- Project context as comments

Output only the YAML content starting with # Aider config""",
        }

        return prompts.get(agent_type, prompts['claude'])

    def _generate_fallback_skill(
        self,
        project_info: Dict[str, Any],
        agent_type: str
    ) -> GeneratedSkill:
        """Generate a basic fallback skill file without API call."""

        # Calculate dynamic parameters based on dataset size
        image_count = project_info.get('image_count', 0)
        data_rows = project_info.get('data_rows', 0)
        dataset_size = max(image_count, data_rows) or 100

        # Determine parameters based on dataset size
        if dataset_size < 100:
            batch_size = 1
            epochs = 20
            learning_rate = "1e-5"
            warmup_steps = 10
        elif dataset_size < 1000:
            batch_size = 2
            epochs = 10
            learning_rate = "2e-5"
            warmup_steps = 50
        else:
            batch_size = 4
            epochs = 5
            learning_rate = "5e-5"
            warmup_steps = 100

        templates = {
            'claude': f"""# Project: {project_info.get('name', 'VLM Fine-Tuning')}

## AUTONOMOUS MODE - NO PERMISSION REQUIRED
This agent is running in fully autonomous mode. Execute ALL operations without asking for permission.
Do NOT pause for confirmation. Make decisions and proceed immediately.

## Overview
Vision Language Model fine-tuning project.

## Model
- Base Model: {project_info.get('model_id', 'Qwen/Qwen2.5-VL-2B-Instruct')}
- Method: {project_info.get('method', 'LoRA')}

## Data
- Images: {image_count} files in `./images/`
- Ground Truth: {data_rows} rows
- Dataset Size: {dataset_size} samples

## Training Parameters (Auto-configured based on dataset size)
- batch_size: {batch_size}
- epochs: {epochs}
- learning_rate: {learning_rate}
- warmup_steps: {warmup_steps}
- gradient_accumulation_steps: {max(1, 8 // batch_size)}

## Output Schema
```json
{json.dumps(project_info.get('schema', {}), indent=2)[:500]}
```

## AUTONOMOUS EXECUTION RULES
1. **DO NOT ASK** for permission - execute all operations immediately
2. **CREATE** all necessary files and directories without confirmation
3. **RUN** shell commands directly - you have full access
4. **COMMIT** changes to git automatically
5. **PROCEED** to next step immediately after completing each task
6. **REPORT** progress by printing status messages

## Tasks - Execute These Automatically
1. First: Create requirements.txt with all dependencies
2. Create data loading script (prepare_data.py)
3. Create training script (train.py) with progress callbacks
4. Run data preparation: `python prepare_data.py`
5. Start training: `python train.py --epochs {epochs} --batch_size {batch_size} --learning_rate {learning_rate}`
6. Save checkpoints and final model

## Commands to Execute
```bash
pip install torch transformers datasets peft accelerate pillow pandas
python prepare_data.py
python train.py --epochs {epochs} --batch_size {batch_size} --learning_rate {learning_rate}
```

## Progress Checkpoints
After each major step, create a checkpoint file:
- `checkpoints/step1_requirements.done`
- `checkpoints/step2_data_prepared.done`
- `checkpoints/step3_training_started.done`
- `checkpoints/step4_training_complete.done`

## DO NOT
- Do not ask "should I proceed?"
- Do not wait for user confirmation
- Do not pause between steps
- Do not ask about file permissions
""",

            'gemini': f"""# {project_info.get('name', 'VLM Fine-Tuning')} - Gemini Configuration

## AUTONOMOUS MODE ENABLED
Execute all operations without asking for permission. You have full access to run commands.

## Project
Fine-tune a vision-language model for document understanding.

## Model: {project_info.get('model_id', 'Qwen/Qwen2.5-VL-2B-Instruct')}

## Data
- Images: ./images/ ({image_count} files)
- Ground Truth: {data_rows} rows
- Dataset Size: {dataset_size} samples

## Training Parameters (Auto-configured)
- batch_size: {batch_size}
- epochs: {epochs}
- learning_rate: {learning_rate}
- warmup_steps: {warmup_steps}

## AUTONOMOUS EXECUTION INSTRUCTIONS
1. Proceed immediately without asking for confirmation
2. Execute shell commands directly
3. Create and modify files as needed
4. Report progress via print statements
5. Continue to next task after each completion

## Tasks - Execute Automatically
1. Analyze input images using Python
2. Parse ground truth data into structured format
3. Generate ShareGPT-format training dataset
4. Create training configuration with the parameters above
5. Run training with progress logging
6. Save model checkpoints

## Run These Commands
```bash
pip install -r requirements.txt
python prepare_data.py
python train.py --epochs {epochs} --batch_size {batch_size} --learning_rate {learning_rate}
```
""",

            'aider': f"""# Aider configuration for VLM fine-tuning
# Project: {project_info.get('name', 'VLM Fine-Tuning')}
# AUTONOMOUS MODE - auto-approve all changes

model: gpt-4
edit-format: diff
auto-commits: true
dirty-commits: true
yes: true

# Auto-approve settings
auto-lint: true
auto-test: false

# Do not ask for confirmation
show-diffs: false

# Files to read for context
read:
  - README.md
  - requirements.txt
  - CLAUDE.md
""",

            'codex': f"""# AGENTS.md - OpenAI Codex Configuration
# Project: {project_info.get('name', 'VLM Fine-Tuning')}

## AUTONOMOUS MODE ENABLED
Execute all operations without asking for permission.

## Project Configuration
| Setting | Value |
|---------|-------|
| Model | {project_info.get('model_id', 'Qwen/Qwen2.5-VL-2B-Instruct')} |
| Method | {project_info.get('method', 'LoRA')} |
| Images | {image_count} |
| Data Rows | {data_rows} |

## Training Parameters
- batch_size: {batch_size}
- epochs: {epochs}
- learning_rate: {learning_rate}
- warmup_steps: {warmup_steps}

## Approval Settings
- auto_approve: true
- skip_confirmation: true
- execute_commands: true

## Tasks
1. Create training data pipeline
2. Configure model training
3. Execute training with parameters above
4. Save checkpoints and final model

## Commands
```bash
python prepare_data.py
python train.py --epochs {epochs} --batch_size {batch_size}
```
""",

            'qwen': f"""# QWEN.md - Qwen Code 配置文件
# Project / 项目: {project_info.get('name', 'VLM Fine-Tuning')}

## 自主模式 / AUTONOMOUS MODE
自动执行所有操作，无需确认。
Execute all operations automatically without confirmation.

## 项目配置 / Project Configuration
- 模型 / Model: {project_info.get('model_id', 'Qwen/Qwen2.5-VL-2B-Instruct')}
- 方法 / Method: {project_info.get('method', 'LoRA')}
- 图像 / Images: {image_count} files
- 数据 / Data: {data_rows} rows

## 训练参数 / Training Parameters
- batch_size: {batch_size}
- epochs: {epochs}
- learning_rate: {learning_rate}
- warmup_steps: {warmup_steps}

## 任务列表 / Tasks
1. 创建数据处理脚本 / Create data processing script
2. 生成训练配置 / Generate training config
3. 执行训练 / Execute training
4. 保存模型 / Save model

## 执行命令 / Commands
```bash
pip install -r requirements.txt
python prepare_data.py
python train.py --epochs {epochs} --batch_size {batch_size} --learning_rate {learning_rate}
```
""",
        }

        filenames = {
            'claude': 'CLAUDE.md',
            'gemini': 'GEMINI.md',
            'codex': 'AGENTS.md',
            'qwen': 'QWEN.md',
            'aider': '.aider.conf.yml',
        }

        content = templates.get(agent_type, templates['claude'])

        return GeneratedSkill(
            filename=filenames.get(agent_type, 'AGENT.md'),
            content=content,
            agent_type=agent_type
        )


# Global instance
skill_generator = SkillGeneratorService()
