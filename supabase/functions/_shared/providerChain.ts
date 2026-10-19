// Shared provider fallback chain for edge functions (Deno):
// Gemini first, then the OpenAI-compatible provider, each with a 4s timeout.
// The answering provider is logged to the console only, never sent to clients.

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsReasoningEffort: boolean;
}

const PROVIDER_TIMEOUT_MS = 15000;
// Gemini's OpenAI compatibility endpoint
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export function buildProviderChain(): ProviderConfig[] {
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
  return providers;
}

export interface ProviderCallResult<T> {
  value: T | null;
  providerName: string | null;
}

export async function callProviderChain<T>(
  providers: ProviderConfig[],
  buildBody: (provider: ProviderConfig) => Record<string, unknown>,
  extract: (payload: unknown) => T | null,
  logContext: string
): Promise<ProviderCallResult<T>> {
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const completion = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify(buildBody(provider)),
      });
      clearTimeout(timer);

      if (!completion.ok) {
        console.log(`${logContext}: provider ${provider.name} failed: HTTP ${completion.status}`);
        continue;
      }

      const payload = await completion.json().catch(() => null);
      const contentRaw = payload?.choices?.[0]?.message?.content;
      if (typeof contentRaw !== "string") {
        console.log(`${logContext}: provider ${provider.name} returned no message content`);
        continue;
      }
      // Strip markdown code fences Gemini sometimes wraps JSON in.
      const content = contentRaw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      if (!content) {
        console.log(`${logContext}: provider ${provider.name} returned empty content`);
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        console.log(`${logContext}: provider ${provider.name} returned invalid JSON`);
        continue;
      }

      const value = extract(raw);
      if (value === null) {
        console.log(`${logContext}: provider ${provider.name} returned an unusable result`);
        continue;
      }
      return { value, providerName: provider.name };
    } catch (e) {
      clearTimeout(timer);
      const why = e instanceof Error && e.name === "AbortError" ? "timeout" : "error";
      console.log(`${logContext}: provider ${provider.name} failed: ${why}`);
    }
  }
  return { value: null, providerName: null };
}
