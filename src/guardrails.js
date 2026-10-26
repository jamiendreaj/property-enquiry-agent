/**
 * A second pair of eyes on the finished reply.
 *
 * The prompt tells the model what not to do; this checks whether it did it
 * anyway. In this domain the expensive failures are not the obvious ones.
 *
 * The obvious ones are a price nobody authorised and a viewing confirmed that
 * was never booked. Those are embarrassing.
 *
 * The one that ends a business is screening on a protected characteristic. An
 * agent that qualifies buyers is one careless inference away from unlawful
 * discrimination, and the reply that does it will not look malicious — it will
 * look helpful. "This block is mostly young professionals, so it might not suit
 * a family" is a sentence a well-meaning human writes, and it is illegal in
 * most of the world.
 *
 * So that check is first, it is a block, and no tone setting or instruction in
 * a listing can switch it off.
 */

/* ── 1. protected characteristics ─────────────────────────────────────── */

/**
 * Words that describe a person rather than a property.
 *
 * Deliberately broad: a false positive costs a human thirty seconds of review,
 * a false negative costs a discrimination claim. Matching is on the REPLY, not
 * the enquiry — a guest may volunteer anything about themselves, and the agent
 * is allowed to have read it. It is simply not allowed to act on it.
 */
const PROTECTED = [
  // ── race, colour, ethnicity, national origin ──
  /\b(?:race|racial|colou?red|ethnic\w*|nationalit\w*|foreign(?:er|ers)?|immigrant\w*|expat\w*|asian|african|arab|eastern\s+european|romanian|albanian)\b/i,
  // ── religion or belief ──
  /\b(?:religio\w*|faith|muslim|islam\w*|jewish|judaism|christian|catholic|protestant|hindu|sikh|buddhist|atheist)\b/i,
  // ── sex, gender identity, sexual orientation ──
  /\b(?:gay|lesbian|homosexual|bisexual|transgender|trans\s+(?:man|woman|people)|same[- ]sex|sexual\s+orientation|gender\s+identity)\b/i,
  /\b(?:(?:men|women|males?|females?|girls?|boys?)\s+only|no\s+(?:men|women|males|females))\b/i,
  // ── disability ──
  /\b(?:disabled|disabilit\w*|handicap\w*|wheelchair\s+user|impair(?:ed|ment)|mental\s+health\s+(?:issues|problems))\b/i,
  // ── age ──
  /\b(?:elderly|pensioner\w*|retired|over\s+\d{2}s?\s+only|under\s+\d{2}s?\s+only|young\s+(?:couple|professional|people|person)|students?|mature\s+(?:tenant|couple))\b/i,
  // ── family status, pregnancy ──
  /\b(?:famil(?:y|ies)|children|kids|child|baby|babies|toddler\w*|pregnan\w*|single\s+(?:mother|father|parent)|no\s+(?:kids|children))\b/i,
  // ── marital status ──
  /\b(?:married|unmarried|single|divorced|widowed)\s+(?:couples?|tenants?|applicants?|persons?|occupants?)\b/i,
  /\b(?:no\s+(?:single|unmarried)|marital\s+status|divorc\w*|widow\w*)\b/i,
  // ── source of income. "No DSS" was ruled discriminatory in the UK; the
  //    phrasing survives in listings everywhere and is still unlawful. ──
  /\b(?:no\s+)?(?:DSS|housing\s+benefit|universal\s+credit|benefits?\s+claimants?|social\s+housing\s+tenants?|working\s+(?:professionals?|tenants?)\s+only|employed\s+only)\b/i,
  // ── the coded phrasing, which is how this usually happens ──
  //    Nobody writes "no families". They write "better suited to".
  /\b(?:suitable\s+for|ideal\s+for|not\s+suitable\s+for|better\s+suited\s+to|perfect\s+for|aimed\s+at)\s+(?:a\s+|the\s+)?(?:young|old|elder|famil|single|student|professional|retired|couple)/i,
  /\b(?:this\s+area|the\s+area|the\s+building|the\s+block|the\s+neighbourhood|the\s+neighborhood|the\s+street)\s+is\s+(?:mostly|mainly|predominantly|largely|very)\b/i,
  /\b(?:fit\s+in\s+(?:well\s+)?(?:here|there)|the\s+right\s+sort|the\s+right\s+kind\s+of|people\s+like\s+you|our\s+kind\s+of|your\s+type)\b/i,
];

/**
 * Accessibility is the exception, and it matters.
 *
 * A step-free entrance or a lift is a FACT ABOUT THE BUILDING. Refusing to
 * state it would itself disadvantage a disabled buyer, which is the opposite
 * of the rule's purpose. So a reply may describe the property's access; it may
 * not describe who the property is for.
 */
