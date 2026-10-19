// Supabase Edge Function: converse
// Natural conversation mode. Receives { draft, utterance, history, lang,
// knownCustomers }, returns { draft, reply, missing, ready }.
// Uses the shared provider chain: Gemini, then the OpenAI-compatible
// provider, then the client falls back to rule-based parsing with canned
// replies. Keys stay server-side; the answering provider is console-logged
// only. Rate limit: 120 conversational turns per user per day.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { buildProviderChain, callProviderChain } from "../_shared/providerChain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DAILY_LIMIT = 120;
const MAX_TURNS = 6;
const MAX_ITEMS = 30;

const SYSTEM_PROMPT = `You are Bolo, a friendly billing assistant for a small shopkeeper. You are in a natural voice conversation. The user dictates invoice details in pieces, in the language named by langName or a mix with English (romanized speech included). The user message gives you langName, the current draft, the last few conversation turns, and the new utterance.

Merge the utterance into the draft. NEVER invent customers, items or prices; only use what the user actually said. If the utterance corrects an earlier detail, apply the correction.

Return ONLY JSON:
{
  "draft": {
    "customer": string,            // "" if unknown
    "phone": string,               // "" if unknown
    "items": [{ "name": string, "quantity": number, "unit_price": number }],
    "advance": number,
    "notes": string
  },
  "reply": string,                 // ONE short natural friendly sentence in the user's language
  "missing": string[],             // what is still missing, e.g. ["customer","item-price","advance"] or []
  "ready": boolean
}

The user may dictate SEVERAL invoices in one conversation. The app message
includes "billsDone" (invoices already finished) and "stashable" (a bill is
ready to be set aside). When the current draft is complete AND the user moves
on to a different customer ("next customer Sita...", "one more bill for...",
"ok next"), treat the current draft as one finished bill: set ready=true, then
in the SAME turn restart the draft for the new customer. When the user says
"that's all / bas / ho gaya / ayipoyindi", set ready=true and do NOT restart.

Rules for the reply:
- ONE sentence, short, warm, conversational. Ask about only ONE missing thing at a time.
- NEVER repeat a question that was already answered (check the history).
- Do not mention JSON, drafts, or fields. Sound like a helpful shop assistant.
- When customer and at least one item with a price exist, set ready=true and ask "Anything else, or shall I create it?" (in the user's language).
- If the utterance sounds like "that's all / yes create it / bas / ho gaya / ayipoyindi / yes / create it", do not add anything; set ready=true and make the reply a read-back: "<customer>, total <total>, advance <advance>, balance <balance>. Creating it now." in the user's language.
- Reply in the language named by langName. Accept and understand romanized and native-script words, preserve customer and item names, and never translate names into other words.`;

interface DraftItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface Draft {
  customer: string;
  phone: string;
  items: DraftItem[];
  advance: number;
  notes: string;
}

interface ConversationTurn {
  role: "user" | "bolo";
  text: string;
}

interface ConverseRequest {
  draft?: unknown;
  utterance?: unknown;
  history?: unknown;
  lang?: unknown;
  langName?: unknown;
  knownCustomers?: unknown;
  billsDone?: unknown;
}

interface ConverseResponse {
  draft: Draft;
  reply: string;
  missing: string[];
  ready: boolean;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Accept a number sent as a true number OR as a string of digits
// ("3", "200.50"); returns null when it is not numeric.
function tolerantNumber(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/[,\s₹]/g, "");
    if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  }
  return null;
}

// Convert one item. Returns null only when the piece is genuinely unusable
// (no name, or non-numeric quantity/price) so a single bad item never
// wipes out the rest of the draft.
function tolerantItem(raw: unknown): DraftItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim().slice(0, 60) : "";
  if (!name) return null;
  const quantity = tolerantNumber(item.quantity);
  const price = tolerantNumber(item.unit_price);
  if (quantity === null || price === null) return null;
  return { name, quantity, unit_price: price };
}

