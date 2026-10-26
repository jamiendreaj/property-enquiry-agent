/**
 * Tests for RULE ZERO.
 *
 * Three of this agent's rules protect an agency from embarrassment. This one
 * protects it from a court, so it gets the most tests and the most awkward
 * ones.
 *
 * Two principles run through the whole file:
 *
 *   A false positive is cheap. A human spends thirty seconds clearing it.
 *   A false negative is a complaint. So the checks lean broad on purpose.
 *
 *   Accessibility runs the OTHER WAY. A naive discrimination filter blocks the
 *   word "wheelchair" and thereby disadvantages the disabled buyer it was
 *   written to protect. Those cases are tested as hard as the blocks.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from './guardrails.js';

const listing = { price: 285000, service_charge: '€1,200 a year', bedrooms: 3 };
const base = { toolResults: [], listing };

const blocked = (r) => r.issues.filter((i) => i.severity === 'block').map((i) => i.rule);
const warned = (r) => r.issues.filter((i) => i.severity === 'warn').map((i) => i.rule);
const rejects = (text, rule) => {
  const r = check(text, base);
  assert.equal(r.ok, false, `should have blocked: ${text}`);
  if (rule) assert.ok(blocked(r).includes(rule), `expected ${rule}, got [${blocked(r)}] for: ${text}`);
};
const allows = (text) => {
  const r = check(text, base);
  assert.equal(r.ok, true, `should have allowed: ${text} — blocked on [${blocked(r)}]`);
};

/* ── protected characteristics, stated outright ───────────────────────── */

test('blocks explicit exclusion on every protected ground', () => {
  for (const line of [
    'The landlord prefers no children.',
    'Sorry, the owner is not keen on foreign tenants.',
    'They would rather it went to a Christian family.',
    'The vendor will only consider a married couple.',
    'Working professionals only, I am afraid.',
    'No DSS.',
    'We are not taking housing benefit.',
    'Men only in this building.',
  ]) rejects(line, 'protected_characteristic');
});

test('blocks a preference phrased as a compliment', () => {
  // "Perfect for a young family" is the same offence as "no children" —
  // both decide who a property is for.
  for (const line of [
    'It would be perfect for a young family.',
    'This is really aimed at young professionals.',
    'Ideal for a retired couple.',
    'Better suited to a single person.',
  ]) rejects(line, 'protected_characteristic');
});

test('blocks the coded phrasing, which is how this actually happens', () => {
  for (const line of [
    'The building is mostly families with children.',
    'The area is predominantly Italian.',
    'I think you will fit in well here.',
    'We are looking for the right sort of tenant.',
  ]) rejects(line, 'protected_characteristic');
});

/* ── accessibility: the exception that runs the other way ─────────────── */

test('ALLOWS accessibility facts about the building', () => {
  // Refusing to describe access would itself disadvantage a disabled buyer,
  // which is the opposite of what the rule exists for.
  for (const line of [
    'There is step-free access from the street and a lift to every floor.',
    'There is an accessible bathroom on the ground floor.',
    'The entrance has a ramp, and parking is six metres from the door.',
    'There is a stairlift already fitted to the main staircase.',
    'It is on the ground floor with level access throughout.',
  ]) allows(line);
});

test('still blocks a judgement about who the access suits', () => {
  // The building may be described. The person may not.
  rejects('There is a lift, so it would suit a disabled buyer.', 'protected_characteristic');
});

/* ── steering ─────────────────────────────────────────────────────────── */

test('blocks steering, which needs no protected word to be unlawful', () => {
  for (const line of [
    'Honestly, you would be happier in the other part of town.',
    'I would suggest looking at Barriera instead.',
    'You would be better off somewhere else.',
    'This is not really the right area for you.',
    'Have you considered looking somewhere further out?',
  ]) rejects(line, 'steering');
});

test('does not mistake ordinary advice for steering', () => {
  // A guardrail that cries wolf gets switched off. These must pass.
  for (const line of [
    'I would suggest you look at the floorplan attached.',
    'I would recommend looking at the EPC before the viewing.',
    'Do look at the garden photos, they were taken last week.',
  ]) allows(line);
});

/* ── blockbusting ─────────────────────────────────────────────────────── */

test('blocks claims about who lives somewhere and what it does to prices', () => {
  for (const line of [
    'Property values are falling here, so buy while you still can.',
    'The schools have been getting worse.',
    'Crime is getting worse around here.',
    'The neighbourhood is changing.',
  ]) rejects(line, 'blockbusting');
});

/* ── price ────────────────────────────────────────────────────────────── */

test('allows a price the listing contains', () => {
  allows('It is on at €285,000.');
  allows('The service charge is €1,200 a year.');
});

test('allows a price a tool returned', () => {
  const r = check('The ground rent is €450.', { ...base, toolResults: [{ known: true, ground_rent: 450 }] });
  assert.equal(r.ok, true);
});

test('blocks a price nobody authorised', () => {
  rejects('Offers around €310,000 would probably be accepted.', 'unauthorised_price');
});

test('reads European decimal formatting', () => {
  // "€1.200" is twelve hundred, not one point two.
  const r = check('The service charge is €1.200 a year.', base);
  assert.equal(r.ok, true, 'the dotted form of a figure in the listing must pass');
});

/* ── things only a person may do ──────────────────────────────────────── */

test('blocks a confirmed viewing', () => {
  for (const line of [
    'I have booked you in for Thursday at 3pm.',
    'Your viewing is confirmed for Saturday.',
    'We have reserved the Thursday slot for you.',
  ]) rejects(line, 'confirmed_viewing');
});

test('allows offering a slot without confirming it', () => {
  allows('Thursday at 3pm and Saturday at 10am are both free — shall I ask the office to hold one?');
});

test('blocks mortgage and affordability advice', () => {
  // A regulated activity almost everywhere, and not one this agent is licensed for.
  for (const line of [
    'With your salary you could probably borrow that easily.',
    'You should be able to afford this one.',
    'I am sure the bank will say yes.',
  ]) rejects(line, 'financial_advice');
});

test('blocks valuation and return claims', () => {
  for (const line of [
    'It is worth more than the asking price.',
    'It will appreciate by 10% over five years.',
    'A guaranteed return of 6%.',
  ]) rejects(line, 'valuation_claim');
});

test('blocks money outside the process', () => {
  for (const line of [
    'Send the holding deposit to my account.',
    'You can give me your card number over email.',
  ]) rejects(line, 'payment_detail');
});

/* ── warnings ─────────────────────────────────────────────────────────── */

test('warns on hedging without blocking', () => {
  const r = check('The lease is usually 99 years on these.', base);
  assert.equal(r.ok, true, 'a hedge is a warning, not a block');
  assert.deepEqual(warned(r), ['hedged_fact']);
});

/* ── the ordinary reply ───────────────────────────────────────────────── */

test('an ordinary, useful reply passes everything', () => {
  allows(
    'The second bedroom is 11 m² with a built-in wardrobe, and the terrace faces south. ' +
    'It is on at €285,000. There is a lift to every floor. ' +
    'Thursday at 3pm is free if you would like me to ask the office to hold it.',
  );
});

test('reports every distinct problem in one pass', () => {
  const r = check(
    'Perfect for a young family. Offers around €310,000 are likely. I have booked you in for Thursday.',
    base,
  );
  const rules = blocked(r);
  assert.ok(rules.includes('protected_characteristic'));
  assert.ok(rules.includes('unauthorised_price'));
  assert.ok(rules.includes('confirmed_viewing'));
});
