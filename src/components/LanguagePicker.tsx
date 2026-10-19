import type { Language } from '@/lib/types';
import { LANGUAGE_LABELS, VOICE_LANGUAGES } from '@/lib/format';

const ORDER = VOICE_LANGUAGES;

export function LanguagePicker({
  value,
  onChange,
}: {
  value: Language;
  onChange: (lang: Language) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {ORDER.map((lang) => {
        const selected = value === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(lang)}
            aria-pressed={selected}
            className={`min-h-[64px] rounded-2xl border-2 px-2 py-3 flex flex-col items-center justify-center transition duration-200 ${
              selected
                ? 'bg-primary-soft border-primary'
                : 'bg-card border-line hover:border-primary/40'
            }`}
          >
            <span
              className={`text-sm font-medium ${selected ? 'text-primary' : 'text-ink'}`}
            >
              {LANGUAGE_LABELS[lang].label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
