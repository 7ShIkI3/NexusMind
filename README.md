# NexusMind

**NexusMind** is an advanced AI-powered knowledge management platform that runs on **Linux**, **Windows**, and **mobile** (via browser/PWA). It combines a rich notes editor, interactive knowledge graph, RAG (Retrieval-Augmented Generation), multi-provider AI chat, automated routines, and an extension system — all in one beautiful interface.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **Multi-AI Chat** | Chat with Ollama, OpenAI/GPT-4, Anthropic Claude, Google Gemini, Abacus.AI |
| 📝 **Rich Notes Editor** | Tiptap-powered editor with markdown, tasks, code blocks, highlights |
| 🕸️ **Knowledge Graph** | Interactive graph visualization (Cytoscape.js), node/edge management, entity extraction |
| 🔍 **Advanced RAG** | ChromaDB vector store, semantic search, file ingestion (TXT, MD, PDF) |
| ⚡ **AI Routines** | Scheduled AI tasks: auto-tag, organize notes, auto-link, custom routines |
| 🧩 **Extension System** | Plugin architecture — extend NexusMind with custom Python extensions |
| 🖥️ **Desktop App** | Electron wrapper for Linux & Windows with native menus |
| 🐳 **Docker Ready** | Full Docker Compose setup for server deployment |

---

## 🏗️ Architecture

```
NexusMind/
├── backend/           # Python FastAPI backend
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── core/             # Core engines
│   │   │   ├── config.py         # Settings
│   │   │   ├── database.py       # SQLAlchemy + SQLite
│   │   │   ├── rag_engine.py     # ChromaDB RAG
│   │   │   ├── graph_engine.py   # NetworkX graph
│   │   │   ├── ai_manager.py     # AI provider unified interface
│   │   │   ├── extension_manager.py
│   │   │   └── routine_engine.py # APScheduler routines
│   │   ├── api/              # REST API routes
│   │   └── models/           # SQLAlchemy models
│   └── extensions/           # Extension plugins
├── frontend/          # React + TypeScript + Vite
│   └── src/
│       ├── pages/            # Chat, Notes, Graph, RAG, Routines, Extensions, Settings
│       ├── components/       # Reusable UI components
│       ├── store/            # Zustand state management
│       └── utils/            # API client
├── desktop/           # Electron desktop wrapper
│   └── electron/
│       ├── main.js           # Electron main process
│       └── preload.js        # Context bridge
└── docker-compose.yml
```

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/7ShIkI3/NexusMind.git
cd NexusMind
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000)

---

