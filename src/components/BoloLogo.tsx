export function BoloLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-2xl' : 'text-3xl';
  return (
    <span className="inline-flex items-center gap-1.5 select-none">
      <span className={`font-display font-extrabold lowercase ${text} text-primary tracking-tight`}>
        bolo
      </span>
      <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
        <span className="w-[3px] h-2 rounded-full bg-lime" />
        <span className="w-[3px] h-4 rounded-full bg-lime" />
        <span className="w-[3px] h-2.5 rounded-full bg-lime" />
      </span>
    </span>
  );
}
