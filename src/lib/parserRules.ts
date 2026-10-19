import type { Language } from './types';

export interface ParsedItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface ParsedInvoice {
  customer: string;
  items: ParsedItem[];
  advance: number;
  notes: string;
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Word-number handling (English + common romanized Hindi)
// ---------------------------------------------------------------------------

const SMALL: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  bees: 20,
  tees: 30,
  chalis: 40,
  pachaas: 50,
  sau: 100,
  सौ: 100,
  వంద: 100,
  వందలు: 100,
  vanda: 100,
  vandalu: 100,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ఒకటి: 1,
  రెండు: 2,
  మూడు: 3,
  నాలుగు: 4,
  ఐదు: 5,
  ఆరు: 6,
  ఏడు: 7,
  ఎనిమిది: 8,
  తొమ్మిది: 9,
  పది: 10,
  okka: 1,
  oka: 1,
  rendu: 2,
  moodu: 3,
  mūḍu: 3,
  naalugu: 4,
  nalugu: 4,
  aidu: 5,
  aaru: 6,
  edu: 7,
  yedu: 7,
  enimidi: 8,
  tommidi: 9,
  padi: 10,
  iravai: 20,
  muppai: 30,
  nalabhai: 40,
  yabai: 50,
};

// Compound spoken numbers like "two hundred", "two fifty" (= 250)
function tryCompoundNumber(
  words: string[],
  i: number,
): { value: number; len: number } | null {
  const w0 = words[i]?.toLowerCase();
  if (!w0) return null;
  const v0 = SMALL[w0];
  if (v0 === undefined) return null;

  if (
    ['hundred', 'sau', 'सौ', 'వంద', 'వందలు', 'vanda', 'vandalu'].includes(
      words[i + 1]?.toLowerCase(),
    )
  ) {
    const base = v0 * 100;
    const w2 = words[i + 2]?.toLowerCase();
    if (w2 && SMALL[w2] !== undefined && SMALL[w2]! < 100) {
      return { value: base + SMALL[w2]!, len: 3 };
    }
    return { value: base, len: 2 };
  }

  const w1 = words[i + 1]?.toLowerCase();
  if (
    w1 &&
    SMALL[w1] !== undefined &&
    v0 < 10 &&
    SMALL[w1]! >= 10 &&
    SMALL[w1]! < 100
  ) {
    return { value: v0 * 100 + SMALL[w1]!, len: 2 };
  }

  return { value: v0, len: 1 };
}

/**
 * Convert spoken number words to digits, so "three shirts at two hundred"
 * becomes "3 shirts at 200".
 */
function normalizeSpokenNumbers(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  let i = 0;
  while (i < words.length) {
    const compound = tryCompoundNumber(words, i);
    if (compound) {
      out.push(String(compound.value));
      i += compound.len;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

function normalizePunctuation(text: string): string {
  return text
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66))
    .replace(/(?:डेढ़|dedh)\s+(?:सौ|sau)/gi, '150')
    .replace(/(?:ढाई|dhai)\s+(?:सौ|sau)/gi, '250')
    .replace(
      /(?<![\p{L}\p{M}])(?:के लिए|के लिये|ki|ka|ke|కోసం|కి|కు)(?![\p{L}\p{M}])/giu,
      ' ',
    )
    .replace(/अग्रिम|एडवांस|అడ్వాన్స్|అడ్వాన్సు/gu, ' advance ')
    .replace(/रुपये|रुपया|రూపాయలు|రూపాయల/gu, ' ')
    .replace(/प्रति|हर|ఒక్కొక్కటి|ఒక్కొక్క/gu, ' each ')
    .replace(/\bgave\s+me\b|\bgave\b|\btook\b/gi, ' ')
    .replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966)) // Devanagari digits
    .replace(/[₹]/g, ' ')
    .replace(/\brupees?\b|\brs\.?\b/gi, ' ')
    .replace(/[،；।]/g, ',')
    .replace(/,/g, ' , ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Item parsing
// ---------------------------------------------------------------------------

const NOISE_WORDS = new Set([
  'each',
  'per',
  'at',
  'for',
  'and',
  'then',
  'advance',
  'paid',
  'received',
  'note',
  'notes',
  'the',
  'a',
  'an',
  'of',
  'to',
  'up',
  'kg',
  'litre',
  'gram',
  'total',
  'bill',
  'invoice',
  'only',
  'sir',
  'please',
  'so',
  'got',
  'get',
  'cost',
  'costs',
  'costing',
  'bought',
  'buy',
  'buying',
  'is',
  'was',
  'where',
  'i',
  'have',
  'has',
  'price',
  'please',
  'me',
  'my',
  'for',
  'customer',
  'customername',
]);

export function safeCustomer(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()));
  if (!words.length || words.length > 4 || /[\d?!]/.test(name)) return '';
  if (
    /^(how|who|what|where|when|can|could|would|thank|thanks|hello|hi|yes|done|okay|ok)\b/i.test(
      words.join(' '),
    )
  )
    return '';
  return titleCase(words.join(' '));
}

