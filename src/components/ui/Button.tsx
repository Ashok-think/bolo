import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'danger' | 'amber-outline';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full font-medium transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary/90 active:scale-[0.98]',
    outline: 'border border-line bg-card text-ink hover:bg-primary-soft/50',
    danger: 'bg-danger text-white hover:bg-danger/90',
    'amber-outline': 'border border-amber/60 bg-card text-amber hover:bg-amber/10',
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}
