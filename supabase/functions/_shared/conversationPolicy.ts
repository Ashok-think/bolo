// Phone/contact details are optional and must never become a billing question.
export function requestsPhone(reply: string, missing: unknown): boolean {
  const phone = /phone|mobile|whats\s*app|contact|telephone|ఫోన్|ఫోను|మొబైల్|నంబర్|నెంబర్|సంప్రదింపు|फ़ोन|फोन|मोबाइल|नंबर|नम्बर|संपर्क|sampark/i;
  return phone.test(reply) || (Array.isArray(missing) && missing.some(
    value => typeof value === 'string' && phone.test(value),
  ));
}