function parseItemSegment(segment: string): ParsedItem | null {
  // Segment is expected to start at the quantity (customer already stripped)
  const seg = segment.trim();
  if (!seg || !/\d/.test(seg)) return null;

  const numbers = [...seg.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => ({
    value: parseFloat(m[1]),
    index: m.index ?? 0,
  }));
  if (numbers.length === 0) return null;

  const isTotal = /\btotal\b/i.test(seg);
  // Money-first pattern: "<amount> for <qty> <name>" — the amount comes
  // directly before the quantity, joined only by "for" ("300 for 3 shirts").
  // In other orders ("1 alteration for 150") the gap between the numbers
  // contains item words, which is the normal qty-then-price pattern.
  const gap =
    numbers.length > 1
      ? seg
          .slice(
            numbers[0].index + String(numbers[0].value).length,
            numbers[1].index,
          )
          .trim()
      : '';
  const moneyFirst = !isTotal && numbers.length >= 2 && /^for$/i.test(gap);

  const quantity = Math.max(1, numbers[moneyFirst ? 1 : 0].value);
  let unit_price: number;

  if (isTotal && numbers.length >= 2) {
    unit_price = numbers[numbers.length - 1].value / Math.max(1, quantity);
  } else if (moneyFirst) {
    unit_price = numbers[0].value / Math.max(1, quantity);
  } else if (numbers.length >= 2) {
    unit_price = numbers[numbers.length - 1].value;
  } else {
    const name = seg
      .slice(numbers[0].index + String(numbers[0].value).length)
      .trim();
    return name && !/^(advance|paid|received)$/i.test(name)
      ? { name: titleCase(name), quantity, unit_price: 0 }
      : null;
  }

  // Name: for the normal pattern, words between the quantity and the price;
  // for money-first, words after the quantity to the end.
  const qtyNum = numbers[moneyFirst ? 1 : 0];
  const qtyEnd = qtyNum.index + String(qtyNum.value).length;
  const priceNum = numbers[numbers.length - 1];
  const between = moneyFirst
    ? seg.slice(qtyEnd)
    : seg.slice(qtyEnd, priceNum.index);
  const nameWords = between
    .trim()
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()) && !/^\d/.test(w));

  if (nameWords.length === 0) return null;

  return {
    name: titleCase(nameWords.join(' ')),
    quantity,
    unit_price: Math.max(0, unit_price),
  };
}

// ---------------------------------------------------------------------------
// Main rule-based parser
// ---------------------------------------------------------------------------

