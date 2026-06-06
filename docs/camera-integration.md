# Camera / Vision Integration Guide

GODMODE wires webcam capture into LibreChat through the **Vision Bridge** FastAPI sidecar. The browser captures frames using the standard `MediaDevices.getUserMedia` API and sends them to the Vision Bridge, which relays them to the active multimodal model.

## Architecture Overview

```
Browser (camera capture)
        │
        │ POST /buffer  (base64 JPEG frame, ~every 2s while active)
        ▼
  vision-bridge:8000
        │
        │  (MCP SSE) ─────────────────────────────────┐
        ▼                                              │
  LibreChat mcpServers: vision-bridge            LibreChat Agent
                                                       │
                                            tools/call analyze_frame
                                                       │
                                            vision-bridge dispatches to
                                            Anthropic / OpenAI vision API
                                                       │
                                            returns description text
                                                       ▼
                                               Chat response
```

## How to Use (End User)

1. **Open GODMODE** at `http://localhost:3080`
2. **Start a conversation** with any Claude or GPT-4o model.
3. **Click the 📷 Camera button** in the toolbar below the chat composer.
4. **Grant browser permission** when prompted — Chrome/Edge will show a popup.
5. A small camera preview appears. Frames are silently buffered every 2 seconds.
6. **Ask the AI anything** about what the camera sees:
   - *"What can you see through my camera right now?"*
   - *"Is there any text in front of me?"*
   - *"Describe the room I'm in."*
7. The AI calls the `analyze_frame` MCP tool automatically and responds.
8. **Click the camera button again** to stop capture.

## Camera Button — Minimal Frontend Snippet

If you are building a custom interface on top of the Vision Bridge REST API, use this self-contained snippet. LibreChat uses the MCP tool surface, so this snippet is **not required for the standard GODMODE setup** — it is provided for custom integrations.

