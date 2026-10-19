/**
 * Parser tests: run with `node --experimental-strip-types` or tsx.
 * Each case: sentence -> expected customer, total, advance, balance.
 */
import { parseWithRules as parseInvoiceText } from '../src/lib/parserRules';

interface TestCase {
  sentence: string;
  customer: string;
  total: number;
  advance: number;
}

const CASES: TestCase[] = [
  {
    sentence: 'Ravi Kumar, 3 shirts stitching 200 each, 1 alteration 150, advance paid 300',
    customer: 'Ravi Kumar',
    total: 750,
    advance: 300,
  },
  {
    sentence: 'bill for Ravi, three shirts at 200 each and one alteration for 150, advance 300',
    customer: 'Ravi',
    total: 750,
    advance: 300,
  },
  {
    sentence: 'Sita 2 kg rice 60 per kg, 1 oil 180',
    customer: 'Sita',
    total: 300,
    advance: 0,
  },
  {
    sentence: 'Ravi 3 shirts 200 each',
    customer: 'Ravi',
    total: 600,
    advance: 0,
  },
  {
    sentence: 'Suresh two shirts at two hundred fifty each and one cap fifty rupees, advance two hundred',
    customer: 'Suresh',
    total: 550,
    advance: 200,
  },
];

let failures = 0;

for (const c of CASES) {
  const result = parseInvoiceText(c.sentence, 'en');
  const total = result.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const balance = total - result.advance;

  const okCustomer = result.customer === c.customer;
  const okTotal = Math.abs(total - c.total) < 0.01;
  const okAdvance = Math.abs(result.advance - c.advance) < 0.01;

  const pass = okCustomer && okTotal && okAdvance;
  if (!pass) failures += 1;

  console.log(`${pass ? 'PASS' : 'FAIL'}  "${c.sentence}"`);
  console.log(
    `      customer=${result.customer} (want ${c.customer})  total=${total} (want ${c.total})  advance=${result.advance} (want ${c.advance})  balance=${balance}`
  );
  if (result.items.length) {
    for (const it of result.items) {
      console.log(`      item: ${it.quantity} x ${it.name} @ ${it.unit_price}`);
    }
  }
  if (result.notes) console.log(`      notes: ${result.notes}`);
  console.log('');
}

if (failures > 0) {
  console.log(`${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('All 5 parser tests passed.');
}
