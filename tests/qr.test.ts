import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { buildUPILink } from '../src/lib/upi.ts';
test('UPI link has balance, INR, invoice and encoded payee; qrcode generates PNG', async () => {
  const link = buildUPILink({
    upiId: 'shop@upi',
    payeeName: 'Ravi Tailors',
    amount: 450,
    note: 'Invoice 1',
  });
  assert.ok(!link.includes('+'));
  const params = new URL(link).searchParams;
  assert.equal(params.get('am'), '450.00');
  assert.equal(params.get('pa'), 'shop@upi');
  assert.equal(params.get('pn'), 'Ravi Tailors');
  assert.equal(params.get('cu'), 'INR');
  assert.match(
    await QRCode.toDataURL(link, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
    }),
    /^data:image\/png;base64,/,
  );
});
