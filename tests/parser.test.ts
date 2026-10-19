import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWithRules } from '../src/lib/parserRules.ts';
const cases = [
  [
    'English',
    'Ravi Kumar, 3 shirts 200 each, 1 alteration 150, advance 300',
    'Ravi Kumar',
    750,
    300,
  ],
  [
    'Hindi',
    'रवि कुमार के लिए तीन शर्ट दो सौ रुपये प्रति, एक अल्टरेशन डेढ़ सौ, अग्रिम तीन सौ',
    'रवि कुमार',
    750,
    300,
  ],
  [
    'Telugu',
    'రవి కుమార్ కి మూడు షర్టులు ఒక్కొక్కటి రెండు వందలు, అడ్వాన్స్ మూడు వందలు',
    'రవి కుమార్',
    600,
    300,
  ],
  [
    'Mixed',
    'Ravi ki 3 shirts 200 each, ek alteration 150, advance 300',
    'Ravi',
    750,
    300,
  ],
  [
    'Spoken numbers',
    'Suresh two shirts at two hundred fifty each and one cap fifty rupees, advance two hundred',
    'Suresh',
    550,
    200,
  ],
  [
    'Indian grouping',
    'Ravi, 1 machine ₹1,50,000, advance 20,000',
    'Ravi',
    150000,
    20000,
  ],
] as const;
for (const [label, text, name, total, advance] of cases)
  test(label, () => {
    const p = parseWithRules(text);
    assert.equal(p.customer, name);
    assert.equal(
      p.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
      total,
    );
    assert.equal(p.advance, advance);
  });
test('single number never crashes and retains an unpriced item', () => {
  const p = parseWithRules('30 books');
  assert.equal(p.customer, '');
  assert.equal(p.items[0]?.quantity, 30);
  assert.equal(p.items[0]?.unit_price, 0);
});
test('descriptive text is not a customer', () => {
  assert.equal(parseWithRules('one book cost me 500 rupees').customer, '');
  assert.equal(
    parseWithRules('this is a very long sentence without any customer')
      .customer,
    '',
  );
});
test('known customer spelling retained', () => {
  assert.equal(
    parseWithRules('so ravi got 3 shirts 200 each', 'en', ['Ravi']).customer,
    'Ravi',
  );
});
test('empty transcript does not parse', () => {
  assert.equal(parseWithRules('').ok, false);
});
test('inline advance is not used as item price', () => {
  const p = parseWithRules('Ravi 3 shirts 200 each advance 300');
  assert.equal(p.items[0]?.unit_price, 200);
  assert.equal(p.advance, 300);
});

test('reported book sentence separates quantity from unit price without inventing customer', () => {
  const p = parseWithRules(
    'one book cost me 500 rupees and where I bought 30 books books',
  );
  assert.equal(p.customer, '');
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].quantity, 30);
  assert.equal(p.items[0].unit_price, 500);
});
