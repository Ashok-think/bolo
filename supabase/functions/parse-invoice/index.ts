// Rebundle authenticated AI access without app daily caps.
// Rebundle model-specific thinking: minimal on Flash-Lite; low on Gemini 3.8.
import {
  authorizeAI,
  corsHeaders,
  json,
  invoiceSchema,
  validateInvoice,
} from '../_shared/ai.ts';
import {
  buildTextProviderChain,
  callProviderChain,
} from '../_shared/providerChain.ts';
const prompt =
  'Extract only the invoice facts explicitly spoken by the user in any Indian language, English, or mixed/romanized speech. Return customer (at most four words; empty if absent), items [{name,quantity,unit_price}], advance, notes. Never invent a customer, price, or item. Ignore fillers such as so, got, ki, ke liye. In "Ravi Kumar bought t-shirts", the customer is Ravi Kumar; t-shirts is an item, never part of the name. If quantity or price was not spoken, do not guess it. Understand Indian number grouping, Hindi and Telugu spoken numbers including डेढ़ सौ=150 and రెండు వందలు=200. Price per item and quantity are separate. Preserve proper names. If one book costs 500 and the customer buys 30, quantity is 30 and unit_price is 500. Match knownCustomers only when the name was actually spoken.';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 2000)
      return json(400, { error: 'Enter a bill under 2000 characters' });
    const auth = await authorizeAI(req, body.lang);
    if (auth.error) return auth.error;
    const payload = {
      text,
      langName: typeof body.langName === 'string' ? body.langName : 'English',
      knownCustomers: Array.isArray(body.knownCustomers)
        ? body.knownCustomers
            .filter((x: unknown) => typeof x === 'string')
            .slice(0, 200)
        : [],
    };
    const { value } = await callProviderChain(
      buildTextProviderChain(body.providerPreference),
      (p) => ({
        model: p.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        responseSchema: invoiceSchema,
        response_format: { type: 'json_object' },
        temperature: 0,
        ...(p.supportsReasoningEffort ? { reasoning_effort: 'low' } : {}),
      }),
      validateInvoice,
      'parse-invoice',
    );
    return value
      ? json(200, { ...value, transcript: text })
      : json(503, { error: 'AI unavailable' });
  } catch {
    return json(500, { error: 'AI unavailable' });
  }
});
