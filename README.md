# GODMODE

> Production-grade multimodal AI console powered by **LibreChat v0.8.6**.  
> Talk · Vision · Camera · Memory · Self-teach — all in one `docker compose up`.

---

## Feature Overview

| Feature | How it works | Where in UI |
|---|---|---|
| **Talk** | Chat with Claude Opus/Sonnet or GPT-4o | Model dropdown → select endpoint |
| **Vision** | Upload images directly to Claude/GPT-4o | Paperclip icon in composer |
| **Camera** | Live webcam frames → AI analysis via Vision Bridge MCP | Ask AI "look through my camera" |
| **Memory** | LibreChat native per-user memory + Mem0 cross-session semantic memory | Settings → Memory toggle |
| **Self-teach** | LibreChat Agents with native web search + Mem0 MCP memory tools | New Conversation → Agents endpoint |

---

## Requirements

- **Windows 10/11** with WSL2 (or Windows native Docker Desktop)
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) ≥ 4.26  
  *(Enable WSL2 backend in Docker Desktop → Settings → General)*
- [Git for Windows](https://git-scm.com/download/win) (for initial clone)
- API keys: Anthropic and/or OpenAI

---

## First-Run Setup (Windows)

### 1. Open PowerShell (or Windows Terminal) as a regular user

```powershell
# Verify Docker is running
docker info
```

### 2. Clone the repository

```powershell
git clone https://github.com/bill143/GODMODE.git
cd GODMODE
```

### 3. Create your `.env` file from the example

```powershell
copy .env.example .env
notepad .env
```

Fill in **every** required value (see [Environment Variables](#environment-variables) below).

### 4. Generate strong secrets + validate `.env`

Use the bootstrap script (recommended):

```powershell
./scripts/bootstrap-env.ps1
```

Or on macOS/Linux:

```bash
./scripts/bootstrap-env.sh
```

The script generates:
- `CREDS_KEY`
- `CREDS_IV`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `MEILI_MASTER_KEY`

It also validates that every variable declared in `.env.example` exists in `.env`.

Open **PowerShell** and run these commands — copy each output into the corresponding `.env` variable:

```powershell
# CREDS_KEY (64 hex chars)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# CREDS_IV (32 hex chars)
-join ((1..16) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# JWT_SECRET
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# JWT_REFRESH_SECRET
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# MEILI_MASTER_KEY
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

> **Tip:** If you have OpenSSL installed (Git for Windows includes it):  
> `openssl rand -hex 32`

### 5. Build and start the stack

```powershell
docker compose up --build -d
```

This downloads images and builds the vision-bridge service. First run takes 3–5 minutes.

### 6. Watch startup logs

```powershell
docker compose logs -f librechat
```

Wait until you see: `LibreChat server listening on port 3080`

### 7. Open GODMODE

Navigate to **http://localhost:3080** in Chrome or Edge.

---

## Production Deployment Runbook (Single VPS / Generic Docker Host)

> This runbook is host-agnostic and does **not** perform live deployment automatically.
> The operator must run these commands on the target server.

### 1) Clone on the server (**manual operator action**)

```bash
git clone https://github.com/bill143/GODMODE.git
cd GODMODE
```

### 2) Bootstrap environment file and secrets

```bash
./scripts/bootstrap-env.sh
```

### 3) Fill in real API keys and domain values (**manual operator action**)

Edit `.env` and set real values for:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GODMODE_DOMAIN` (public DNS name)
- `TLS_EMAIL` (email used for ACME TLS certificates)

### 4) Start production stack (TLS reverse proxy in front of LibreChat)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 5) Verify healthchecks

```bash
docker compose ps
docker compose logs --tail=100 librechat rag_api openmemory-mcp vision-bridge
```

All services should show healthy, and Caddy should be serving HTTPS.

### 6) Point DNS to the server (**manual operator action**)

Create A/AAAA records for `GODMODE_DOMAIN` to your server IP, then wait for DNS propagation.

### 7) Final verification (**manual operator action**)

Open `https://<GODMODE_DOMAIN>` and verify:
- LibreChat loads
- model endpoints are available
- memory and camera tools operate normally

---

## Environment Variables

Open `.env` and set these values before starting:

### Required — Authentication & Encryption

| Variable | Description |
|---|---|
| `CREDS_KEY` | 64-hex-char encryption key for stored credentials |
| `CREDS_IV` | 32-hex-char IV for encryption |
| `JWT_SECRET` | 64-hex-char JWT signing secret |
| `JWT_REFRESH_SECRET` | 64-hex-char JWT refresh token secret |

### Required — AI Model Providers

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

> The **Anthropic** model list is defined inline in `librechat.yaml`. The **OpenAI**
> model list is set via `OPENAI_MODELS` (the built-in openAI endpoint reads its
> models from the environment, not from `librechat.yaml`).

### Optional — Branding & Web Search

| Variable | Default | Description |
|---|---|---|
| `APP_TITLE` | `GODMODE` | Application title / branding (set via env, not yaml) |
| `OPENAI_MODELS` | `gpt-4o,gpt-4o-mini,gpt-4-turbo,gpt-4-vision-preview` | OpenAI model list |
| `SERPER_API_KEY` | *(blank)* | Web search provider — enables the agent `web_search` capability |
| `FIRECRAWL_API_KEY` | *(blank)* | Web search scraper (Firecrawl) |
| `FIRECRAWL_API_URL` | *(blank)* | Self-hosted Firecrawl URL (blank = Firecrawl cloud) |
| `JINA_API_KEY` | *(blank)* | Web search reranker (optional) |

> **Web search** is wired in `librechat.yaml` (the `webSearch` block + the agents
> `web_search` capability) but stays dormant until you supply at least one search
> key (`SERPER_API_KEY`) and one scraper key (`FIRECRAWL_API_KEY`).

### Required — Services

| Variable | Default | Description |
|---|---|---|
| `MEILI_MASTER_KEY` | *(generate)* | Meilisearch master key |
| `MONGO_URI` | `mongodb://mongodb:27017/LibreChat` | MongoDB connection string |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector store URL |

### Optional — Memory & Vision

| Variable | Default | Description |
|---|---|---|
| `MEM0_API_KEY` | *(blank)* | Mem0 cloud key (leave blank for local-only) |
| `MEM0_COLLECTION_NAME` | `godmode_memory` | Qdrant collection name for memories |
| `VISION_DEFAULT_PROVIDER` | `anthropic` | `anthropic` or `openai` for webcam analysis |
| `VISION_DEFAULT_MODEL` | `claude-3-5-sonnet-20241022` | Model for camera analysis |
| `VISION_MAX_FRAMES` | `4` | Max buffered webcam frames per analysis |

---

## Verifying Each Feature

### ✅ Talk

1. Go to `http://localhost:3080`
2. Register/sign in
3. Open the model dropdown (top-left of composer) → you should see **Anthropic** and **OpenAI** groups
4. Select `claude-3-5-sonnet-20241022`
5. Type: *"Hello, what can you do?"* → should respond

### ✅ Vision (Image Upload)

1. Select `claude-3-5-sonnet-20241022` or `gpt-4o`
2. Click the **paperclip 📎** icon in the composer
3. Upload any JPEG/PNG image
4. Ask: *"What's in this image?"* → should describe it

### ✅ Camera (Live Webcam)

1. Ensure you are on `http://localhost:3080` (Chrome/Edge required)
2. Start a conversation with a Claude model
3. Ask: *"Can you see through my camera?"* or *"What am I pointing at?"*
4. LibreChat's Agent will call the `analyze_frame` MCP tool
5. Browser prompts for camera permission → **Allow**
6. The AI responds with a description of the live frame

> **Note:** Camera capture uses the Vision Bridge MCP server. The browser captures frames
> via `MediaDevices.getUserMedia` and buffers them to `vision-bridge:8000/buffer`.
> When the AI calls `analyze_frame`, it relays the latest buffered frames to Claude/GPT-4o.

For standalone camera testing, see [docs/camera-integration.md](docs/camera-integration.md).

### ✅ Memory

**Native Memory (session recall):**
1. In a conversation, state: *"My name is [Name] and I prefer concise answers."*
2. Click the **memory icon** in the top-right settings panel → enable Memory
3. Start a **new conversation**
4. Ask: *"What's my name?"* → should recall it

**Mem0 Semantic Memory (cross-session MCP):**
1. With the Agents endpoint, instruct the agent: *"Remember that I work on Tuesdays."*
2. The agent calls the Mem0 OpenMemory MCP tool to store the fact in Qdrant
3. In a future session, ask: *"What do you know about my schedule?"*

### ✅ Self-Teach (Agents)

1. Open the model dropdown → select **Agents**
2. Create a new agent or use the default
3. Ask: *"Research the latest Claude model pricing and save a summary to memory."*
4. The agent uses the native `web_search` capability to research, then writes to Mem0 via MCP
   > Requires web search keys (`SERPER_API_KEY` + `FIRECRAWL_API_KEY`); see the env reference below.

---

## Service Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           Docker Network: godmode_net    │
                    │                                         │
Browser ──── :3080 ─┤── librechat ────┬─── mongodb           │
                    │                 ├─── meilisearch        │
                    │                 ├─── rag_api            │
                    │                 ├─── openmemory-mcp ─ qdrant │
                    │                 └─── vision-bridge      │
                    └─────────────────────────────────────────┘
```

| Service | Image | Purpose |
|---|---|---|
| `librechat` | `ghcr.io/danny-avila/librechat:v0.8.6` | Chat UI + API |
| `mongodb` | `mongo:7-jammy` | Conversation history |
| `meilisearch` | `getmeili/meilisearch:v1.12.3` | Full-text search |
| `qdrant` | `qdrant/qdrant:v1.11.0` | Vector store |
| `rag_api` | `ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest` | Document RAG API service |
| `openmemory-mcp` | `mem0ai/openmemory-mcp:latest` | Semantic memory MCP |
| `vision-bridge` | *(built from `./services/vision-bridge`)* | Webcam relay MCP |

---

## Useful Commands

```powershell
# Start all services (detached)
docker compose up -d

# View real-time logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f librechat
docker compose logs -f vision-bridge

# Restart a single service after config change
docker compose restart librechat

# Stop all services (data preserved)
docker compose down

# Stop and remove all data volumes (DESTRUCTIVE)
docker compose down -v

# Rebuild vision-bridge after code changes
docker compose build vision-bridge
docker compose up -d vision-bridge

# Validate docker-compose config
docker compose config
```

---

## Updating

```powershell
# Pull latest images
docker compose pull

# Rebuild custom services
docker compose build

# Restart with new images
docker compose up -d
```

---

## Troubleshooting

### Port 3080 already in use
```powershell
# Find the process using port 3080
netstat -ano | findstr :3080
# Kill it
taskkill /PID <PID> /F
```

### LibreChat won't start — MongoDB connection failed
```powershell
docker compose logs mongodb
# Ensure MongoDB is healthy
docker compose ps
```

### Camera permission denied in browser
- Use Chrome or Edge (Firefox may require HTTPS for `getUserMedia`)
- Click the **lock icon** in the address bar → Site settings → Camera → Allow
- Reload the page

### Vision Bridge not responding
```powershell
docker compose logs vision-bridge
# Check health
docker exec godmode-vision-bridge wget -qO- http://localhost:8000/health
```

### MCP servers not connecting
```powershell
# Check openmemory-mcp logs
docker compose logs openmemory-mcp
# Ensure Qdrant is healthy
docker compose ps qdrant
```

---

## Security Hardening (Production)

For internet-facing deployments:

1. Set `ALLOW_REGISTRATION=false` after creating your account
2. Place a reverse proxy (Nginx/Caddy) in front of port 3080 with TLS
3. Do NOT expose ports 6333 (Qdrant), 27017 (MongoDB), 7700 (Meilisearch) externally
4. Rotate all secrets in `.env` regularly
5. Enable MongoDB authentication for multi-user deployments

---

## License

GODMODE configuration and services are MIT licensed.  
LibreChat is MIT licensed — see [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat).
