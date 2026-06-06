"""
GODMODE Vision Bridge
=====================
FastAPI service that:
  1. Exposes an MCP-over-SSE server so LibreChat can call the `analyze_frame`
     and `describe_scene` tools directly from the chat composer.
  2. Exposes a simple REST POST /analyze endpoint for direct browser calls.
  3. Relays base64-encoded webcam frames to the active multimodal model
     (Anthropic or OpenAI) and streams back the analysis text.

MCP SSE transport endpoints:
  GET  /sse         — SSE event stream (server → client)
  POST /messages    — JSON-RPC requests (client → server)
  GET  /health      — health probe
  GET  /openapi.json — OpenAPI schema (for LibreChat OpenAPI Action fallback)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Deque

import anthropic
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vision-bridge")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
DEFAULT_PROVIDER = os.environ.get("VISION_DEFAULT_PROVIDER", "anthropic").lower()
DEFAULT_MODEL = os.environ.get("VISION_DEFAULT_MODEL", "claude-3-5-sonnet-20241022")
MAX_FRAMES = int(os.environ.get("VISION_MAX_FRAMES", "4"))
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3080").split(",")
    if o.strip()
]

# ---------------------------------------------------------------------------
# In-memory recent-frame ring buffer (per session_id)
# ---------------------------------------------------------------------------
_frame_buffers: dict[str, Deque[str]] = {}


def _get_buffer(session_id: str) -> Deque[str]:
    if session_id not in _frame_buffers:
        _frame_buffers[session_id] = deque(maxlen=MAX_FRAMES)
    return _frame_buffers[session_id]


# ---------------------------------------------------------------------------
# Model clients
# ---------------------------------------------------------------------------
def _anthropic_client() -> anthropic.AsyncAnthropic:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(502, "ANTHROPIC_API_KEY not configured")
    return anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)


def _openai_client() -> AsyncOpenAI:
    if not OPENAI_API_KEY:
        raise HTTPException(502, "OPENAI_API_KEY not configured")
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


async def _analyze_with_anthropic(
    frames_b64: list[str],
    prompt: str,
    model: str,
) -> str:
    """Send frames to Anthropic Claude vision and return text response."""
    client = _anthropic_client()
    content: list[dict] = []

    for frame in frames_b64:
        # Strip data URL prefix if present
        if "," in frame:
            frame = frame.split(",", 1)[1]
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame,
                },
            }
        )

    content.append({"type": "text", "text": prompt})

    response = await client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )
    return response.content[0].text  # type: ignore[index]


async def _analyze_with_openai(
    frames_b64: list[str],
    prompt: str,
    model: str,
) -> str:
    """Send frames to OpenAI GPT-4o vision and return text response."""
    client = _openai_client()
    content: list[dict] = []

    for frame in frames_b64:
        if not frame.startswith("data:"):
            frame = f"data:image/jpeg;base64,{frame}"
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": frame, "detail": "high"},
            }
        )

    content.append({"type": "text", "text": prompt})

    response = await client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )
    return response.choices[0].message.content or ""


async def analyze_frames(
    frames_b64: list[str],
    prompt: str = "Describe in detail what you see in this webcam frame.",
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """Route analysis to the configured multimodal provider."""
    prov = (provider or DEFAULT_PROVIDER).lower()
    mdl = model or DEFAULT_MODEL

    if not frames_b64:
        return "No frame data provided."

    if prov == "anthropic":
        return await _analyze_with_anthropic(frames_b64, prompt, mdl)
    elif prov == "openai":
        openai_model = mdl if "gpt" in mdl else "gpt-4o"
        return await _analyze_with_openai(frames_b64, prompt, openai_model)
    else:
        raise HTTPException(
            400, f"Unknown provider: {prov!r}. Use 'anthropic' or 'openai'."
        )


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    """Direct REST API request body."""

    frame: str = Field(..., description="Base64-encoded JPEG frame (data URL or raw)")
    prompt: str = Field(
        "Describe in detail what you see in this webcam frame.",
        description="Instruction / question about the frame",
    )
    provider: str | None = Field(None, description="anthropic | openai")
    model: str | None = Field(None, description="Model override")
    session_id: str | None = Field(None, description="Session ID for frame buffering")


class AnalyzeResponse(BaseModel):
    analysis: str
    provider: str
    model: str
    frames_used: int
    timestamp: float


# ---------------------------------------------------------------------------
# MCP SSE transport helpers
# ---------------------------------------------------------------------------
MCP_PROTOCOL_VERSION = "2024-11-05"
MCP_SERVER_INFO = {"name": "vision-bridge", "version": "1.0.0"}
MCP_CAPABILITIES = {
    "tools": {"listChanged": False},
}

MCP_TOOLS = [
    {
        "name": "analyze_frame",
        "description": (
            "Capture and analyze the user's current webcam frame. "
            "Call this when the user asks you to 'look through the camera', "
            "'see what I'm pointing at', 'describe the scene', etc. "
            "Returns a detailed description of what the camera sees."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "What to look for or describe in the frame. "
                    "Default: 'Describe in detail what you see.'",
                    "default": "Describe in detail what you see in this webcam frame.",
                },
                "session_id": {
                    "type": "string",
                    "description": "Optional session identifier for multi-frame context.",
                },
                "frame_b64": {
                    "type": "string",
                    "description": "Base64-encoded JPEG (optional; if omitted the server "
                    "uses the most recently buffered frame for this session_id).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "describe_scene",
        "description": (
            "Describe the full scene visible in the user's webcam in rich detail. "
            "Use for scene understanding, safety checks, or providing context."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "focus": {
                    "type": "string",
                    "description": "Aspect to focus on (e.g. 'objects', 'text', 'people', 'environment').",
                    "default": "everything",
                },
                "session_id": {"type": "string"},
                "frame_b64": {"type": "string"},
            },
            "required": [],
        },
    },
]


def _mcp_response(id_: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "result": result}


def _mcp_error(id_: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


async def _handle_mcp_request(body: dict) -> dict:
    """Dispatch a single JSON-RPC MCP request."""
    method = body.get("method", "")
    params = body.get("params") or {}
    req_id = body.get("id")

    if method == "initialize":
        return _mcp_response(
            req_id,
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "serverInfo": MCP_SERVER_INFO,
                "capabilities": MCP_CAPABILITIES,
            },
        )

    if method == "notifications/initialized":
        return {}  # no response for notifications

    if method == "tools/list":
        return _mcp_response(req_id, {"tools": MCP_TOOLS})

    if method == "tools/call":
        tool_name = params.get("name", "")
        args = params.get("arguments") or {}
        session_id = args.get("session_id", "default")
        frame_b64 = args.get("frame_b64") or ""

        # If no frame provided, use buffered frames
        buf = _get_buffer(session_id)
        frames: list[str] = []
        if frame_b64:
            frames = [frame_b64]
        elif buf:
            frames = list(buf)
        else:
            return _mcp_response(
                req_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "No webcam frame available. "
                                "Please enable the camera in the chat UI first."
                            ),
                        }
                    ]
                },
            )

        if tool_name == "analyze_frame":
            prompt = args.get(
                "prompt", "Describe in detail what you see in this webcam frame."
            )
        elif tool_name == "describe_scene":
            focus = args.get("focus", "everything")
            prompt = (
                f"Provide a rich, detailed description of the scene visible in this "
                f"webcam frame, focusing on {focus}. Include objects, colors, positions, "
                f"text (if any), and overall environment."
            )
        else:
            return _mcp_error(req_id, -32601, f"Unknown tool: {tool_name!r}")

        try:
            analysis = await analyze_frames(frames, prompt=prompt)
        except HTTPException as exc:
            return _mcp_error(req_id, -32603, str(exc.detail))
        except Exception:  # noqa: BLE001
            log.exception("Tool execution error")
            return _mcp_error(req_id, -32603, "Internal error during tool execution")

        return _mcp_response(
            req_id,
            {"content": [{"type": "text", "text": analysis}]},
        )

    if method == "ping":
        return _mcp_response(req_id, {})

    return _mcp_error(req_id, -32601, f"Method not found: {method!r}")


# ---------------------------------------------------------------------------
# SSE connection registry
# ---------------------------------------------------------------------------
# Maps connection_id → asyncio.Queue for outgoing SSE messages
_sse_queues: dict[str, asyncio.Queue] = {}


async def _sse_generator(connection_id: str) -> AsyncGenerator[bytes, None]:
    """Yield SSE-formatted bytes for a given connection."""
    q: asyncio.Queue = asyncio.Queue()
    _sse_queues[connection_id] = q

    # First event: tell client where to POST messages
    endpoint_url = f"/messages?connection_id={connection_id}"
    yield f"event: endpoint\ndata: {json.dumps(endpoint_url)}\n\n".encode()

    try:
        while True:
            try:
                message = await asyncio.wait_for(q.get(), timeout=30.0)
                if message is None:
                    break
                yield f"data: {json.dumps(message)}\n\n".encode()
            except asyncio.TimeoutError:
                # Send keep-alive ping
                yield b": keepalive\n\n"
    finally:
        _sse_queues.pop(connection_id, None)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "Vision Bridge starting up. Provider=%s Model=%s",
        DEFAULT_PROVIDER,
        DEFAULT_MODEL,
    )
    yield
    log.info("Vision Bridge shutting down.")


app = FastAPI(
    title="Vision Bridge",
    description=(
        "MCP-over-SSE server that relays live webcam frames to multimodal AI models. "
        "Exposes `analyze_frame` and `describe_scene` tools for LibreChat Agents."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {
        "status": "ok",
        "provider": DEFAULT_PROVIDER,
        "model": DEFAULT_MODEL,
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# Direct REST analyze endpoint (for browser → service calls)
# ---------------------------------------------------------------------------
@app.post("/analyze", response_model=AnalyzeResponse, tags=["vision"])
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a single base64-encoded webcam frame.

    Also buffers the frame so subsequent MCP `analyze_frame` tool calls
    (which may not include a frame) can reference recent camera state.
    """
    prov = (req.provider or DEFAULT_PROVIDER).lower()
    mdl = req.model or DEFAULT_MODEL

    # Buffer the frame for this session
    session_id = req.session_id or "default"
    _get_buffer(session_id).append(req.frame)

    analysis = await analyze_frames(
        [req.frame],
        prompt=req.prompt,
        provider=prov,
        model=mdl,
    )

    return AnalyzeResponse(
        analysis=analysis,
        provider=prov,
        model=mdl,
        frames_used=1,
        timestamp=time.time(),
    )