const ACCESS_FACT = /\b(?:step[- ]free|level\s+access|lift|elevator|ground\s+floor|ramp|stairlift|accessible\s+(?:entrance|bathroom|parking))\b/i;

/**
 * Steering: pointing someone toward or away from an area.
 *
 * This is a separate offence from a discriminatory statement and it is the one
 * agents actually get sued for. It needs no slur and no protected word — "I
 * think you'd be happier over in the other part of town" is steering if the
 * reason is who the person is, and an enquirer cannot see the reason. So the
 * agent does not get to make area recommendations at all. It answers about the
 * property it was asked about.
 */
const STEERING = [
  /\byou(?:'d|\s+would|\s+might\s+be)?\s*(?:'d\s+)?be\s+(?:happier|better\s+off|more\s+comfortable)\s+(?:in|over|out|somewhere)/i,
  /*
   * The target has to look like a PLACE, not any noun. Without that,
   * "I'd suggest you look at the floorplan" trips a discrimination guardrail,
   * and a guardrail that cries wolf gets switched off.
   *
   * Two patterns, because one cannot do both jobs: a proper noun needs a
   * case-SENSITIVE match, and "somewhere else" needs a case-insensitive one.
   * Folding them into a single /i pattern makes [A-Z] meaningless.
   */
  /(?:suggest|recommend)\w*\s+(?:you\s+)?(?:look|looking|trying)\s+(?:at|in|around)\s+[A-Z]/,
  /\b(?:look|looking|trying)\s+(?:at|in|around)\s+(?:another|other|a\s+different|somewhere|elsewhere)/i,
  /\b(?:look|looking)\s+(?:at|in|around)\s+[\w'-]+\s+instead\b/i,
  /\b(?:not\s+(?:really\s+)?the\s+right\s+(?:area|part\s+of\s+town|neighbou?rhood)\s+for\s+you)\b/i,
  /\b(?:that\s+(?:area|part)\s+(?:would|might)\s+suit\s+you\s+(?:better|more))\b/i,
  /\b(?:have\s+you\s+(?:considered|thought\s+about)\s+looking\s+(?:somewhere|elsewhere|further))\b/i,
];

/**
 * Blockbusting: claims that who is moving into an area will change what it is
 * worth, how safe it is, or how good the schools are. Prohibited outright, and
 * the agent has no business commenting on any of the three in any case.
 */
const BLOCKBUSTING = [
  /\b(?:property\s+(?:values|prices)\s+(?:are|will|have\s+been)\s+(?:falling|dropping|rising|going))\b/i,
  /\b(?:crime|safety|the\s+schools?)\s+(?:is|are|has|have|had)(?:\s+been)?\s+(?:getting|got|gone|become)?\s*(?:worse|better|bad|rough)\b/i,
  /\b(?:the\s+(?:area|neighbou?rhood|street)\s+is\s+(?:changing|going\s+downhill|improving|being\s+taken\s+over))\b/i,
  /\b(?:before\s+(?:prices|values)\s+(?:drop|fall)|while\s+you\s+still\s+can)\b/i,
];

/* ── 2. price ─────────────────────────────────────────────────────────── */

const PRICE = /(?:€|EUR\s?|£|\$)\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|euro|EUR|£|\$)/gi;

