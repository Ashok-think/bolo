import { useEffect, useState } from 'react';
import { SearchX, ShieldAlert } from 'lucide-react';
import { fetchPublicInvoice } from '@/lib/invoiceOps';
import { formatINR, formatDate } from '@/lib/format';
import { buildUPILink } from '@/lib/upi';
import { QrCard, PaidInFullCard, NoUpiCard } from '@/components/QrCard';
import { BoloLogo } from '@/components/BoloLogo';
import { Card } from '@/components/ui/Card';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';
import { StatusChip } from '@/components/ui/StatusChip';
import type { InvoiceStatus } from '@/lib/types';

interface PublicData {
  invoice: {
    id: string;
    number: number;
    status: string;
    total: number;
    paid_amount: number;
    notes: string | null;
    created_at: string;
    due_date: string | null;
    paid_at: string | null;
  };
  customer_name: string | null;
  business_name: string;
  upi_id: string;
  qr_image_url: string | null;
  items: { name: string; quantity: number; unit_price: number }[];
}

export function PublicInvoicePage({ token }: { token: string }) {
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let valid = true;
    fetchPublicInvoice(token).then(({ data: result }) => {
      if (!valid) return;
      if (result) setData(result as unknown as PublicData);
      else setError(true);
      setLoading(false);
    });
    return () => {
      valid = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <SkeletonLoader className="w-full max-w-sm h-96 rounded-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-4">
          <ShieldAlert size={32} className="text-danger" />
        </div>
        <h1 className="font-display font-bold text-xl text-ink">Invoice not found</h1>
        <p className="text-muted mt-1 max-w-xs">
          This link may be wrong or the invoice may have been removed.
        </p>
        <div className="mt-6">
          <BoloLogo size="sm" />
        </div>
      </div>
    );
  }

  const { invoice, items } = data;
  const balance = Math.max(0, invoice.total - invoice.paid_amount);
  const upiId = (data.upi_id ?? '').trim();
  const upiLink = buildUPILink({
    upiId,
    payeeName: data.business_name,
    amount: balance,
    note: `Invoice INV-${String(invoice.number).padStart(4, '0')}`,
  });

  return (
    <div className="min-h-screen bg-background px-5 pt-safe pb-safe py-8 md:flex md:justify-center">
      <div className="w-full md:max-w-md">
        <div className="flex items-center justify-between mb-6">
          <BoloLogo size="sm" />
          <StatusChip
            invoice={{
              status: invoice.status as InvoiceStatus,
              paid_amount: invoice.paid_amount,
            }}
          />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="bg-gradient-to-b from-primary to-primary/80 p-5 text-white">
            <p className="font-display font-bold text-lg truncate">{data.business_name}</p>
            <p className="text-sm text-white/80 mt-3">
              {balance > 0 ? 'Balance due' : 'Total paid'}
            </p>
            <p className="font-display font-extrabold text-5xl mt-1 tracking-tight">
              {formatINR(balance > 0 ? balance : invoice.total)}
            </p>
          </div>
          <div className="p-5">
            <p className="text-ink truncate">
              Billed to <span className="font-medium">{data.customer_name ?? 'Customer'}</span>
            </p>

            <div className="mt-4 space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink truncate">{item.name}</p>
                    <p className="text-sm text-muted">
                      {item.quantity} × {formatINR(item.unit_price)}
                    </p>
                  </div>
                  <span className="font-medium text-ink shrink-0">
                    {formatINR(item.quantity * item.unit_price)}
                  </span>
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex items-center gap-2 text-muted">
                  <SearchX size={18} /> No line items on this invoice.
                </div>
              )}
            </div>

            <div className="border-t border-line mt-4 pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">Total</span>
                <span className="font-medium">{formatINR(invoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Paid</span>
                <span className="font-medium">{formatINR(invoice.paid_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-ink">Balance due</span>
                <span className="font-display font-extrabold text-2xl text-primary">
                  {formatINR(balance)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {balance > 0 ? (
          upiId ? (
            <QrCard
              heading={`Scan to pay ${formatINR(balance)}`}
              upiId={upiId}
              upiLink={upiLink}
            />
          ) : (
            <NoUpiCard />
          )
        ) : (
          <PaidInFullCard />
        )}

        {invoice.notes && (
          <Card className="p-4 mt-4">
            <p className="text-sm text-muted">Notes</p>
            <p className="text-ink mt-1">{invoice.notes}</p>
          </Card>
        )}

        <p className="text-center text-xs text-muted mt-8">
          Powered by Bolo — Just say it. Get paid.
        </p>
      </div>
    </div>
  );
}
