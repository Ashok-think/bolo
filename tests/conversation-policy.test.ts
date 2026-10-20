import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsPhone } from '../supabase/functions/_shared/conversationPolicy.ts';

test('Talk never asks for phone/contact details, including Hindi and Telugu', () => {
  for (const reply of ['What is the customer phone number?', 'Mobile number cheppandi', 'మీ ఫోన్ నంబర్ చెప్పండి', 'ग्राहक का मोबाइल नंबर बताएं', 'WhatsApp number please']) {
    assert.equal(requestsPhone(reply, []), true, reply);
  }
  assert.equal(requestsPhone('Anything else?', ['customer_phone']), true);
  assert.equal(requestsPhone('What is the price per shirt?', ['unit_price']), false);
  assert.equal(requestsPhone('How many shirts?', ['quantity']), false);
});