export function parseWithRules(
  text: string,
  _lang: Language = 'en',
  knownCustomers: string[] = [],
): ParsedInvoice {
  const empty: ParsedInvoice = {
    customer: '',
    items: [],
    advance: 0,
    notes: '',
    ok: false,
    error: 'empty',
  };

  // Small talk is never a customer name: a greeting or "how are you" with no
  // digits and no item words returns empty instead of creating "How Are You".
  const SMALL_TALK_RE =
    /^\s*(hello\s+)?(hi\s+|hey\s+)?(how\s+are\s+you|whats\s+up|what's\s+up|good\s+(morning|afternoon|evening))\b[?\s!.,]*$/i;
  const GREETING_PREFIX_RE =
    /^\s*(hello|hi|hey|namaste|namaskaram|vanakkam)\b[\s!,.]*/i;

  if (SMALL_TALK_RE.test(text)) return { ...empty, error: 'greeting' };

  let clean = normalizePunctuation(text.replace(GREETING_PREFIX_RE, ''));
  if (!clean) return empty;

  clean = normalizeSpokenNumbers(clean);

  // Match full names literally; combining marks are part of a word.
  let matchedCustomer = '';
  for (const name of [...knownCustomers].sort((a, b) => b.length - a.length)) {
    const needle = name.trim();
    if (!needle) continue;
    const index = clean.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    if (index < 0) continue;
    const isWord = (ch: string) => /[\p{L}\p{M}\p{N}]/u.test(ch);
    if (
      isWord(clean[index - 1] || '') ||
      isWord(clean[index + needle.length] || '')
    )
      continue;
    matchedCustomer = needle;
    clean = (
      clean.slice(0, index) +
      ' ' +
      clean.slice(index + needle.length)
    ).trim();
    break;
  }

  // A purchase verb separates the buyer's name from goods, even before a
  // quantity is spoken: "Ravi Kumar bought t-shirts and one sheet ...".
  if (!matchedCustomer) {
    const buyer = clean.match(/^(.+?)\s+(?:bought|buys?|purchased|ordered|got)\b\s*/i);
    const name = buyer ? safeCustomer(buyer[1]) : '';
    if (buyer && name) {
      matchedCustomer = name;
      clean = clean.slice(buyer[0].length).trim();
    }
  }

  // Advance: "advance 300", "advance paid 300", "received 300", "paid 300"
  let advance = 0;
  const advanceMatch =
    clean.match(/\b(?:advance|received)\b(?:\s+\w+)?\s+(\d+(?:\.\d+)?)/i) ??
    clean.match(/\b(?:paid)\b(?:\s+\w+)?\s+(\d+(?:\.\d+)?)/i);
  if (advanceMatch) {
    advance = parseFloat(advanceMatch[1]);
    clean = clean.replace(advanceMatch[0], ', ');
  }

  // Explicit "note: ..." gets pulled out
  let explicitNotes = '';
  const notesMatch = clean.match(/\bnotes?\b\s*[:\-]?\s*(.+)$/i);
  if (notesMatch) {
    explicitNotes = notesMatch[1].trim();
    clean = clean.slice(0, notesMatch.index ?? clean.length).trim();
  }

  // A spoken unit price followed by an explicit purchased quantity.
  // Keep customer empty when no name was spoken (the reported book example).
  const purchase = clean.match(
    /\b1\s+([\p{L}\p{M}\s]+?)\s+costs?(?:\s+me)?\s+(\d+(?:\.\d+)?)\s+.*?\b(?:bought|buy|got)\s+(\d+(?:\.\d+)?)\b/iu,
  );
  if (purchase) {
    const name = titleCase(purchase[1].trim());
    return {
      customer: matchedCustomer,
      items: [
        {
          name,
          quantity: Number(purchase[3]),
          unit_price: Number(purchase[2]),
        },
      ],
      advance,
      notes: explicitNotes,
      ok: true,
    };
  }

  // Split into segments on commas, "and", "then"
  const segments = clean
    .split(/,|\band\b|\bthen\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const unparsed: string[] = [];
  let customer = matchedCustomer;

  for (const seg of segments) {
    if (!seg) continue;

    // Skip pure advance remnants already accounted for
    if (/^(advance|received|paid)\b/i.test(seg) && /\d/.test(seg)) {
      continue;
    }

    // Customer: first segment with no digits, before any items found
    if (!customer && !/\d/.test(seg)) {
      customer = safeCustomer(
        seg
          .replace(
            /\b(bill|invoice|for|hi|hello|so|then|got|bought|buy|me|my|customer|name)\b/gi,
            ' ',
          )
          .replace(/\s+/g, ' ')
          .trim(),
      );
      continue;
    }

    // Strip a leading name before the first number ("Ravi 3 shirts 200")
    let itemSeg = seg;
    const firstNum = seg.match(/\d/);
    if (firstNum && firstNum.index !== undefined && !customer) {
      const before = seg
        .slice(0, firstNum.index)
        .split(/\s+/)
        .filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()));
      if (before.length > 0) {
        customer = safeCustomer(before.join(' '));
        itemSeg = seg.slice(firstNum.index).trim();
      }
    }

    const item = parseItemSegment(itemSeg);
    if (item && item.name) {
      items.push(item);
    } else {
      unparsed.push(seg);
    }
  }

  // Preserve unparsed fragments in notes
  const notes = [explicitNotes, ...unparsed].filter(Boolean).join(' | ');

  if (items.length === 0) {
    return {
      customer,
      items: [],
      advance,
      notes,
      ok: false,
      error: 'no-items',
    };
  }

  return {
    customer,
    items: items.slice(0, 30),
    advance,
    notes,
    ok: items.some((it) => it.unit_price > 0),
  };
}