### Option 2: Manual Setup

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start the backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API docs are available at [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### Option 3: Desktop App

```bash
cd desktop
npm install

# Run in dev mode (needs backend + frontend running)
npm run dev

# Build for your platform
npm run build:linux   # Linux AppImage + deb
npm run build:win     # Windows installer
```

---

## ⚙️ Configuration

Create a `.env` file in the `backend/` directory:

```env
# AI Providers
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
ABACUS_API_KEY=...

# RAG
EMBEDDING_MODEL=all-MiniLM-L6-v2
RAG_CHUNK_SIZE=512
RAG_TOP_K=5

# Database
DATABASE_URL=sqlite:///./data/nexusmind.db
```

---

## 🤖 Supported AI Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **Ollama** | Any local model | No API key needed, runs locally |
| **OpenAI** | GPT-4o, GPT-4-turbo, etc. | Also works with any OpenAI-compatible API |
| **Anthropic** | Claude 3.5 Sonnet, Opus, Haiku | |
| **Google Gemini** | Gemini 1.5 Pro, Flash | |
| **Abacus.AI** | Multiple models | Enterprise AI platform |

---

## 🧩 Creating Extensions

Extensions live in the top-level `extensions/installed/` directory (mounted into the backend container at `/app/extensions/installed`). Create a folder for your extension named by its slug, for example `extensions/installed/my-ext/`.

1. Add a `manifest.json`:

```json
{
  "name": "My Extension",
  "slug": "my-ext",
  "version": "1.0.0",
  "description": "Does something cool",
  "author": "You",
  "entry_point": "main.py"
}
```

2. Create `main.py`:

```python
import logging
logger = logging.getLogger("nexusmind.my_ext")

def setup(hooks):
    def on_note_created(payload):
        logger.info("note.created: %s", payload.get("title"))
    hooks.register("note.created", on_note_created)

def teardown():
    logger.info("my-ext teardown")
```

Notes:
- Use `hooks.register(event, callback)` to subscribe to events. Common events: `note.created`, `note.updated`, `note.deleted`.
- Prefer logging via the `logging` module instead of printing to stdout. The backend captures logs to help debugging.
- The backend loads extensions from `extensions/installed/` on startup. To make changes visible in a running container, restart the backend service.

See `extensions/installed/insights-extension/` for a working example.

Additional admin endpoints (backend):
- `POST /api/v1/admin/cleanup_note/{note_id}` — run a targeted cleanup (RAG, knowledge, graph) for a given note id.
- `POST /api/v1/admin/sweep_stale_knowledge` — remove knowledge items whose `source_key` references a non-existent note.


---

## 📡 API Reference

## Production Deploy

For production we provide a `docker-compose.prod.yml` and a helper script `deploy_prod.sh` to build/tag images. Typical workflow:

1. Build and tag images for your registry:

```bash
./deploy_prod.sh my.registry.example.com/myorg
```

2. Push images:

```bash
docker push my.registry.example.com/myorg/nexusmind-backend:latest
# push the other images similarly
```

3. On your production host, pull images and run the prod compose:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Notes:
- The prod compose mounts `./extensions` read-only so your hosted extensions folder is used.
- Replace filesystem-mounted SQLite with a managed DB for scale; update `DATABASE_URL` in the compose file.


## 📡 API Reference

The backend exposes a full REST API. Interactive docs: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/chat/` | Send a chat message (supports streaming) |
| `GET /api/v1/notes/` | List notes |
| `POST /api/v1/notes/` | Create note |
| `GET /api/v1/graph/` | Get full knowledge graph |
| `POST /api/v1/rag/query` | Semantic search |
| `POST /api/v1/rag/ingest` | Ingest text into RAG |
| `POST /api/v1/routines/{id}/run` | Run a routine now |
| `GET /api/v1/ai/providers` | List AI providers |

---

## 🛠️ Tech Stack

**Backend:** Python 3.11, FastAPI, SQLAlchemy, ChromaDB, NetworkX, APScheduler, sentence-transformers

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Tiptap, Cytoscape.js, Zustand

**Desktop:** Electron 31

**Deployment:** Docker, Docker Compose, Nginx

---

## ✅ Complete Review Plan Applied

This repository has been reviewed end-to-end (backend, frontend, and deployment) and a prioritized improvement plan has been applied.

### Phase 1: Critical Security & Reliability (Applied)

- Hardened configuration defaults in `backend/app/core/config.py`:
    - `DEBUG=false` by default
    - `SECRET_KEY` validation (must be set and length >= 32)
    - New security limits in settings (`MAX_FILE_SIZE`, `MAX_REQUEST_SIZE`, `MAX_TOOL_RESULT_SIZE`, `RATE_LIMIT_PER_MINUTE`)
- Secured CORS handling in `backend/app/main.py`:
    - CORS origins now parsed from env (`CORS_ORIGINS`)
    - Restricted methods/headers to expected values
- Added HTTP security middleware in `backend/app/main.py`:
    - `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`
    - `Strict-Transport-Security` in non-debug mode
- Added request-size protection in `backend/app/main.py`:
    - Rejects oversized payloads with HTTP `413`
- Replaced silent exception swallowing in `backend/app/core/routine_engine.py` with explicit logging.

### Phase 2: Input Validation & Abuse Protection (Applied)

- Added centralized tool argument validators in `backend/app/core/tool_validators.py`.
- Integrated validation into chat tool execution in `backend/app/api/chat.py`.
- Added safe file creation rules:
    - strict filename validation
    - path traversal protection
    - max content size enforcement
- Added per-IP in-memory rate limiting middleware in `backend/app/main.py`.

### Phase 3: Performance & API Consistency (Applied)

- Added graph caching in `backend/app/core/graph_engine.py` to avoid rebuilding graph on every request.
- Added cache invalidation on graph mutations (add/update/delete node/edge).
- Standardized pagination responses:
    - `GET /api/v1/notes/` now returns `items`, `total`, `skip`, `limit`, `has_more`
    - `GET /api/v1/chat/conversations` now returns `items`, `total`, `skip`, `limit`, `has_more`
- Added reusable pagination helper in `backend/app/core/pagination.py`.

### Phase 4: Test Coverage (Applied)

- Added focused security tests in `backend/tests/test_tool_validators.py`.
- Validated tests locally:
    - `4 passed`

### Runtime Validation Performed

- Backend Python modules compile successfully (`python -m compileall backend/app`).
- Docker services are up (`backend`, `frontend`, `rag-server`).

### Recommended Next Steps (Not yet applied)

- Add authentication/authorization (JWT or session-based) for all API endpoints.
- Add DB migrations workflow with Alembic for production schema evolution.
- Add frontend-side attachment type/size validation in chat upload UX.
- Add integration tests for tool calls and RAG consistency workflows.

---

## 📱 Mobile

NexusMind works as a **Progressive Web App (PWA)** in mobile browsers. Access the frontend URL from your phone to use the full interface. The responsive layout adapts to mobile screens.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
