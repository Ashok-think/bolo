import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import QRCode from 'qrcode';

export interface QrCardProps {
  heading: string;
  upiId: string;
  upiLink: string;
}

export function QrCard({ heading, upiId, upiLink }: QrCardProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let valid = true;
    setDataUrl(null);
    setFailed(false);
    QRCode.toDataURL(
      upiLink,
      {
        width: 480,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#14110F', light: '#FFFFFF' },
      },
      (err, url) => {
        if (!valid) return;
        if (err || !url) setFailed(true);
        else setDataUrl(url);
      }
    );
    return () => {
      valid = false;
    };
  }, [upiLink]);

  if (failed) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger/5 p-5 mt-4">
        <p className="text-sm text-danger font-medium">Could not draw the QR</p>
        <p className="text-xs text-muted mt-1 break-all">{upiId}</p>
        <a
          href={upiLink}
          className="mt-3 inline-flex items-center justify-center min-h-[48px] rounded-full bg-primary text-white font-medium transition duration-200 hover:bg-primary/90 px-6"
        >
          Pay with UPI
        </a>
      </div>
    );
  }
  return (
    <div className="rounded-card bg-card border border-line p-5 mt-4 flex flex-col items-center">
      <h3 className="font-display font-bold text-ink text-lg">{heading}</h3>
      <p className="text-xs text-muted mt-1 break-all">
        Any UPI app · {upiId}
      </p>
      {dataUrl ? (
        <div className="bg-white rounded-2xl border border-line p-3 mt-4 w-[240px]">
          <img src={dataUrl} alt="Payment QR code" className="block w-full h-auto" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-line p-3 mt-4 w-[240px]">
          <div className="w-full aspect-square animate-pulse rounded-xl bg-ink/5" />
        </div>
      )}
    </div>
  );
}

export function PaidInFullCard() {
  return (
    <div className="rounded-card bg-primary-soft/50 border border-line p-6 mt-4 flex flex-col items-center text-center">
      <CheckCircle2 size={36} className="text-primary" />
      <p className="font-display font-bold text-lg text-ink mt-3">Paid in full</p>
      <p>Nothing left to pay.</p>
    </div>
  );
}

export function NoUpiCard({ onClick }: { onClick?: () => void }) {
  return (
    <div className="rounded-card bg-card border border-line p-6 mt-4 text-center">
      <p className="text-sm text-muted mb-4">
        Add your UPI ID to show a QR code and let customers pay you directly.
      </p>
      <a
        href="#settings"
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
        }}
        className="mt-1 inline-flex items-center justify-center min-h-[48px] rounded-full bg-primary text-white font-medium transition duration-200 hover:bg-primary/90 px-6"
      >
        Add your UPI ID
      </a>
    </div>
  );
}
