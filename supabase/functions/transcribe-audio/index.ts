// Supabase Edge Function: transcribe-audio
// Receives { audio: base64, mime, lang } and returns { text } — a transcript
// produced by Gemini's audio understanding, so Telugu/Hindi/mixed speech is
// transcribed in the language actually spoken.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROMPT =
  "Transcribe this voice recording exactly as spoken. It may be English, Hindi, Telugu, or a mix. " +
  "Write what was said in the same language the user spoke: if Hindi or Telugu was spoken in its own " +
  "script, transcribe in that script; if spoken using English letters (romanized), keep it romanized. " +
  "Numbers may stay as spoken words or digits. Output ONLY the transcription text, nothing else.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL");
    if (!apiKey || !model) {
      return json(503, { error: "Voice understanding is not configured" });
    }

    let body: { audio?: unknown; mime?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }

    const audio = typeof body.audio === "string" ? body.audio : "";
    const mime = typeof body.mime === "string" && body.mime ? body.mime : "audio/wav";
    if (!audio || audio.length > 8_000_000) {
      return json(400, { error: "No audio to understand" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: audio } }],
            },
          ],
        }),
      }
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.log(`transcribe-audio: gemini failed: HTTP ${response.status}`);
      return json(502, { error: "Could not understand the audio" });
    }

    const payload = await response.json().catch(() => null);
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: unknown }) => (typeof p.text === "string" ? p.text : ""))
      .join(" ")
      .trim();

    if (!text) {
      return json(502, { error: "Could not understand the audio" });
    }
    return json(200, { text: text.slice(0, 500) });
  } catch (_err) {
    return json(500, { error: "Could not understand the audio" });
  }
});
