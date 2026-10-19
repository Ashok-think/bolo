export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsReasoningEffort: boolean;
}
export function buildProviderChain(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  const key = Deno.env.get('GEMINI_API_KEY');
  if (key)
    providers.push({
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: key,
      model: Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash',
      supportsReasoningEffort: false,
    });
  const apiKey = Deno.env.get('AI_API_KEY'),
    baseUrl = Deno.env.get('AI_BASE_URL'),
    model = Deno.env.get('AI_MODEL');
  if (apiKey && baseUrl && model)
    providers.push({
      name: 'openai-compatible',
      baseUrl,
      apiKey,
      model,
      supportsReasoningEffort: /^(o[134]|gpt-5)/i.test(model),
    });
  return providers;
}
// Only an explicit Re-read selects the compatible provider directly.
// Normal voice parsing and Talk keep Gemini first, then compatible fallback.
export function buildTextProviderChain(preference?: unknown): ProviderConfig[] {
  const providers = buildProviderChain();
  if (preference !== 'openai-compatible') return providers;
  return providers.filter((p) => p.name === 'openai-compatible');
}
export interface ProviderCallResult<T> {
  value: T | null;
  providerName: string | null;
  reason?: string;
}
export async function callProviderChain<T>(
  providers: ProviderConfig[],
  buildBody: (provider: ProviderConfig) => Record<string, unknown>,
  extract: (raw: unknown) => T | null,
  context: string,
): Promise<ProviderCallResult<T>> {
  const deadline = Date.now() + 4000;
  let reason = 'No provider configured';
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const budget = Math.min(
      4000,
      Math.floor(remaining / (providers.length - index)),
    );
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), budget);
    try {
      const body = buildBody(provider);
      const messages = body.messages as { role: string; content: string }[];
      let endpoint = provider.baseUrl.replace(/\/$/, '') + '/chat/completions';
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      };
      let request: Record<string, unknown> = { ...body, max_tokens: 1200 };
      delete request.responseSchema;
      if (provider.name === 'openai-compatible' && /qwen3\.8-omni/i.test(provider.model)) {
        // Qwen3.8 supports non-streamed JSON mode, but not JSON Schema mode.
        request.modalities = ['text'];
        request.reasoning_effort = 'none';
        request.stream = false;
      }

      if (provider.name === 'gemini') {
        const model = provider.model.replace(/^models\//, '');
        endpoint = `${provider.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
        headers = {
          'Content-Type': 'application/json',
          'x-goog-api-key': provider.apiKey,
        };
        const thinkingConfig = /^gemini-2\.5/.test(model)
          ? { thinkingBudget: /pro/.test(model) ? 128 : 0 }
          : /^gemini-[34]/.test(model)
            ? { thinkingLevel: 'low' }
            : undefined;
        request = {
          systemInstruction: {
            parts: [
              {
                text: messages
                  .filter((m) => m.role === 'system')
                  .map((m) => m.content)
                  .join('\n'),
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: messages
                    .filter((m) => m.role !== 'system')
                    .map((m) => m.content)
                    .join('\n'),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
            ...(body.responseSchema
              ? { responseSchema: body.responseSchema }
              : {}),
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        };
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: abort.signal,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        reason =
          response.status === 429
            ? 'Rate limited'
            : response.status === 401 || response.status === 403
              ? 'API key or permission rejected'
              : response.status === 404
                ? 'Model unavailable'
                : `Provider request failed (HTTP ${response.status})`;
        continue;
      }
      const payload = await response.json();
      const content =
        provider.name === 'gemini'
          ? payload?.candidates?.[0]?.content?.parts
              ?.filter(
                (p: { text?: unknown; thought?: boolean }) =>
                  typeof p.text === 'string' && !p.thought,
              )
              .map((p: { text: string }) => p.text)
              .join('')
          : payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        reason = 'No structured response';
        continue;
      }
      const raw = JSON.parse(
        content
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/, ''),
      );
      const value = extract(raw);
      if (value === null) {
        reason = 'Response validation failed';
        continue;
      }
      console.log(`${context}: ${provider.name} answered`);
      return { value, providerName: provider.name };
    } catch {
      reason = abort.signal.aborted ? 'Timed out' : 'Request failed';
    } finally {
      clearTimeout(timer);
    }
  }
  return { value: null, providerName: null, reason };
}
