# The legal basis for RULE ZERO

This file exists because the guardrails in this repository make claims about
the law, and a claim about the law that nobody can check is just an assertion
with a citation-shaped hole in it.

**It is not legal advice and I am not a lawyer.** It records what the rules
were built from, so that someone who *is* a lawyer can tell me where I am
wrong. Every agency deploying this should have its own counsel read it against
its own jurisdiction.

---

## Why a chatbot needs this at all

An agent that answers property enquiries and qualifies viewings does two
regulated things at once:

1. It **decides what to say to whom**, which is anti-discrimination law.
2. It **collects information about an identifiable person**, which — in Europe
   — is GDPR.

These are separate. A reply can be perfectly non-discriminatory and still be a
data breach, and vice versa. The agent is held to both.

---

## United States — Fair Housing Act

**Seven protected classes** under 42 U.S.C. §3604: race, colour, national
origin, religion, sex, familial status, disability.

Three things shaped the implementation:

**Intent is irrelevant.** The test applied to advertising is whether an
*ordinary reader* could take the language as expressing a preference related to
a protected class. What the writer meant does not enter into it. This is why
`src/guardrails.js` is deliberately broad and why a false positive is treated
as cheap: a human spends thirty seconds clearing it, where a false negative is
a complaint.

**The coded phrasing is the real risk.** Nobody writes "no families". Published
guidance flags phrases such as *"quiet professional building"*, *"mature
tenants only"* and *"great for empty nesters"* as actionable. The operative
instruction in the prompt is therefore a positive one — **describe the
property, never the people**: *"a playground is two minutes away"* is a fact
about a location; *"great for families"* is a statement about who belongs
there.

**Steering and blockbusting are separate offences**, and they need no protected
word at all.

- *Steering* is directing someone toward or away from an area. Showing one
  group only listings in certain neighbourhoods, or discouraging a buyer from a
  diverse one, is steering — as is withholding what is available somewhere.
  The agent therefore makes **no area recommendations of any kind** and
  escalates any request to compare neighbourhoods.
- *Blockbusting* is inducing sales by suggesting who is moving in will change
  property values, crime, or schools. The agent comments on none of those three.

**Algorithms are covered.** HUD guidance issued in 2024 applies the Act to
tenant-screening algorithms and AI-driven advertising, not only to humans. That
is this software.

**Source of income is not federal.** It is protected in many states and cities
and in none of the federal text, which is why `extraProtected` exists on the
branch config rather than being baked in.

---

## European Union and Italy

| Ground | Instrument | Italian implementation |
| --- | --- | --- |
| Racial / ethnic origin | Directive 2000/43/EC | D.Lgs. 215/2003 |
| Sex (goods and services) | Directive 2004/113/EC | D.Lgs. 196/2007 |
| Disability | — | Legge 67/2006 |
| Nationality | — | Testo Unico sull'immigrazione, art. 43 |

Directive 2000/43/EC expressly covers **access to housing**, which is what puts
an enquiry agent inside its scope rather than beside it.

**Gender identity sits within sex.** The Corte di Cassazione applied the
sex-discrimination rules to a refused lease to a transgender person, reasoning
that gender identity falls within sex. The EU protected list therefore names
gender identity explicitly rather than leaving it to inference.

**Nationality.** Art. 43 of the Testo Unico bars refusing housing to a lawfully
resident foreigner, or imposing worse terms, *for being foreign*.

**Steering and blockbusting are not named offences** in EU law the way they are
in the FHA. They are still caught, as differential treatment. The checks stay
on in both jurisdictions — only the label changes.

---

## GDPR — the axis that is not about discrimination

Every qualifying question produces personal data about an identifiable person.

- **Lawful basis:** legitimate interest — responding to an enquiry the person
  initiated. Not consent, which they have not given and cannot freely withhold
  while asking you a question.
- **Data minimisation:** asking for more than the purpose requires is a breach
  on its own, however politely it is phrased. `src/jurisdiction.js` holds an
  explicit `mayAsk` and `mustNotAsk` list rather than a principle, because a
  principle invites the model to weigh it.
- **Retention:** 90 days by default, configurable per branch.
- **Rights:** access, rectification, erasure, objection. Any such request
  escalates to a person — the agent does not handle them itself.

**The trap is income.** Verifying what someone can pay is lawful — but it is
the agency's job at offer stage, not a chatbot's at enquiry stage. Asking early
turns a courtesy into a screen, and the answer is data you then have to justify
holding. So the agent may ask *"have you spoken to a mortgage adviser?"* and
may never ask what anyone earns.

---

## What this does not cover

- **UK.** The Equality Act 2010 is not implemented here. Its protected
  characteristics differ from both lists above and it would need its own entry
  in `src/jurisdiction.js`.
- **Any US state or city additions** beyond the federal seven, which belong in
  `extraProtected`.
- **Anything outside the EU, Italy and the US.** `resolve()` throws rather than
  guess, by design.

---

## Sources

Secondary sources, read 26 October 2026. Several are industry or training
material rather than primary law — they were used to find the shape of the
problem, not to settle it. Anyone relying on this should check HUD's own
advertising guidance, the directives, and Normattiva for the current Italian
text.

- [National Fair Housing Alliance — Responsible Advertising](https://nationalfairhousing.org/responsibleadvertising/)
- [Fair housing rental advertising: language that creates liability](https://alleastbayproperties.com/fair-housing-rental-advertising-rules/)
- [Steering in fair housing — what it is and why it is illegal](https://www.lexawise.com/what-is-steering-in-fair-housing)
- [Fair Housing Act guidelines, exemptions and penalties](https://fedlaws.org/fair-housing-act-guidelines-discrimination-exemptions-and-penalties/)
- [CIRDI — La discriminazione nell'accesso all'alloggio](https://www.programmaintegra.it/wp/wp-content/uploads/2015/02/Ricerca-accesso-allalloggio-CIRDI.pdf)
- [Affitto negato a disabile — analisi normativa](https://www.condominioweb.com/locazione-disabili.15163)
- [Il padrone di casa può decidere a chi affittare?](https://www.laleggepertutti.it/553188_il-padrone-di-casa-puo-decidere-a-chi-affittare-e-a-chi-no)
- [Locazioni e selezione del reddito — clausole lecite e discriminatorie](https://www.immobiliare.it/news/economia/contratti-e-documenti/locazioni-e-selezione-del-reddito-quali-clausole-di-garanzia-sono-lecite-e-quando-diventano-discriminatorie-486675/)
