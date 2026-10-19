import { safeCustomer, parseWithRules } from './parserRules';
import { supabase } from './supabase';
import { LANGUAGE_NAMES } from './format';
import type { Language } from './types';

export interface ParsedItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface ParsedInvoice {
  customer: string;
  items: ParsedItem[];
  advance: number;
  notes: string;
  ok: boolean;
  error?: string;
  source?: 'ai' | 'rules';
}

export const AI_TIMEOUT_MS = 5000;

/**
 * Instant parse: rule-based result right away (no network). The AI attempt
 * runs in the background via runBackgroundAI.
 */
export async function parseInvoiceTextInstant(
  text: string,
  lang: Language = 'en',
): Promise<ParsedInvoice> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      customer: '',
      items: [],
      advance: 0,
      notes: '',
      ok: false,
      error: 'empty',
    };
  }
  const rulesResult = parseWithRules(trimmed, lang);
  return { ...rulesResult, source: 'rules' };
}

interface AiWireResponse {
  customer?: unknown;
  items?: unknown;
  advance?: unknown;
  notes?: unknown;
  provider?: unknown;
}

function normalizeAI(data: AiWireResponse): ParsedInvoice | null {
  if (!data || !Array.isArray(data.items)) return null;

  const items = (data.items as unknown[])
    .filter(
      (it): it is ParsedItem =>
        typeof (it as ParsedItem)?.name === 'string' &&
        Number.isFinite((it as ParsedItem)?.quantity) &&
        (it as ParsedItem).quantity > 0 &&
        Number.isFinite((it as ParsedItem)?.unit_price) &&
        (it as ParsedItem).unit_price >= 0,
    )
    .slice(0, 30);

  if (items.length === 0) return null;

  return {
    customer:
      typeof data.customer === 'string' ? safeCustomer(data.customer) : '',
    items,
    advance:
      typeof data.advance === 'number' && data.advance >= 0 ? data.advance : 0,
    notes: typeof data.notes === 'string' ? data.notes : '',
    ok: true,
    source: 'ai',
  };
}

/**
 * Background AI attempt with a short timeout. Resolves null on any failure
 * (not configured, timeout, rate limit, bad response) — the caller ignores
 * it silently. The server tries Gemini first, then the OpenAI-compatible
 * provider, then the caller falls back to the rule-based parser.
 */
export async function runBackgroundAI(
  text: string,
  lang: Language = 'en',
  knownCustomers: string[] = [],
  timeoutMs: number = AI_TIMEOUT_MS,
  providerPreference: 'auto' | 'openai-compatible' = 'auto',
): Promise<ParsedInvoice | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  let timer: number | null = null;
  try {
    const request = (async (): Promise<ParsedInvoice | null> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          signal: controller.signal,
          body: JSON.stringify({
            text: trimmed,
            lang,
            langName: LANGUAGE_NAMES[lang],
            knownCustomers,
            providerPreference,
          }),
        },
      );
      if (!response.ok) return null;

      const data = (await response
        .json()
        .catch(() => null)) as AiWireResponse | null;
      return data ? normalizeAI(data) : null;
    })();
    const timeout = new Promise<null>((resolve) => {
      timer = window.setTimeout(
        () => {
          controller.abort();
          resolve(null);
        },
        Math.max(0, timeoutMs),
      );
    });
    return await Promise.race([request, timeout]);
  } catch {
    return null;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}