function numbersIn(text) {
  const out = new Set();
  for (const m of text.matchAll(PRICE)) {
    const raw = (m[1] ?? m[2] ?? '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

function authorisedNumbers(toolResults, listing) {
  const ok = new Set();
  /*
   * Walk for RAW numbers, not for currency-marked strings.
   *
   * The first version scanned the listing as text, which meant an asking price
   * stored as `285000` was invisible — JSON carries no currency symbol — and
   * the agent was blocked from stating the one price it is actually allowed to
   * state. Numbers in the listing and numbers in a tool result are the same
   * kind of authority and are collected the same way.
   */
  const walk = (v) => {
    if (typeof v === 'number') ok.add(v);
    else if (typeof v === 'string') for (const n of numbersIn(v)) ok.add(n);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  toolResults.forEach(walk);
  walk(listing ?? {});
  return ok;
}

/* ── 3. things only a human may say ───────────────────────────────────── */

/** Confirming a viewing the diary never booked. */
const CONFIRMS_VIEWING = [
  /\b(?:i|we)\s+(?:have\s+)?(?:booked|confirmed|reserved|scheduled|arranged)\s+(?:you|your|the)\b/i,
  /\byour\s+viewing\s+is\s+(?:now\s+)?(?:booked|confirmed|arranged)\b/i,
  /\b(?:ho|abbiamo)\s+(?:fissato|confermato|prenotato)\b/i,
];

/**
 * Mortgage and financial advice, which is a regulated activity almost
 * everywhere. Saying "you could probably borrow that" is not a helpful
 * observation, it is unlicensed advice.
 */
const FINANCIAL_ADVICE =
  /\b(?:you\s+(?:could|should|can|will|would)\s+(?:probably\s+|easily\s+)?(?:be\s+able\s+to\s+)?(?:borrow|afford|get\s+a\s+mortgage|stretch\s+to)|i(?:'| a)?m\s+sure\s+(?:you|the\s+bank|they)|you\s*(?:'ll|\s+will)\s+qualify|remortgag\w*\s+and)\b/i;

/** A valuation the agent is not instructed to give. */
const VALUATION =
  /\b(?:it\s+(?:is|'s)\s+(?:worth|valued\s+at)|its\s+worth|i(?:'d|\s+would)\s+value\s+it|will\s+(?:appreciate|go\s+up|rise)|guaranteed\s+(?:return|yield)|under(?:priced|valued)|below\s+market)\b/i;

/** Chasing money outside the process. */
const PAYMENT =
  /\b(?:card\s+number|cvv|iban|bank\s+transfer\s+to|holding\s+deposit\s+to\s+my|numero\s+di\s+carta)\b/i;

/* ── the check ────────────────────────────────────────────────────────── */

export function check(reply, { toolResults = [], listing = {}, expectLanguage = null } = {}) {
  const issues = [];
  const add = (rule, severity, detail) => issues.push({ rule, severity, detail });

  // 1. Protected characteristics. First, because it is the one that ends a
  //    business rather than embarrassing it.
  for (const re of PROTECTED) {
    const hit = reply.match(re);
    if (!hit) continue;
    /*
     * A sentence about step-free access is a fact about the building, so it is
     * exonerated — but only if that is ALL it is doing.
     *
     * "There is a lift, so it would suit a disabled buyer" contains an access
     * fact and a judgement about a person in one breath. The first version
     * exonerated the whole sentence on the strength of the word "lift", which
     * turned the exception into a loophole.
     */
    const sentence = sentenceAround(reply, hit.index ?? 0);
    const judgesAPerson = /\b(?:suit|suits|suited|ideal|perfect|right|good)\s+(?:for|to)?\s*(?:a|an|the|any)?\s*\w*\s*(?:buyer|tenant|person|family|couple|applicant)\b/i.test(sentence);
    if (ACCESS_FACT.test(sentence) && !judgesAPerson) continue;
    add('protected_characteristic', 'block',
      `The reply describes people, not the property: "${hit[0]}".`);
    break;
  }

  // 1b. Steering, which needs no protected word to be unlawful.
  for (const re of STEERING) {
    const hit = reply.match(re);
    if (hit) { add('steering', 'block', `Directs the enquirer elsewhere: "${hit[0].trim()}".`); break; }
  }

  // 1c. Blockbusting.
  for (const re of BLOCKBUSTING) {
    const hit = reply.match(re);
    if (hit) { add('blockbusting', 'block', `Claims about area, value, crime or schools: "${hit[0].trim()}".`); break; }
  }

  // 2. A price nobody authorised.
  const authorised = authorisedNumbers(toolResults, listing);
  for (const n of numbersIn(reply)) {
    if (!authorised.has(n)) {
      add('unauthorised_price', 'block', `States ${n}, which no tool or listing returned.`);
    }
  }

  // 3. A viewing it cannot have booked.
  if (CONFIRMS_VIEWING.some((re) => re.test(reply))) {
    add('confirmed_viewing', 'block', 'The reply appears to confirm a viewing.');
  }

  // 4. Regulated advice.
  if (FINANCIAL_ADVICE.test(reply)) {
    add('financial_advice', 'block', 'The reply gives mortgage or affordability advice.');
  }
  if (VALUATION.test(reply)) {
    add('valuation_claim', 'block', 'The reply makes a valuation or return claim.');
  }

  // 5. Money outside the process.
  if (PAYMENT.test(reply)) {
    add('payment_detail', 'block', 'The reply mentions card, bank or deposit details.');
  }

  // 6. Hedging, which usually marks a fact the listing did not contain.
  if (/\b(?:usually|typically|normally|i\s+think|probably|should\s+be\s+fine)\b/i.test(reply)) {
    add('hedged_fact', 'warn', 'Hedging often marks something the listing did not say.');
  }

  return { ok: !issues.some((i) => i.severity === 'block'), issues };
}

/** The sentence a match sits in, so context can exonerate it. */
function sentenceAround(text, index) {
  const start = text.lastIndexOf('.', index) + 1;
  const end = text.indexOf('.', index);
  return text.slice(start, end === -1 ? text.length : end + 1);
}

export { PROTECTED, ACCESS_FACT, STEERING, BLOCKBUSTING };
