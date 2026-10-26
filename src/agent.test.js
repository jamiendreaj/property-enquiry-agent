/**
 * Tests for the agent loop.
 *
 * `reply()` takes an injectable client, so the whole loop runs against
 * scripted responses — no network, no API key, nothing that fails for a reason
 * unrelated to the code.
 *
 * Two things here are not in the other agents in this family, and both exist
 * because of what this one is allowed to be wrong about:
 *
 *   A RULE ZERO failure is reported differently from an ordinary block. The
 *   person clearing the queue needs to know at a glance which of these is a
 *   legal problem and which is a typo.
 *
 *   A model that reaches for a salary field is surfaced on the result, not
 *   buried in the tool log. Under GDPR that attempt is the thing an auditor
 *   asks about, whether or not anything was stored.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { reply, DEFAULT_TOKEN_BUDGET } from './agent.js';

const listing = {
  reference: 'TO-114',
  address: 'Via Esempio 10, Torino',
  type: 'Apartment',
  bedrooms: 3,
  price: 285000,
  price_text: '€285,000',
  rooms: [{ name: 'Bedroom 2', size_sqm: 11 }],
  facts: { service_charge: '€1,200 a year', parking: 'One space, included' },
  access: '  · Lift to all floors',
};

const branch = {
  name: 'Esempio, Torino',
  jurisdiction: 'eu',
  languages: ['it', 'en'],
  diary: [{ when: 'Thursday 15:00' }, { when: 'Saturday 10:00' }],
};

/** A client that replays scripted turns. */
function fake(turns) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const t = turns[Math.min(i, turns.length - 1)];
        i += 1;
        return {
          stop_reason: t.stop ?? 'end_turn',
          content: t.content ?? [{ type: 'text', text: t.text ?? '' }],
          usage: {
            input_tokens: t.input ?? 2000,
            output_tokens: t.output ?? 150,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
    },
  };
}

const run = (turns, opts = {}) =>
  reply({ listing, branch, enquiry: 'How big is bedroom 2?', client: fake(turns), ...opts });

/* ── jurisdiction ─────────────────────────────────────────────────────── */

test('a branch with no jurisdiction cannot run at all', async () => {
  await assert.rejects(
    () => reply({ listing, branch: { name: 'X' }, enquiry: 'hi', client: fake([{ text: 'ok' }]) }),
    /jurisdiction/,
  );
});

test('an unknown jurisdiction is refused rather than defaulted', async () => {
  await assert.rejects(
    () => reply({ listing, branch: { name: 'X', jurisdiction: 'mars' }, enquiry: 'hi', client: fake([{ text: 'ok' }]) }),
    /Unknown jurisdiction/,
  );
});

test('the jurisdiction is reported on every result', async () => {
  const r = await run([{ text: 'Bedroom 2 is 11 m². There is a lift to all floors.' }]);
  assert.equal(r.jurisdiction, 'eu');
});

/* ── RULE ZERO is reported differently ────────────────────────────────── */

test('a RULE ZERO failure says so in plain words', async () => {
  const r = await run([{ text: 'It would be perfect for a young family.' }]);
  assert.equal(r.sendable, false);
  assert.match(r.blocked_because, /RULE ZERO/);
  assert.match(r.blocked_because, /needs a person/);
});

test('steering is reported as RULE ZERO, not as an ordinary block', async () => {
  const r = await run([{ text: 'Honestly, you would be happier in the other part of town.' }]);
  assert.match(r.blocked_because, /RULE ZERO/);
  assert.match(r.blocked_because, /steering/);
});

test('an ordinary block is NOT dressed up as a legal problem', async () => {
  // A price nobody authorised is a mistake. It is not a discrimination claim,
  // and calling it one would train whoever reads the queue to ignore the label.
  const r = await run([{ text: 'Offers around €310,000 are usually accepted.' }]);
  assert.equal(r.sendable, false);
  assert.equal(/RULE ZERO/.test(r.blocked_because), false);
  assert.match(r.blocked_because, /unauthorised_price/);
});

test('a clean reply is sendable', async () => {
  const r = await run([{
    text: 'Bedroom 2 is 11 m² with a built-in wardrobe. There is a lift to all floors, ' +
          'and it is on at €285,000. Thursday 15:00 is free if you would like me to ask the office.',
  }]);
  assert.equal(r.sendable, true);
  assert.equal(r.blocked_because, null);
});

/* ── GDPR: what the model tried to record ─────────────────────────────── */

