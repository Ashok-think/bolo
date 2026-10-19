// Supabase Edge Function: parse-invoice
// Provider fallback chain, all keys server-side only:
//   1. Gemini (GEMINI_API_KEY / GEMINI_MODEL) — 4s timeout
//   2. OpenAI-compatible provider (AI_BASE_URL / AI_API_KEY / AI_MODEL,
//      already configured) — 4s timeout, reasoning_effort "low" when the
//      model supports it
// If both fail, the client silently falls back to its rule-based parser.
// The answering provider is logged to the console, never sent to the UI.
// Rate limit: 40 parses per user per day, enforced via ai_parse_usage.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DAILY_LIMIT = 40;
const PROVIDER_TIMEOUT_MS = 4000;
const MAX_ITEMS = 30;
// Gemini's OpenAI compatibility endpoint
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

const SYSTEM_PROMPT =
  "You extract a small-business invoice from a spoken sentence. The sentence may be in English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, a mix of these with English, or romanized forms of any of them. The user message tells you the expected language via langName. " +
  "Return ONLY JSON: {customer: string, items: [{name: string, quantity: number, unit_price: number}], advance: number, notes: string}. " +
  "Numbers must be plain numbers in rupees. If something is missing use empty string or 0. Never invent items or prices. " +
  "Match the customer to knownCustomers when the name is similar.";

interface ParseRequest {
  text?: unknown;
  lang?: unknown;
  langName?: unknown;
  knownCustomers?: unknown;
}

interface ParsedItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface ParsedInvoice {
  customer: string;
  items: ParsedItem[];
  advance: number;
  notes: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateParsed(raw: unknown): ParsedInvoice | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const customer = typeof obj.customer === "string" ? obj.customer : "";
  const advanceRaw = obj.advance;
  const advance =
    typeof advanceRaw === "number" && isFinite(advanceRaw) && advanceRaw >= 0
      ? advanceRaw
      : typeof advanceRaw === "string" && /^\d+(\.\d+)?$/.test(advanceRaw)
        ? parseFloat(advanceRaw)
        : 0;

  if (!Array.isArray(obj.items)) return null;
  if (obj.items.length > MAX_ITEMS) return null;

  const items: ParsedItem[] = [];
  for (const it of obj.items) {
    if (typeof it !== "object" || it === null) return null;
    const item = it as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const qty =
      typeof item.quantity === "number" && isFinite(item.quantity) && item.quantity >= 0
        ? item.quantity
        : 0;
    const price =
      typeof item.unit_price === "number" && isFinite(item.unit_price) && item.unit_price >= 0
        ? item.unit_price
        : 0;
    if (!name || qty <= 0 || price < 0) return null;
    items.push({ name, quantity: qty, unit_price: price });
  }

  const notes = typeof obj.notes === "string" ? obj.notes : "";
  return { customer, items, advance, notes };
}

async function countTodayUses(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabaseAdmin
    .from("ai_parse_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());
  if (error) throw new Error("rate limit check failed");
  return count ?? 0;
}

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsReasoningEffort: boolean;
}

async function callProvider(
  provider: ProviderConfig,
  userPayload: Record<string, unknown>
): Promise<ParsedInvoice | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  // reasoning_effort is accepted by o-series / gpt-5 style models; harmless
  // providers that reject unknown fields will error and we move on.
  if (provider.supportsReasoningEffort) {
    body.reasoning_effort = "low";
  }

  try {
    const completion = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);

    if (!completion.ok) {
      console.log(`Provider ${provider.name} failed: HTTP ${completion.status}`);
      return null;
    }

    const payload = await completion.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.log(`Provider ${provider.name} returned no message content`);
      return null;
    }

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(content);
    } catch {
      console.log(`Provider ${provider.name} returned invalid JSON`);
      return null;
    }

    const parsed = validateParsed(rawParsed);
    if (!parsed) {
      console.log(`Provider ${provider.name} returned an unusable invoice`);
      return null;
    }
    return parsed;
  } catch (e) {
    clearTimeout(timer);
    const why = e instanceof Error && e.name === "AbortError" ? "timeout" : "error";
    console.log(`Provider ${provider.name} failed: ${why}`);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Sign in to use AI parsing" });
    }

    // Authenticated user check (also gates rate limiting)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(401, { error: "Sign in to use AI parsing" });
    }
    const userId = userData.user.id;

    // Rate limit
    const usesToday = await countTodayUses(supabaseAdmin, userId);
    if (usesToday >= DAILY_LIMIT) {
      return json(429, { error: "Daily AI parse limit reached" });
    }

    // Input
    let body: ParseRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const lang = typeof body.lang === "string" ? body.lang : "en";
    const langName = typeof body.langName === "string" ? body.langName : "English";
    const knownCustomers = Array.isArray(body.knownCustomers)
      ? body.knownCustomers.filter((c): c is string => typeof c === "string").slice(0, 200)
      : [];

    if (!text) {
      return json(400, { error: "Nothing to parse" });
    }
    if (text.length > 500) {
      return json(400, { error: "Sentence too long" });
    }

    const userPayload = { text, lang, langName, knownCustomers };

    // Provider chain: Gemini first, then the OpenAI-compatible provider.
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL");
    const legacyKey = Deno.env.get("AI_API_KEY");
    const legacyBaseUrl = Deno.env.get("AI_BASE_URL");
    const legacyModel = Deno.env.get("AI_MODEL");

    const providers: ProviderConfig[] = [];
    if (geminiKey && geminiModel) {
      providers.push({
        name: "gemini",
        baseUrl: GEMINI_BASE_URL,
        apiKey: geminiKey,
        model: geminiModel,
        supportsReasoningEffort: false,
      });
    }
    if (legacyKey && legacyBaseUrl && legacyModel) {
      providers.push({
        name: "openai-compatible",
        baseUrl: legacyBaseUrl,
        apiKey: legacyKey,
        model: legacyModel,
        supportsReasoningEffort: true,
      });
    }

    if (providers.length === 0) {
      console.log("No AI providers configured");
      return json(503, { error: "AI parsing is not configured" });
    }

    for (const provider of providers) {
      const parsed = await callProvider(provider, userPayload);
      if (parsed) {
        console.log(`Provider ${provider.name} answered for user ${userId}`);
        await supabaseAdmin
          .from("ai_parse_usage")
          .insert({ user_id: userId, lang })
          .then(() => undefined, () => undefined);
        // Provider name stays in the console; the UI only sees the invoice.
        return json(200, { ...parsed, source: "ai" });
      }
    }

    console.log("All AI providers failed for user", userId);
    return json(502, { error: "AI parse failed" });
  } catch (_err) {
    return json(500, { error: "AI parse failed" });
  }
});
