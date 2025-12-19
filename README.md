# Bauhaus Fine-Tuning Studio

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                      ║
║   ██████╗  █████╗ ██╗   ██╗██╗  ██╗ █████╗ ██╗   ██╗███████╗                        ║
║   ██╔══██╗██╔══██╗██║   ██║██║  ██║██╔══██╗██║   ██║██╔════╝                        ║
║   ██████╔╝███████║██║   ██║███████║███████║██║   ██║███████╗                        ║
║   ██╔══██╗██╔══██║██║   ██║██╔══██║██╔══██║██║   ██║╚════██║                        ║
║   ██████╔╝██║  ██║╚██████╔╝██║  ██║██║  ██║╚██████╔╝███████║                        ║
║   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝                        ║
║                                                                                      ║
║                    AUTONOMOUS MULTI-AGENT VLM FINE-TUNING PLATFORM                   ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

An autonomous multi-agent platform for fine-tuning Vision Language Models (VLMs) with a beautiful Bauhaus-inspired interface.

## Features

- **HuggingFace Model Browser** - Search, preview, and download VLM models
- **Flexible Input System** - Upload images, XLSX, CSV, JSON - auto-detected
- **Auto-Adaptive Format Engine** - Smart training data generation
- **OpenAI-Compatible Skill Generator** - Use any API provider for agent configs
- **Multi-Agent Support** - Claude Code, Gemini CLI, Codex, Qwen, Aider
- **Real-Time Terminal** - Watch agents work with xterm.js WebSocket streaming
- **Bauhaus Design** - Clean, geometric, functional UI

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/bauhaus-finetune-studio
cd bauhaus-finetune-studio

# Copy environment file
cp .env.example .env
# Edit .env with your API keys

# Start with Docker
docker-compose up -d

# Or run manually:

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

### Open the App

Navigate to http://localhost:3000

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                        │
│                                                                             │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│   │   Dashboard   │  │  HuggingFace  │  │    Skill      │  │  Terminal   │ │
│   │               │  │    Browser    │  │   Generator   │  │  (xterm.js) │ │
│   └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP / WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (FastAPI)                              │
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │ HuggingFace │  │   Input     │  │   Skill     │  │  Terminal   │       │
│   │   Browser   │  │  Detector   │  │  Generator  │  │  Manager    │       │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
          │ CLI AGENTS  │  │   MODELS    │  │  PROJECTS   │
          │ Claude/     │  │   /cache    │  │  /projects  │
          │ Gemini/etc  │  │             │  │             │
          └─────────────┘  └─────────────┘  └─────────────┘
```

## Project Structure

```
bauhaus-finetune-studio/
├── backend/
│   ├── app/
│   │   ├── api/              # API routes
│   │   ├── services/         # Business logic
│   │   │   ├── huggingface_browser.py
│   │   │   ├── input_detector.py
│   │   │   ├── skill_generator.py
│   │   │   └── terminal_manager.py
│   │   └── main.py           # FastAPI app
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── bauhaus/      # Design system
│   │   │   └── terminal/     # xterm.js
│   │   ├── pages/            # Page components
│   │   ├── lib/              # Utilities & API
│   │   └── styles/           # CSS
│   ├── package.json
│   └── Dockerfile
├── models/                   # Downloaded models
├── projects/                 # User projects
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create new project |
| GET | `/api/projects/{id}` | Get project details |
| DELETE | `/api/projects/{id}` | Delete project |
| POST | `/api/projects/{id}/upload` | Upload files |

### HuggingFace

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hf/search` | Search models |
| GET | `/api/hf/models/{id}` | Get model details |
| POST | `/api/hf/download` | Download model |
| GET | `/api/hf/cached` | List cached models |

### Skill Generator

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills/presets` | Get provider presets |
| POST | `/api/skills/configure` | Configure API |
| POST | `/api/skills/test` | Test connection |
| POST | `/api/skills/generate` | Generate skill files |

### Terminal

| WebSocket | Endpoint | Description |
|-----------|----------|-------------|
| WS | `/ws/terminal/{project_id}/{agent}` | Terminal session |

## Supported CLI Agents

| Agent | Provider | Config File | Context |
|-------|----------|-------------|---------|
| Claude Code | Anthropic | CLAUDE.md | 200K |
| Gemini CLI | Google | GEMINI.md | 1M |
| OpenAI Codex | OpenAI | AGENTS.md | 192K |
| Qwen Code | Alibaba | QWEN.md | 256K-1M |
| Aider | Open Source | .aider.conf.yml | Varies |

## Skill Generator Providers

The skill generator can use any OpenAI-compatible API:

- **OpenAI** - GPT-4o, GPT-4-turbo
- **Anthropic** (via OpenRouter) - Claude 3
- **DeepSeek** - DeepSeek Chat/Coder
- **Groq** - Llama 3.3, Mixtral
- **OpenRouter** - Multiple providers
- **Together AI** - Llama, Mixtral
- **Fireworks** - Fast inference
- **Ollama** - Local models
- **DashScope** - Qwen models
- **Mistral** - Mistral Large, Codestral

## Environment Variables

```bash
# HuggingFace
HF_TOKEN=hf_...

# For Skill Generation
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

## Bauhaus Design System

The UI follows Bauhaus design principles with Kandinsky's color-form theory:

- **Red (■)** - Actions, primary buttons
- **Blue (●)** - Information, links
- **Yellow (▲)** - Warnings, highlights

### Colors

```css
--bauhaus-red: #E53935;
--bauhaus-blue: #1E88E5;
--bauhaus-yellow: #FDD835;
--bauhaus-black: #212121;
```

### Components

- `Button` - Bauhaus-styled buttons (red, blue, yellow, outline)
- `Card` - Cards with colored left borders
- `Input` - Clean input fields with focus states
- `Badge` - Status badges
- `ProgressBar` - Progress indicators
- `BauhausTerminal` - xterm.js terminal with theme

## Workflow

1. **Create Project** - Name and describe your fine-tuning task
2. **Upload Data** - Drop images and ground truth (XLSX, CSV, JSON)
3. **Auto-Detection** - System analyzes and generates schema
4. **Select Model** - Browse and download from HuggingFace
5. **Configure Skills** - Set up API for skill file generation
6. **Start Training** - Select an agent and watch it work in real-time

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines first.

---

*"Form follows function, and AI follows your data."*
