export function buildUPILink(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const params = buildUPILinkParams(opts);
  return 'upi://pay?' + params.toString().replace(/\+/g, '%20');
}

export function buildUPILinkParams(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    pa: opts.upiId.trim(),
    pn: opts.payeeName,
    cu: 'INR',
    tn: opts.note || '',
  });
  if (opts.amount > 0) params.set('am', opts.amount.toFixed(2));
  return params;
}

export function isValidUpiId(value: string): boolean {
  return /^[\w.\-]{2,}@[a-zA-Z0-9]{2,}$/.test(value.trim());
}
