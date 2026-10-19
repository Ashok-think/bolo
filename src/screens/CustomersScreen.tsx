import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { Business } from '@/lib/types';
import { useCustomers } from '@/hooks/useCustomers';
import { formatINR, avatarColor } from '@/lib/format';
import { computeTrustWithOutstanding, trustChipClass } from '@/lib/trust';
import { useAllInvoices } from '@/hooks/useAllInvoices';
import { Avatar } from '@/components/ui/Avatar';
import { CustomerCardSkeleton } from '@/components/ui/SkeletonLoader';
import { Card } from '@/components/ui/Card';

export function CustomersScreen({
  business,
  onOpenCustomer,
}: {
  business: Business;
  onOpenCustomer: (id: string) => void;
}) {
  const { customers, loading } = useCustomers(business.id);
  const { all } = useAllInvoices(business.id);
  const [query, setQuery] = useState('');

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function trustFor(customerId: string) {
    const theirs = all.filter((inv) => inv.customer_id === customerId);
    const paid = theirs.filter((inv) => inv.status === 'paid');
    const unpaid = theirs.filter((inv) => inv.status === 'pending');
    return computeTrustWithOutstanding(paid, unpaid);
  }

  return (
    <div className="px-5 pt-2 pb-32">
      <h1 className="font-display font-bold text-xl text-ink mb-4">Customers</h1>

      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers"
          className="w-full min-h-[48px] pl-11 pr-4 rounded-full border border-line bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200"
        />
      </div>

      {loading ? (
        <div className="space-y-2.5">
          <CustomerCardSkeleton />
          <CustomerCardSkeleton />
          <CustomerCardSkeleton />
        </div>
      ) : customers.length === 0 ? (
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center mb-4">
            <Users size={40} className="text-primary/60" />
          </div>
          <p className="font-display font-bold text-ink">No customers yet</p>
          <p className="text-muted text-sm mt-1">
            Customers appear here after you create an invoice.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-center mt-10">No customers match "{query}".</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => {
            const trust = trustFor(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onOpenCustomer(c.id)}
                className="w-full text-left"
              >
                <Card className="p-4 flex items-center gap-3 hover:border-primary/30 transition duration-200 active:scale-[0.99]">
                  <Avatar name={c.name} color={avatarColor(c.name)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink truncate">{c.name}</p>
                    <p className="text-sm text-muted mt-0.5 truncate">{c.phone ?? 'No phone'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {c.pending_amount > 0 ? (
                      <p className="font-display font-bold text-amber">
                        {formatINR(c.pending_amount)}
                      </p>
                    ) : (
                      <p className="text-sm text-primary font-medium">All paid</p>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${trustChipClass(
                        trust.level
                      )}`}
                    >
                      {trust.label}
                    </span>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