function sanitizeDraft(raw: unknown, fallback: Draft | null): Draft | null {
  const base: Draft = { customer: "", phone: "", items: [], advance: 0, notes: "" };
  if (typeof raw !== "object" || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;

  const customer = typeof obj.customer === "string" ? obj.customer.trim().slice(0, 80) : "";
  const phone = typeof obj.phone === "string" ? obj.phone.replace(/[^\d+]/g, "").slice(0, 15) : "";
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 300) : "";

  const advanceRaw = tolerantNumber(obj.advance);
  const advance = advanceRaw !== null && advanceRaw >= 0 ? Math.min(advanceRaw, 10000000) : 0;

  if (!Array.isArray(obj.items) || obj.items.length > MAX_ITEMS) return fallback;
  const items: DraftItem[] = [];
  for (const it of obj.items) {
    const item = tolerantItem(it);
    if (!item) continue; // skip only the broken piece, keep the rest
    items.push({
      name: item.name,
      quantity: Math.max(1, Math.min(item.quantity, 100000)),
      unit_price: Math.max(0, Math.min(item.unit_price, 10000000)),
    });
  }

  return { customer, phone, items, advance, notes };
}

function sanitizeHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ConversationTurn[] = [];
  for (const t of raw.slice(-MAX_TURNS)) {
    if (typeof t !== "object" || t === null) continue;
    const turn = t as Record<string, unknown>;
    const role = turn.role === "bolo" ? "bolo" : "user";
    const text = typeof turn.text === "string" ? turn.text.trim().slice(0, 300) : "";
    if (text) turns.push({ role, text });
  }
  return turns;
}

function buildReplyValidation(historyText: string, langName: string) {
  return (raw: unknown): ConverseResponse | null => {
    if (typeof raw !== "object" || raw === null) return null;
    const obj = raw as Record<string, unknown>;

    const draft = sanitizeDraft(obj.draft, null as unknown as Draft);
    if (!draft) {
      console.log("converse: provider returned an unusable draft shape");
      return null;
    }

    const reply = typeof obj.reply === "string" ? obj.reply.trim().slice(0, 300) : "";
    if (!reply) return null;
    if (/(json|draft\b|missing\[)/i.test(reply) && reply.length > 0) {
      // Let mildly technical wording pass; only reject obvious leakage.
      if (/^\s*[{[]/.test(reply)) return null;
    }

    const missing = Array.isArray(obj.missing)
      ? obj.missing.filter((m): m is string => typeof m === "string").slice(0, 6)
      : [];

    const ready = obj.ready === true;
    if (ready && !draft.customer) return null;
    return { draft, reply, missing, ready };
  };
}

async function countTodayUses(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
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
      return json(401, { error: "Sign in to use the assistant" });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(401, { error: "Sign in to use the assistant" });
    }
    const userId = userData.user.id;

    const usesToday = await countTodayUses(supabaseAdmin, userId);
    if (usesToday >= DAILY_LIMIT) {
      return json(429, { error: "Daily assistant limit reached" });
    }

    let body: ConverseRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }

    const utterance = typeof body.utterance === "string" ? body.utterance.trim().slice(0, 500) : "";
    if (!utterance) {
      return json(400, { error: "Nothing to understand" });
    }

    const lang = typeof body.lang === "string" ? body.lang : "en";
    const langName = typeof body.langName === "string" ? body.langName : "English";
    const knownCustomers = Array.isArray(body.knownCustomers)
      ? body.knownCustomers.filter((c): c is string => typeof c === "string").slice(0, 200)
      : [];

    const emptyDraft: Draft = { customer: "", phone: "", items: [], advance: 0, notes: "" };
    const incomingDraft = sanitizeDraft(body.draft, emptyDraft);
    const history = sanitizeHistory(body.history);
    const billsDone = Array.isArray(body.billsDone)
      ? body.billsDone
          .map((b: unknown) => sanitizeDraft(b, null))
          .filter((b: Draft | null): b is Draft => b !== null)
          .slice(0, 10)
      : [];

    const userPayload = {
      utterance,
      draft: incomingDraft,
      history,
      lang,
      langName,
      knownCustomers,
      billsDone,
    };

    const providers = buildProviderChain();
    if (providers.length === 0) {
      return json(503, { error: "Assistant is not configured" });
    }

    const { value } = await callProviderChain<ConverseResponse>(
      providers,
      (provider) => ({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        ...(provider.supportsReasoningEffort ? { reasoning_effort: "low" } : {}),
      }),
      buildReplyValidation(history.map((t) => t.text).join(" "), langName),
      "converse"
    );

    if (!value) {
      console.log("converse: all providers failed");
      return json(502, { error: "Assistant unavailable" });
    }

    await supabaseAdmin
      .from("ai_parse_usage")
      .insert({ user_id: userId, lang })
      .then(() => undefined, () => undefined);

    return json(200, value);
  } catch (_err) {
    return json(500, { error: "Assistant unavailable" });
  }
});