# ---------------------------------------------------------------------------
# Frame buffering endpoint (browser pushes frames without expecting analysis)
# ---------------------------------------------------------------------------
class BufferFrameRequest(BaseModel):
    frame: str
    session_id: str = "default"


@app.post("/buffer", tags=["vision"])
async def buffer_frame(req: BufferFrameRequest) -> dict:
    """Buffer a webcam frame for later MCP tool retrieval. Returns frame count."""
    _get_buffer(req.session_id).append(req.frame)
    return {"buffered": len(_get_buffer(req.session_id)), "session_id": req.session_id}


# ---------------------------------------------------------------------------
# MCP SSE endpoint
# ---------------------------------------------------------------------------
@app.get("/sse", tags=["mcp"])
async def sse_connect(request: Request) -> StreamingResponse:
    """
    MCP SSE transport — server-sent events stream.
    LibreChat connects here to receive responses.
    """
    connection_id = str(uuid.uuid4())
    log.info("New MCP SSE connection: %s", connection_id)

    return StreamingResponse(
        _sse_generator(connection_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# MCP messages endpoint
# ---------------------------------------------------------------------------
@app.post("/messages", tags=["mcp"])
async def mcp_messages(
    request: Request, connection_id: str | None = None
) -> JSONResponse:
    """
    MCP SSE transport — receive JSON-RPC requests from LibreChat.
    Dispatches to _handle_mcp_request and pushes response into the SSE queue.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    log.debug("MCP request: %s", body)
    response = await _handle_mcp_request(body)

    # Push response into SSE queue if connection exists
    if connection_id and connection_id in _sse_queues and response:
        await _sse_queues[connection_id].put(response)
        return JSONResponse({"status": "accepted"}, status_code=202)

    # Fallback: return inline response (works for simple non-streaming clients)
    if response:
        return JSONResponse(response)
    return JSONResponse({"status": "ok"})
