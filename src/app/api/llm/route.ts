import { NextRequest, NextResponse } from "next/server";

// API keys from client localStorage are NEVER stored server-side.
// All key handling is transient for the duration of a single request.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modelId, prompt, apiKey, family } = body as {
      modelId: string;
      prompt: string;
      apiKey: string;
      family: string;
    };

    if (!prompt || !apiKey || !family) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof apiKey !== "string" || apiKey.length < 10) {
      return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
    }

    if (family === "GPT-4") return await callOpenAI(modelId, prompt, apiKey);
    if (family === "Claude 3.5") return await callAnthropic(modelId, prompt, apiKey);
    if (family === "Gemini") return await callGemini(modelId, prompt, apiKey);
    return await callOpenAICompatible(modelId, prompt, apiKey, family);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function callOpenAI(modelId: string, prompt: string, apiKey: string): Promise<Response> {
  const upstreamModel = modelId === "gpt-4-turbo" ? "gpt-4-turbo" : "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: upstreamModel,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }
  return streamSSEResponse(res);
}

async function callAnthropic(modelId: string, prompt: string, apiKey: string): Promise<Response> {
  void modelId;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "messages-2023-12-15",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }
  return streamSSEResponse(res);
}

async function callGemini(modelId: string, prompt: string, apiKey: string): Promise<Response> {
  void modelId;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }
  return streamSSEResponse(res);
}

async function callOpenAICompatible(
  modelId: string,
  prompt: string,
  apiKey: string,
  family: string
): Promise<Response> {
  const endpoint = family === "Mistral"
    ? "https://api.mistral.ai/v1/chat/completions"
    : "https://api.together.xyz/v1/chat/completions";
  const model = family === "Mistral"
    ? "mistral-large-latest"
    : "meta-llama/Meta-Llama-3-70B-Instruct-Turbo";
  void modelId;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }
  return streamSSEResponse(res);
}

function streamSSEResponse(upstream: Response): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  (async () => {
    const reader = upstream.body?.getReader();
    if (!reader) { await writer.close(); return; }
    try {
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines2 = buffer.split("\n");
        buffer = lines2.pop() ?? "";
        for (const line of lines2) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const text =
              parsed?.choices?.[0]?.delta?.content ??
              parsed?.delta?.text ??
              parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
              "";
            if (text) await writer.write(new TextEncoder().encode(text));
          } catch { /* skip malformed SSE */ }
        }
      }
    } finally {
      await writer.close();
    }
  })();
  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
