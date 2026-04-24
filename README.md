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

The API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs)

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

1. Create a folder in `backend/extensions/installed/<your-slug>/`
2. Add a `manifest.json`:

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

3. Create `main.py`:

```python
def setup(hooks):
    hooks.register("note.created", on_note_created)

async def on_note_created(note: dict):
    print(f"New note: {note['title']}")
```

See `backend/extensions/example-extension/` for a complete example.

---

## 📡 API Reference

The backend exposes a full REST API. Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs)

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

## 📱 Mobile

NexusMind works as a **Progressive Web App (PWA)** in mobile browsers. Access the frontend URL from your phone to use the full interface. The responsive layout adapts to mobile screens.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
