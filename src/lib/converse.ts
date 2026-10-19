import { supabase } from './supabase';
import { LANGUAGE_NAMES } from './format';
import type { Language } from './types';
import { parseWithRules } from './parserRules';

export interface DraftItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface ConversationDraft {
  customer: string;
  phone: string;
  items: DraftItem[];
  advance: number;
  notes: string;
}

export interface ConversationTurn {
  role: 'user' | 'bolo';
  text: string;
}

export interface ConverseResult {
  draft: ConversationDraft;
  reply: string;
  missing: string[];
  ready: boolean;
  source: 'ai' | 'rules';
}

export function emptyDraft(): ConversationDraft {
  return { customer: '', phone: '', items: [], advance: 0, notes: '' };
}

export function draftTotal(draft: ConversationDraft): number {
  return draft.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * One conversational turn. Tries the converse edge function (server-side
 * provider chain); if it is unavailable, falls back to the rule parser with
 * canned replies so the conversation never breaks.
 */
export async function converseTurn(
  draft: ConversationDraft,
  utterance: string,
  history: ConversationTurn[],
  lang: Language,
  knownCustomers: string[]
): Promise<ConverseResult> {
  try {
    const token = await getAccessToken();
    if (token) {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/converse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            draft,
            utterance,
            history: history.slice(-6),
            lang,
            langName: LANGUAGE_NAMES[lang],
            knownCustomers,
          }),
        }
      );
      if (response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { draft?: ConversationDraft; reply?: string; missing?: string[]; ready?: boolean }
          | null;
        if (data && typeof data.reply === 'string' && data.draft) {
          return {
            draft: { ...emptyDraft(), ...data.draft },
            reply: data.reply,
            missing: Array.isArray(data.missing) ? data.missing : [],
            ready: data.ready === true,
            source: 'ai',
          };
        }
      }
    }
  } catch {
    // fall through to rules
  }
  return ruleBasedTurn(draft, utterance, lang);
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') return resolve(null);
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; code: 'offline' | 'ai' | 'auth' };

/**
 * Send a voice recording to the transcribe-audio edge function (Gemini's
 * audio understanding) and resolve the transcript in the language actually
 * spoken. Resolves a failure code on any error so the caller can show the
 * real reason.
 */
export async function transcribeAudio(blob: Blob, lang: Language): Promise<TranscribeResult> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, code: 'offline' };
    }
    const token = await getAccessToken();
    if (!token) return { ok: false, code: 'auth' };
    const audio = await blobToBase64(blob);
    if (!audio || audio.length > 8_000_000) return { ok: false, code: 'ai' };
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ audio, mime: blob.type || 'audio/wav', lang }),
      }
    );
    if (!response.ok) return { ok: false, code: 'ai' };
    const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text ? { ok: true, text } : { ok: false, code: 'ai' };
  } catch (e) {
    // A thrown fetch is a network failure; a timeout abort is more likely
    // the AI being slow, which is retryable the same way.
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, code: aborted ? 'ai' : 'offline' };
  }
}

// --- Rule-based fallback ---------------------------------------------------

function cannedFor(lang: Language, key: 'ask-customer' | 'ask-item' | 'ask-price' | 'ask-advance' | 'ask-anything-else' | 'didnt-get'): string {
  const M: Record<string, Partial<Record<Language, string>>> = {
    'ask-customer': {
      en: 'Got it. Who is this bill for?',
      hi: 'ठीक है। यह बिल किसका है?',
      te: 'సరే. ఈ బిల్లు ఎవరిది?',
    },
    'ask-item': {
      en: 'Noted. What did you sell?',
      hi: 'समझ गया। क्या बेचा?',
      te: 'అయింది. ఏమి అమ్మారు?',
    },
    'ask-price': {
      en: 'Okay. What is the price?',
      hi: 'ठीक है। कीमत क्या है?',
      te: 'సరే. ధర ఎంత?',
    },
    'ask-advance': {
      en: 'Good. Any advance paid?',
      hi: 'अच्छा। कोई एडवांस दिया?',
      te: 'బాగుంది. ఏమైనా అడ్వాన్స్ ఇచ్చారా?',
    },
    'ask-anything-else': {
      en: 'Anything else, or shall I create it?',
      hi: 'और कुछ, या बना दूँ?',
      te: 'ఇంకేమైనా, లేదా చేస్తానా?',
    },
    'didnt-get': {
      en: "Sorry, I didn't catch that. Could you say it again?",
      hi: 'माफ़ कीजिए, समझ नहीं आया। फिर बोलिए?',
      te: 'క్షమించండి, అర్థం కాలేదు. మళ్ళీ చెప్పగలరా?',
    },
  };
  const row = M[key] ?? M['didnt-get'];
  return row[lang] ?? row.en ?? 'Could you say that again?';
}

function ruleBasedTurn(
  prev: ConversationDraft,
  utterance: string,
  lang: Language
): ConverseResult {
  const text = utterance.toLowerCase();
  const parsed = parseWithRules(utterance, lang);

  const draft: ConversationDraft = {
    ...prev,
    customer: prev.customer || parsed.customer,
    items: [...prev.items, ...parsed.items],
    advance: prev.advance + parsed.advance,
    notes: [prev.notes, parsed.notes].filter(Boolean).join(' | '),
  };

  const total = draftTotal(draft);
  const hasPricedItem = draft.items.some((it) => it.unit_price > 0);

  const isClosing =
    /(^|\s)(that'?s all|thats all|bas|ho gaya|ayipoyindi|yes|haan|avunu|sare|create it|done)($|[\s.,!?])/i.test(
      text
    ) || /అయిపోయింది/.test(text);

  if (isClosing && draft.customer && hasPricedItem) {
    const balance = Math.max(0, total - draft.advance);
    const readBack =
      `${draft.customer}, total ${Math.round(total)}, advance ${Math.round(draft.advance)}, ` +
      `balance ${Math.round(balance)}. ${cannedFor(lang, 'ask-anything-else')}`;
    return { draft, reply: readBack, missing: [], ready: true, source: 'rules' };
  }

  if (!draft.customer) {
    return {
      draft, reply: cannedFor(lang, 'ask-customer'), missing: ['customer'], ready: false, source: 'rules',
    };
  }
  if (draft.items.length === 0) {
    return {
      draft, reply: cannedFor(lang, 'ask-item'), missing: ['item'], ready: false, source: 'rules',
    };
  }
  if (!hasPricedItem) {
    return {
      draft, reply: cannedFor(lang, 'ask-price'), missing: ['item-price'], ready: false, source: 'rules',
    };
  }
  if (isClosing) {
    return {
      draft, reply: cannedFor(lang, 'ask-anything-else'), missing: [], ready: true, source: 'rules',
    };
  }
  return {
    draft, reply: cannedFor(lang, 'ask-advance'), missing: ['advance'], ready: false, source: 'rules',
  };
}
