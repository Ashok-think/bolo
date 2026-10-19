import type { Language } from './types';

const inr = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return `₹${inr.format(amount)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  '#0B6B4F',
  '#F59E0B',
  '#E5484D',
  '#6B645C',
  '#2F6FEB',
  '#7C3AED',
  '#C2410C',
  '#0E7490',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const LANGUAGE_LABELS: Record<
  Language,
  { label: string; flag: string }
> = {
  en: { label: 'English', flag: '🇬🇧' },
  hi: { label: 'हिन्दी', flag: '🇮🇳' },
  te: { label: 'తెలుగు', flag: '🇮🇳' },
  ta: { label: 'தமிழ்', flag: '🇮🇳' },
  kn: { label: 'ಕನ್ನಡ', flag: '🇮🇳' },
  ml: { label: 'മലയാളം', flag: '🇮🇳' },
  mr: { label: 'मराठी', flag: '🇮🇳' },
  bn: { label: 'বাংলা', flag: '🇮🇳' },
  gu: { label: 'ગુજરાતી', flag: '🇮🇳' },
  ur: { label: 'اردو', flag: '🇵🇰' },
};

/** English names, sent to the AI parser so it knows what to expect. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  ur: 'Urdu',
};

export const SPEECH_LOCALES: Record<Language, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  ur: 'ur-PK',
};

// Additional locales remain available for existing data; expose after device acceptance tests.
export const VOICE_LANGUAGES: Language[] = ['en', 'hi', 'te'];
