export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-display font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}
