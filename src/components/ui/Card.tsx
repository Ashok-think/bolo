import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-card border border-line rounded-card shadow-card ${className}`}
      {...rest}
    />
  );
}
