// Rebundle shared provider compatibility for Gemini 3.8 (low thinking).
import {
  authorizeAI,
  corsHeaders,
  json,
  invoiceSchema,
  validateInvoice,
} from '../_shared/ai.ts';
import {
  buildProviderChain,
  callProviderChain,
} from '../_shared/providerChain.ts';
const schema = {
  type: 'OBJECT',
  properties: {
    draft: {
      ...invoiceSchema,
      properties: { ...invoiceSchema.properties, phone: { type: 'STRING' } },
      required: [...invoiceSchema.required, 'phone'],
    },
    reply: { type: 'STRING' },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
    ready: { type: 'BOOLEAN' },
  },
  required: ['draft', 'reply', 'missing', 'ready'],
};
const prompt = `You are Bolo, a warm billing assistant. Understand native, romanized and mixed Indian-language text. Merge the new utterance once into the previous draft. Never duplicate items or advance already in the draft. Apply corrections rather than append copies. Never invent missing facts. In 'Ravi Kumar bought t-shirts', customer is Ravi Kumar and t-shirts is an item, not a surname. Ask for a missing quantity or price rather than guessing. Customer names contain at most 4 words; filler 'so', 'got', 'ki' is not a name. A book costs 500 and 30 bought means quantity 30, unit_price 500. Return {draft:{customer,phone,items:[{name,quantity,unit_price}],advance,notes},reply,missing,ready}. Reply in ONE short friendly sentence in the user's spoken language, asking only ONE genuinely missing thing. Check the history; never repeat an answered question. If complete, ask 'Anything else, or shall I create it?'. If they say yes/create it/done/bas/ho gaya/అయిపోయింది, keep the completed draft, set ready=true and read back customer,total,advance,balance. Do not claim that an invoice was saved; the user must confirm Review. Keep item and customer names as spoken.`;
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await req.json();
    const utterance =
      typeof body.utterance === 'string' ? body.utterance.trim() : '';
    if (!utterance || utterance.length > 2000)
      return json(400, { error: 'Enter a shorter reply' });
    const auth = await authorizeAI(req, body.lang);
    if (auth.error) return auth.error;
    const draft = validateInvoice(body.draft);
    if (!draft) return json(400, { error: 'Invalid draft' });
    const payload = {
      utterance,
      draft: {
        ...draft,
        phone: typeof body.draft.phone === 'string' ? body.draft.phone : '',
      },
      history: Array.isArray(body.history)
        ? body.history
            .slice(-6)
            .map((t: { role?: unknown; text?: unknown }) => ({
              role: t.role === 'bolo' ? 'bolo' : 'user',
              text: typeof t.text === 'string' ? t.text.slice(0, 500) : '',
            }))
        : [],
      langName: body.langName,
      knownCustomers: Array.isArray(body.knownCustomers)
        ? body.knownCustomers
            .filter((x: unknown) => typeof x === 'string')
            .slice(0, 200)
        : [],
    };
    const { value } = await callProviderChain(
      buildProviderChain(),
      (p) => ({
        model: p.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        responseSchema: schema,
        response_format: { type: 'json_object' },
        temperature: 0,
        ...(p.supportsReasoningEffort ? { reasoning_effort: 'low' } : {}),
      }),
      (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const x = raw as Record<string, unknown>;
        const result = validateInvoice(x.draft);
        if (!result || typeof x.reply !== 'string' || !x.reply.trim())
          return null;
        return {
          draft: {
            ...result,
            phone:
              typeof (x.draft as Record<string, unknown>).phone === 'string'
                ? (x.draft as Record<string, unknown>).phone
                : '',
          },
          reply: x.reply.trim().slice(0, 300),
          missing: Array.isArray(x.missing)
            ? x.missing.filter((v) => typeof v === 'string').slice(0, 6)
            : [],
          ready: x.ready === true,
        };
      },
      'converse',
    );
    return value ? json(200, value) : json(503, { error: 'AI unavailable' });
  } catch {
    return json(500, { error: 'AI unavailable' });
  }
});
