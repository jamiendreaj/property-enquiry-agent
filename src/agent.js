import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import { toolsFor, runTool } from './tools.js';
import { check } from './guardrails.js';
import { resolve } from './jurisdiction.js';

export const MODEL = 'claude-sonnet-5';
export const MAX_TOKENS = 1600;
const MAX_TURNS = 8;

/**
 * A ceiling on what one enquiry may cost, in tokens rather than money so it
 * stays true when prices change. A tool loop is where spend runs away: the
 * model calls a tool, dislikes the answer, calls it again, and every turn
 * resends the whole conversation.
 */
export const DEFAULT_TOKEN_BUDGET = 60_000;

/** Why a draft cannot be sent. Null when it can. */
function blockedBecause({ stop, text, verdict }) {
  if (stop === 'budget_exhausted') return 'The token budget ran out before the model finished.';
  if (stop === 'max_tokens') return 'The model hit max_tokens and the reply is cut off.';
  if (stop === 'refusal') return 'The model refused to answer.';
  if (stop === 'max_turns') return 'The tool loop ran out of turns without producing a reply.';
  if (stop !== 'end_turn') return `The model stopped for an unrecognised reason: ${stop}.`;
  if (!text.length) {
    // A model can finish cleanly and still return no text block — reasoning
    // consumed the output budget. Reading content[0].text here throws an error
    // that says nothing about the cause.
    return 'The model finished but produced no text, usually because reasoning consumed the output budget.';
  }
  if (!verdict.ok) {
    const rules = verdict.issues.filter((i) => i.severity === 'block').map((i) => i.rule);
    // RULE ZERO failures are named first and named plainly, because the person
    // reviewing the queue needs to know which of these is a legal problem and
    // which is a typo.
    const grave = rules.filter((r) =>
      ['protected_characteristic', 'steering', 'blockbusting'].includes(r));
    return grave.length
      ? `RULE ZERO — ${grave.join(', ')}. Do not send. This reply needs a person.`
      : `Guardrails blocked it: ${rules.join(', ')}.`;
  }
  return null;
}

/**
 * One enquiry in, one draft out.
 *
 * Returns the draft rather than sending it. Nothing in this file touches a
 * mail server — approval mode is the default and sending is deliberately
 * somebody else's job.
 */
export async function reply({
  listing,
  branch,
  enquiry,
  mode = 'approve',
  expectLanguage = null,
  client,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
}) {
  // Throws when the branch has not said where it operates. A reply that is
  // lawful in one jurisdiction and not in another is not a thing to default.
  const jurisdiction = resolve(branch);

  const anthropic = client ?? new Anthropic();
  const started = Date.now();

  const system = buildSystemPrompt(listing, { mode, branch });
  const tools = toolsFor(listing, branch);
  const ctx = { escalations: [], requirements: {} };

  const messages = [{ role: 'user', content: enquiry }];
  const toolResults = [];
  const toolCalls = [];
  let usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let stop = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // The listing and the rules are identical for every enquiry about this
      // property, so they are worth caching. The enquiry itself is not.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    });

    usage = {
      input: usage.input + (res.usage?.input_tokens ?? 0),
      output: usage.output + (res.usage?.output_tokens ?? 0),
      cache_read: usage.cache_read + (res.usage?.cache_read_input_tokens ?? 0),
      cache_write: usage.cache_write + (res.usage?.cache_creation_input_tokens ?? 0),
    };
    stop = res.stop_reason;
    messages.push({ role: 'assistant', content: res.content });

    if (stop === 'refusal' || stop === 'max_tokens') break;

    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) break;

    // Checked before running the tools: a tool result goes back as input on
    // the next turn, so continuing past the ceiling spends again.
    const spent = usage.input + usage.output + usage.cache_read + usage.cache_write;
    if (spent >= tokenBudget) { stop = 'budget_exhausted'; break; }
    if (turn === MAX_TURNS - 1) { stop = 'max_turns'; break; }

    const results = [];
    for (const u of uses) {
      let out;
      try {
        out = await runTool(listing, branch, u.name, u.input, ctx);
      } catch (err) {
        out = { error: String(err?.message ?? err) };
      }
      toolCalls.push({ name: u.name, input: u.input, output: out });
      toolResults.push(out);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }

  const text = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((b) => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');

  const verdict = check(text, { toolResults, listing, expectLanguage });
  const reason = blockedBecause({ stop, text, verdict });

  /*
   * Whether anything the model TRIED to record was refused.
   *
   * Surfaced on the result rather than buried in the tool log, because a model
   * reaching for a salary field is a signal about the prompt, not a curiosity.
   * Under GDPR it is also the thing an auditor asks about.
   */
  const refusedFields = toolCalls
    .filter((t) => t.name === 'record_requirements')
    .flatMap((t) => t.output?.refused ?? []);

  return {
    draft: text,
    stop_reason: stop,
    truncated: stop === 'max_tokens',
    refused: stop === 'refusal',
    budget_exhausted: stop === 'budget_exhausted',
    tool_calls: toolCalls,
    escalations: ctx.escalations,
    escalated: ctx.escalations.length > 0,
    requirements: ctx.requirements,
    refused_fields: refusedFields,
    guardrails: verdict,
    jurisdiction: jurisdiction.id,
    /** A reply only goes out if the model finished AND the guardrails passed. */
    sendable: reason === null,
    /** Null when sendable; otherwise one sentence a human can act on. */
    blocked_because: reason,
    mode,
    latency_ms: Date.now() - started,
    usage,
    token_budget: tokenBudget,
    tokens_used: usage.input + usage.output + usage.cache_read + usage.cache_write,
  };
}