test('fields outside the permitted set are refused and surfaced', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'record_requirements',
        input: { bedrooms_min: 3, salary: '55000', nationality: 'Albanian', household: '2 adults 1 child' },
      }],
    },
    { text: 'Bedroom 2 is 11 m². There is a lift to all floors.' },
  ]);

  assert.deepEqual(r.refused_fields.sort(), ['household', 'nationality', 'salary']);
  assert.deepEqual(Object.keys(r.requirements), ['bedrooms_min'],
    'only the permitted field was kept');
  assert.equal(r.sendable, true, 'the refusal is a signal, not a failure of the reply');
});

test('permitted requirement fields are kept', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'record_requirements',
        input: { bedrooms_min: 2, step_free_access: true, timeframe: 'within_3_months', spoken_to_broker: true },
      }],
    },
    { text: 'Bedroom 2 is 11 m². There is a lift to all floors.' },
  ]);
  assert.equal(r.refused_fields.length, 0);
  assert.equal(r.requirements.step_free_access, true);
  assert.equal(r.requirements.timeframe, 'within_3_months');
});

/* ── the loop ─────────────────────────────────────────────────────────── */

test('escalation is recorded and reported', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'escalate_to_agent',
        input: { reason: 'area_comparison', summary: 'Asked how this area compares to another.' },
      }],
    },
    { text: 'A colleague will come back to you on that. Bedroom 2 is 11 m².' },
  ]);
  assert.equal(r.escalated, true);
  assert.equal(r.escalations[0].reason, 'area_comparison');
  assert.equal(r.sendable, true, 'escalating is a success, not a failure');
});

test('a truncated reply is never sendable', async () => {
  const r = await run([{ stop: 'max_tokens', text: 'Bedroom 2 is' }]);
  assert.equal(r.sendable, false);
  assert.equal(r.truncated, true);
});

test('finishing with no text block is named, not crashed on', async () => {
  const r = await run([{ content: [{ type: 'thinking', thinking: 'at length...' }] }]);
  assert.equal(r.sendable, false);
  assert.match(r.blocked_because, /no text/);
});

test('the token budget stops a runaway tool loop', async () => {
  const greedy = {
    content: [{ type: 'tool_use', id: 't1', name: 'get_listing_detail', input: { field: 'x' } }],
    input: 9000, output: 1000,
  };
  const r = await run([greedy], { tokenBudget: 25_000 });
  assert.equal(r.budget_exhausted, true);
  assert.ok(r.tokens_used >= 25_000);
  assert.ok(r.tokens_used < 60_000, `spent ${r.tokens_used}, should not have run to MAX_TURNS`);
});

test('a tool that throws does not kill the run', async () => {
  const r = await run([
    { content: [{ type: 'tool_use', id: 't1', name: 'does_not_exist', input: {} }] },
    { text: 'Bedroom 2 is 11 m². There is a lift to all floors.' },
  ]);
  assert.equal(r.tool_calls.length, 1);
  assert.ok('error' in r.tool_calls[0].output);
  assert.equal(r.sendable, true);
});

test('usage accumulates across turns and the budget is reported', async () => {
  const r = await run([
    { content: [{ type: 'tool_use', id: 't1', name: 'check_viewing_slots', input: {} }], input: 100, output: 20 },
    { text: 'Thursday 15:00 is free. Bedroom 2 is 11 m².', input: 150, output: 30 },
  ]);
  assert.equal(r.usage.input, 250);
  assert.equal(r.usage.output, 50);
  assert.equal(r.token_budget, DEFAULT_TOKEN_BUDGET);
});

test('the listing and rules are sent with cache_control', async () => {
  const client = fake([{ text: 'Bedroom 2 is 11 m². There is a lift to all floors.' }]);
  let seen = null;
  const create = client.messages.create.bind(client.messages);
  client.messages.create = (req) => { seen = req; return create(req); };
  await reply({ listing, branch, enquiry: 'size?', client });
  assert.equal(seen.system[0].cache_control.type, 'ephemeral');
});

test('no tool exists for the three things that have no safe version', async () => {
  const client = fake([{ text: 'Bedroom 2 is 11 m². There is a lift to all floors.' }]);
  let seen = null;
  const create = client.messages.create.bind(client.messages);
  client.messages.create = (req) => { seen = req; return create(req); };
  await reply({ listing, branch, enquiry: 'size?', client });

  const names = seen.tools.map((t) => t.name);
  for (const forbidden of ['recommend_area', 'estimate_value', 'check_affordability']) {
    assert.equal(names.includes(forbidden), false,
      `${forbidden} must not exist — a tool the model can reach for is one it will use`);
  }
});