```html
<!-- camera-capture.html — standalone test page -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Vision Bridge Camera Test</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; background: #1a1a2e; color: #eee; }
    video, canvas { border: 1px solid #444; border-radius: 8px; display: block; margin: 1rem 0; }
    button { padding: .6rem 1.4rem; border-radius: 6px; border: none; cursor: pointer;
             background: #7c3aed; color: white; font-size: 1rem; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    #output { white-space: pre-wrap; background: #111; padding: 1rem; border-radius: 8px;
              min-height: 6rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>📷 Vision Bridge Test</h1>
  <button id="startBtn">Start Camera</button>
  <button id="stopBtn" disabled>Stop Camera</button>
  <button id="analyzeBtn" disabled>Analyze Now</button>

  <video id="videoEl" width="640" height="360" autoplay playsinline muted></video>
  <canvas id="canvasEl" width="640" height="360" style="display:none"></canvas>

  <p id="status">Idle</p>
  <div id="output"></div>

  <script>
    // -----------------------------------------------------------------------
    // Configuration — update VISION_BRIDGE_URL if running in Docker
    // -----------------------------------------------------------------------
    const VISION_BRIDGE_URL = 'http://localhost:8000'; // exposed only if port is published
    const SESSION_ID = 'browser-' + Math.random().toString(36).slice(2);
    const BUFFER_INTERVAL_MS = 2000;

    // -----------------------------------------------------------------------
    const video   = document.getElementById('videoEl');
    const canvas  = document.getElementById('canvasEl');
    const ctx     = canvas.getContext('2d');
    const startBtn   = document.getElementById('startBtn');
    const stopBtn    = document.getElementById('stopBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const status  = document.getElementById('status');
    const output  = document.getElementById('output');

    let stream = null;
    let bufferTimer = null;

    // Capture a JPEG frame from the video element as a base64 data URL
    function captureFrame(quality = 0.85) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }

    // Buffer the latest frame to vision-bridge (silent background push)
    async function bufferFrame() {
      if (!stream) return;
      const frameB64 = captureFrame();
      try {
        await fetch(`${VISION_BRIDGE_URL}/buffer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame: frameB64, session_id: SESSION_ID }),
        });
      } catch (e) {
        console.warn('Frame buffer error:', e);
      }
    }

    // Send a frame to /analyze and get a description
    async function analyzeNow(prompt = 'Describe in detail what you see in this webcam frame.') {
      const frameB64 = captureFrame();
      status.textContent = '⏳ Analyzing…';
      analyzeBtn.disabled = true;
      try {
        const res = await fetch(`${VISION_BRIDGE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frame: frameB64,
            prompt,
            session_id: SESSION_ID,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        output.textContent = data.analysis;
        status.textContent = `✅ Done (${data.provider}/${data.model})`;
      } catch (err) {
        status.textContent = `❌ Error: ${err.message}`;
        output.textContent = '';
      } finally {
        analyzeBtn.disabled = false;
      }
    }

    startBtn.addEventListener('click', async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        analyzeBtn.disabled = false;
        status.textContent = '🎥 Camera active — buffering frames…';
        bufferTimer = setInterval(bufferFrame, BUFFER_INTERVAL_MS);
      } catch (err) {
        status.textContent = `❌ Camera error: ${err.message}`;
      }
    });

    stopBtn.addEventListener('click', () => {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      clearInterval(bufferTimer);
      video.srcObject = null;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      analyzeBtn.disabled = true;
      status.textContent = 'Camera stopped.';
    });

    analyzeBtn.addEventListener('click', () => analyzeNow());
  </script>
</body>
</html>
```

## React / TypeScript Component

For embedding in a custom React app alongside LibreChat:

```tsx
// components/CameraCapture.tsx
import { useRef, useState, useCallback, useEffect } from 'react';

const VISION_BRIDGE_URL = process.env.NEXT_PUBLIC_VISION_BRIDGE_URL ?? 'http://localhost:8000';
const SESSION_ID = `session-${Math.random().toString(36).slice(2)}`;

interface CameraAnalysis {
  analysis: string;
  provider: string;
  model: string;
}

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [analysis, setAnalysis] = useState<CameraAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const bufferRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureFrame = useCallback((quality = 0.85): string => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }, []);

  const startCamera = useCallback(async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) videoRef.current.srcObject = mediaStream;
    setStream(mediaStream);
    bufferRef.current = setInterval(async () => {
      const frame = captureFrame();
      await fetch(`${VISION_BRIDGE_URL}/buffer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame, session_id: SESSION_ID }),
      }).catch(() => {});
    }, 2000);
  }, [captureFrame]);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    if (bufferRef.current) clearInterval(bufferRef.current);
  }, [stream]);

  const analyze = useCallback(async (prompt?: string) => {
    setLoading(true);
    const frame = captureFrame();
    const res = await fetch(`${VISION_BRIDGE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, prompt, session_id: SESSION_ID }),
    });
    const data: CameraAnalysis = await res.json();
    setAnalysis(data);
    setLoading(false);
  }, [captureFrame]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <video ref={videoRef} autoPlay playsInline muted width={640} height={360}
        className="rounded-lg border border-gray-700" />
      <canvas ref={canvasRef} width={640} height={360} className="hidden" />

      <div className="flex gap-2">
        {!stream
          ? <button onClick={startCamera} className="btn-primary">📷 Start Camera</button>
          : <button onClick={stopCamera} className="btn-secondary">⏹ Stop Camera</button>
        }
        <button onClick={() => analyze()} disabled={!stream || loading} className="btn-primary">
          {loading ? '⏳ Analyzing…' : '🔍 Analyze'}
        </button>
      </div>

      {analysis && (
        <div className="rounded-lg bg-gray-900 p-4 text-sm">
          <p className="text-gray-400 mb-1 text-xs">{analysis.provider} / {analysis.model}</p>
          <p>{analysis.analysis}</p>
        </div>
      )}
    </div>
  );
}
```

## Security Notes

- The Vision Bridge is **internal to the Docker network** — it is not published on a public port.
- LibreChat communicates with it via the `godmode_net` Docker bridge network.
- Camera permissions are browser-level (HTTPS required for most browsers in production).
- Frame data is never persisted to disk — it lives only in an in-memory ring buffer.
- For production deployments behind a reverse proxy, ensure `wss://` and `https://` are used.
