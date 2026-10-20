import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, Apikey',
};
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
export async function authorizeAI(req: Request, _lang = 'en') {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const token = (req.headers.get('Authorization') || '').replace(
    /^Bearer /,
    '',
  );
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    return { error: json(401, { error: 'Sign in to use AI' }) };
  // No app-imposed daily caps. Provider quotas still apply; authentication
  // remains mandatory for every AI endpoint.
  return { admin, user: data.user };
}
export const itemSchema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    quantity: { type: 'NUMBER' },
    unit_price: { type: 'NUMBER' },
  },
  required: ['name', 'quantity', 'unit_price'],
};
export const invoiceSchema = {
  type: 'OBJECT',
  properties: {
    customer: { type: 'STRING' },
    items: { type: 'ARRAY', items: itemSchema },
    advance: { type: 'NUMBER' },
    notes: { type: 'STRING' },
  },
  required: ['customer', 'items', 'advance', 'notes'],
};
export function validateInvoice(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (!Array.isArray(x.items) || x.items.length > 30) return null;
  const items = [];
  for (const entry of x.items) {
    if (!entry || typeof entry !== 'object') return null;
    const i = entry as Record<string, unknown>;
    if (
      typeof i.name !== 'string' ||
      !i.name.trim() ||
      typeof i.quantity !== 'number' ||
      !Number.isFinite(i.quantity) ||
      i.quantity <= 0 ||
      typeof i.unit_price !== 'number' ||
      !Number.isFinite(i.unit_price) ||
      i.unit_price < 0
    )
      return null;
    items.push({
      name: i.name.trim().slice(0, 100),
      quantity: i.quantity,
      unit_price: i.unit_price,
    });
  }
  const customer = typeof x.customer === 'string' ? x.customer.trim() : '';
  return {
    customer: customer.split(/\s+/).length <= 4 ? customer : '',
    items,
    advance:
      typeof x.advance === 'number' &&
      Number.isFinite(x.advance) &&
      x.advance >= 0
        ? x.advance
        : 0,
    notes: typeof x.notes === 'string' ? x.notes.slice(0, 500) : '',
  };
}
