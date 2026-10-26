# property-enquiry-agent

Answers property enquiries and qualifies viewings for estate agents. Grounded
only in the listing, and structurally unable to screen on a protected
characteristic.

```bash
npm test                 # 37 tests, offline, no API key
npm run reply -- --enquiry "How big is the second bedroom, and is there a lift?"
```

---

## Why this one is different

Most of what an enquiry agent does is ordinary: answer a question, offer a
viewing slot, hand the hard ones to a person. Three of the rules here protect
an agency from embarrassment.

**One protects it from a court.**

An agent that qualifies buyers is one careless inference away from unlawful
discrimination, and the reply that does it will not look malicious — it will
look *helpful*. *"This block is mostly young professionals, so it might not
suit a family"* is a sentence a well-meaning human writes, and it is unlawful
in most of the world.

So that rule is called RULE ZERO, it is stated first, it is enforced in code
after the model has finished, and nothing in a branch config can switch it off.

The reasoning and the sources are in **[LEGAL.md](LEGAL.md)**.

---

## Jurisdiction is configuration, not a fork

A reply that is lawful in Texas and unlawful in Turin is not something to
default, so a branch must say where it operates. `resolve()` **throws** if it
does not.

| | **US** | **EU / Italy** |
| --- | --- | --- |
| Basis | Fair Housing Act, 7 federal classes | D.Lgs. 215/2003, 196/2007, L. 67/2006, TU immigrazione art. 43 |
| Named offences | steering, blockbusting | caught as differential treatment |
| Source of income | protected in some states — `extraProtected` | — |
| Gender identity | within sex | within sex (Cassazione) |
| **Data** | — | **GDPR** |

GDPR is a second axis, and the one people miss. Anti-discrimination law governs
*who you may treat differently*. GDPR governs *what you may collect at all*.
This agent is held to both.

```json
{ "name": "Esempio, Torino", "jurisdiction": "eu", "languages": ["it", "en"] }
```

---

## RULE ZERO, in one line

**Describe the property. Never the people.**

*"A playground is two minutes away"* is a fact about a location.
*"Great for families"* is a statement about who belongs there.

The guardrail catches four ways that goes wrong:

| Rule | Catches |
| --- | --- |
| `protected_characteristic` | Race, colour, ethnicity, nationality, religion, sex, gender identity, sexual orientation, disability, age, family status, marital status, source of income — stated **or coded**. *"Better suited to…"*, *"the area is mostly…"*, *"working professionals only"*, *"no DSS"*. |
| `steering` | Directing someone toward or away from an area. Needs no protected word to be unlawful. |
| `blockbusting` | Claims that who lives somewhere affects prices, crime or schools. |
| — | **Intent is irrelevant.** The test is whether an ordinary reader could take it as a preference. The checks lean broad on purpose. |

### The exception that runs the other way

**Accessibility is a fact about the building and the agent must state it.**

A naive discrimination filter blocks the word "wheelchair" and thereby
disadvantages the disabled buyer it was written to protect. So the agent may
describe step-free access, a lift, a ground-floor bathroom, doorway widths,
distance to parking — and may never describe who the property suits.

Getting the exception right was harder than getting the rule right:

```
"There is step-free access and a lift to every floor."        → allowed
"There is a lift, so it would suit a disabled buyer."         → blocked
```

The first version exonerated the second sentence, because it contained the word
"lift". One sentence, an access fact and a judgement about a person in the same
breath. There is a test for it.

---

## The three ordinary rules

1. **Grounding.** Everything factual comes from the listing or a tool result.
   If the listing does not say it, the agent does not know it and escalates.
2. **No pricing, valuing or financial advice.** It states the asking price and
   nothing else. Mortgage advice is a regulated activity.
3. **It does not book.** It can offer a slot from the diary. A person confirms.

---

## Four tools — and three that deliberately do not exist

| Tool | Does |
| --- | --- |
| `check_viewing_slots` | What the diary has free. Offer, never confirm. |
| `get_listing_detail` | One field. Returns `known:false` rather than guessing. |
| `record_requirements` | What they want **in a property**. Allow-listed in code. |
| `escalate_to_agent` | Hands over, with a reason from a fixed list. |

There is no `recommend_area`, no `estimate_value`, no `check_affordability`.
Those are not missing features. **A tool the model can reach for is a tool it
will eventually use**, and none of those three has a safe version.

### Data minimisation is enforced, not requested

`record_requirements` keeps an allow-list in code. Ask it to store a salary and
it does not:

```
record: { recorded: ["bedrooms_min","step_free_access","timeframe"],
          refused:  ["salary","nationality","household"] }
```

Under GDPR, data collected without a purpose is a breach whether or not anyone
reads it. The refusal is surfaced on the result rather than buried in a log,
because a model reaching for a salary field is a signal about the prompt — and
it is the thing an auditor asks about.

---

## Tests

```bash
npm test
```

37 tests, all offline. `reply()` takes an injectable client, so the loop runs
against scripted responses with no API key.

The suite leans hardest on the places this agent can be wrong in a way that
matters:

- **Every protected ground**, stated outright and in its coded form
- **Accessibility allowed** — five phrasings that must pass, plus the one that
  must not
- **Steering and blockbusting**, including three phrasings that must *not* trip
  it. A guardrail that cries wolf gets switched off
- **RULE ZERO reported differently** from an ordinary block, and an ordinary
  block not dressed up as a legal problem
- **Refused fields surfaced** when the model reaches for data it may not keep
- A truncated reply, a refusal, a blown budget, and a clean finish that returns
  no text at all

---

## Layout

```
src/
  jurisdiction.js   which law applies, and the GDPR data rules
  prompt.js         RULE ZERO, built from the jurisdiction
  guardrails.js     the checks that run after the model has finished
  tools.js          four tools, and the allow-list
  agent.js          the loop
  cli.js            one enquiry in, one draft out
  *.test.js         37 tests
listings/           one per property — real ones gitignored
branches/           office config: jurisdiction, languages, diary
LEGAL.md            what the rules were built from, with sources
```

---

## Scope

Not in this repo, and all of it a real phase two: valuations, offers,
negotiation, tenancy management, portal syndication, anything touching a
contract.

**Not legal advice.** [LEGAL.md](LEGAL.md) records what the rules were built
from so that a lawyer can tell me where I am wrong. Any agency deploying this
should have its own counsel read it against its own jurisdiction.

MIT.
