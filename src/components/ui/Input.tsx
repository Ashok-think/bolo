import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>}
      <input
        id={inputId}
        className={`w-full min-h-[48px] px-4 rounded-2xl border bg-card text-ink placeholder:text-muted/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition duration-200 ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...rest}
      />
      {error && <span className="block text-sm text-danger mt-1.5">{error}</span>}
    </label>
  );
}
