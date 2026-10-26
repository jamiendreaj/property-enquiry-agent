/**
 * Which law this branch operates under.
 *
 * The shape of the agent does not change between jurisdictions. What changes
 * is which list of protected characteristics applies, which offences are named
 * separately, and — in Europe — what the agent is allowed to WRITE DOWN about
 * the person it is talking to.
 *
 * That last part is the one people miss. Anti-discrimination law governs who
 * you may treat differently. GDPR governs what you may collect at all. An
 * agent that qualifies buyers does both at once, and only one of them is
 * obvious.
 *
 * A branch sets `jurisdiction: 'eu' | 'us'`. There is no default: a reply that
 * might be unlawful in one place and fine in another is not something to guess
 * at, so `resolve()` throws rather than pick.
 */

export const JURISDICTIONS = {
  us: {
    id: 'us',
    label: 'United States — Fair Housing Act',
    /*
     * 42 U.S.C. §3604. Seven federal classes. States and cities add more —
     * source of income, sexual orientation and age are protected in many
     * jurisdictions and in none of the federal text — so `extra` is where a
     * branch names what its own state adds.
     */
    protected: ['race', 'colour', 'national origin', 'religion', 'sex',
                'familial status', 'disability'],
    /*
     * The ordinary-reader test: whether the writer MEANT to express a
     * preference is irrelevant. What matters is whether an ordinary reader
     * could take it that way. This is why the guardrail is deliberately broad.
     */
    intentIrrelevant: true,
    /* Named as separate offences in US law, and the ones agencies get sued for. */
    namedOffences: ['steering', 'blockbusting'],
    dataRegime: null,
    notes: [
      'HUD guidance (2024) applies the Act to tenant-screening algorithms and AI-driven advertising, not only to humans.',
      'Source of income is protected in some states and cities but not federally — set `extraProtected` per branch.',
    ],
  },

  eu: {
    id: 'eu',
    label: 'European Union / Italy',
    /*
     * Directive 2000/43/EC (racial equality) covers access to housing and is
     * implemented in Italy by D.Lgs. 215/2003. Directive 2004/113/EC (sex in
     * goods and services) by D.Lgs. 196/2007 — and the Corte di Cassazione has
     * extended that protection to transgender people, reasoning that gender
     * identity falls within sex.
     *
     * Disability: Legge 67/2006. Nationality: Testo Unico sull'immigrazione
     * art. 43, which bars refusing housing to a lawfully resident foreigner,
     * or imposing worse terms, for being foreign.
     */
    protected: ['racial or ethnic origin', 'religion or belief', 'sex',
                'gender identity', 'sexual orientation', 'disability', 'age',
                'nationality'],
    intentIrrelevant: true,
    /*
     * Steering and blockbusting are not named offences in EU law the way they
     * are in the FHA. They are still caught, as differential treatment — so
     * the checks stay on. The label changes, the behaviour does not.
     */
    namedOffences: [],
    /*
     * GDPR. This is the axis that has nothing to do with discrimination.
     *
     * Every qualifying question produces personal data about an identifiable
     * person. Asking it needs a lawful basis; keeping it needs a retention
     * limit; and asking for more than the purpose requires is a breach on its
     * own, however politely it is phrased.
     */
    dataRegime: {
      id: 'gdpr',
      lawfulBasis: 'legitimate interest — responding to an enquiry the person initiated',
      /* Data minimisation: what the agent may ask for at all. */
      mayAsk: ['timeframe for moving', 'whether they have a property to sell',
               'whether that property is under offer',
               'whether they have spoken to a mortgage adviser',
               'what they are looking for — rooms, area, outdoor space, parking'],
      /*
       * What it may never ask, because the purpose does not require it. Income
       * is the trap: verifying ability to pay is lawful for a landlord, but it
       * is the AGENCY's job at offer stage, not a chatbot's at enquiry stage.
       */
      mustNotAsk: ['salary or income', 'employer or job title', 'bank details',
                   'date of birth', 'nationality or immigration status',
                   'household composition', 'health or disability',
                   'identity documents'],
      retentionDays: 90,
      rights: ['access', 'rectification', 'erasure', 'objection'],
    },
    notes: [
      'Verifying ability to pay is lawful at offer stage. It is not the enquiry agent\'s job, and asking early turns a courtesy into a screen.',
      'Cassazione has applied the sex-discrimination rules to a refused lease to a transgender person.',
    ],
  },
};

/** Resolve a branch's jurisdiction. Throws rather than guess. */
export function resolve(branch = {}) {
  const id = branch.jurisdiction;
  if (!id) {
    throw new Error(
      'This branch has no `jurisdiction`. Set "eu" or "us" — the protected ' +
      'characteristics and the data rules differ, and guessing is not safe.',
    );
  }
  const j = JURISDICTIONS[String(id).toLowerCase()];
  if (!j) {
    throw new Error(`Unknown jurisdiction "${id}". Known: ${Object.keys(JURISDICTIONS).join(', ')}.`);
  }
  // A branch may add what its own state or region protects beyond the baseline.
  const extra = branch.extraProtected ?? [];
  return { ...j, protected: [...j.protected, ...extra] };
}

/** The prompt section for this jurisdiction. Built, never hand-written twice. */
export function rulesFor(j) {
  const lines = [];
  lines.push(`You operate under: ${j.label}.`);
  lines.push('');
  lines.push('You NEVER describe, refer to, infer, or take into account any of the');
  lines.push('following about an enquirer, an occupant, a neighbour, or the people in');
  lines.push('an area:');
  for (const p of j.protected) lines.push(`  · ${p}`);

  if (j.intentIrrelevant) {
    lines.push('');
    lines.push('Whether you MEANT to express a preference is irrelevant. The test is');
    lines.push('whether an ordinary reader could take it that way. Assume they can.');
  }

  if (j.dataRegime?.id === 'gdpr') {
    const g = j.dataRegime;
    lines.push('');
    lines.push('════════ DATA — GDPR ════════');
    lines.push('');
    lines.push('Everything the enquirer tells you is personal data about an identifiable');
    lines.push(`person. Your lawful basis is: ${g.lawfulBasis}.`);
    lines.push('');
    lines.push('You may ask about:');
    for (const a of g.mayAsk) lines.push(`  · ${a}`);
    lines.push('');
    lines.push('You NEVER ask for, and never repeat back:');
    for (const a of g.mustNotAsk) lines.push(`  · ${a}`);
    lines.push('');
    lines.push('Ask only what answering THIS enquiry requires. Anything more is a breach');
    lines.push('however politely it is phrased. If they volunteer something on the second');
    lines.push('list, do not acknowledge it, do not repeat it, and do not record it.');
    lines.push('');
    lines.push(`If asked, tell them their details are kept for ${g.retentionDays} days and that they`);
    lines.push(`can ask to ${g.rights.join(', ')} at any time — then escalate so a person handles it.`);
  }

  return lines.join('\n');
}
