/**
 * The four tools.
 *
 * Each one exists to take a decision away from the model that the model should
 * not be making — the same principle as every other agent here, applied to a
 * domain where the wrong decision is unlawful rather than merely wrong.
 *
 * Note what is NOT a tool. There is no `recommend_area`, no `estimate_value`,
 * no `check_affordability`. Those are not missing features; a tool the model
 * can reach for is a thing the model will eventually use, and none of those
 * three has a safe version.
 */

export function toolsFor(listing, branch = {}) {
  return [
    {
      name: 'check_viewing_slots',
      description:
        'Return the viewing slots this property has free in the next fourteen days. ' +
        'Call this before mentioning any time. It returns what the diary holds — you ' +
        'may offer a slot, you may never confirm one.',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Earliest date to look from, YYYY-MM-DD.' },
          preference: {
            type: 'string',
            enum: ['any', 'weekday', 'weekend', 'evening'],
            description: 'Only what the enquirer asked for. Never inferred from anything about them.',
          },
        },
        required: [],
      },
    },

    {
      name: 'get_listing_detail',
      description:
        'Look up one field of the listing that is not in the summary above — floor area of a ' +
        'specific room, service charge, energy rating, lease length, what is included. Returns ' +
        'known:false when the agency has not recorded it, and then you say you will confirm it ' +
        'rather than estimating.',
      input_schema: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'What is being asked about, in plain words.' },
        },
        required: ['field'],
      },
    },

    {
      name: 'record_requirements',
      description:
        'Record what the enquirer says they are looking for, so a colleague can match them to ' +
        'other instructions. ONLY the fields below, and only what they volunteered in answer to ' +
        'a question you were permitted to ask. Never record anything about the person.',
      input_schema: {
        type: 'object',
        properties: {
          bedrooms_min: { type: 'integer' },
          outdoor_space: { type: 'boolean' },
          parking: { type: 'boolean' },
          /*
           * Access needs are recorded because recording them HELPS — a
           * colleague can filter out third-floor walk-ups before wasting the
           * person's Saturday. It is a requirement of the property, in the
           * same column as parking.
           */
          step_free_access: { type: 'boolean' },
          timeframe: {
            type: 'string',
            enum: ['now', 'within_3_months', 'within_6_months', 'just_looking', 'not_said'],
          },
          has_property_to_sell: { type: 'boolean' },
          property_under_offer: { type: 'boolean' },
          spoken_to_broker: { type: 'boolean' },
          notes: {
            type: 'string',
            description:
              'What they said about the PROPERTY they want, in their own words. Never about ' +
              'themselves, their household, their job, their income, or their circumstances.',
          },
        },
        required: [],
      },
    },

    {
      name: 'escalate_to_agent',
      description:
        'Hand the enquiry to a person, with a summary. Call this whenever the listing does not ' +
        'answer the question, the enquiry is on the escalation list, or answering would require ' +
        'you to touch RULE ZERO. Always also tell the enquirer that a colleague will come back ' +
        'to them.',
      input_schema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['unknown_fact', 'offer_or_negotiation', 'legal_or_survey', 'chain_or_contract',
                   'existing_sale_or_tenancy', 'complaint', 'area_comparison',
                   'protected_characteristic', 'data_request', 'unsupported_language', 'other'],
          },
          summary: {
            type: 'string',
            description:
              'Two or three sentences for the colleague: what the enquirer wants and what is ' +
              'needed from them. About the enquiry, never about the enquirer.',
          },
          enquirer_language: { type: 'string', description: 'ISO code of the language they wrote in.' },
        },
        required: ['reason', 'summary'],
      },
    },
  ];
}

/**
 * Fields `record_requirements` is allowed to persist.
 *
 * Enforced here rather than trusted to the schema, because a model that
 * invents a field name is a model that has decided to record something it was
 * not asked to. Under GDPR that is a breach whether or not anyone reads it.
 */
const RECORDABLE = new Set([
  'bedrooms_min', 'outdoor_space', 'parking', 'step_free_access',
  'timeframe', 'has_property_to_sell', 'property_under_offer',
  'spoken_to_broker', 'notes',
]);

export async function runTool(listing, branch, name, input, ctx) {
  switch (name) {
    case 'check_viewing_slots': {
      const slots = (branch.diary ?? []).filter((s) => !s.taken);
      return slots.length
        ? { known: true, slots: slots.slice(0, 4).map((s) => s.when) }
        : { known: false, note: 'No free slots recorded — escalate and let a colleague arrange it.' };
    }

    case 'get_listing_detail': {
      const key = String(input.field ?? '').toLowerCase().replace(/\s+/g, '_');
      const facts = { ...(listing.facts ?? {}) };
      const hit = Object.entries(facts).find(([k]) => k.toLowerCase() === key);
      return hit
        ? { known: true, field: hit[0], value: hit[1] }
        : { known: false, field: input.field };
    }

    case 'record_requirements': {
      const kept = {};
      const refused = [];
      for (const [k, v] of Object.entries(input ?? {})) {
        if (RECORDABLE.has(k)) kept[k] = v;
        else refused.push(k);
      }
      ctx.requirements = { ...(ctx.requirements ?? {}), ...kept };
      return refused.length
        ? { recorded: Object.keys(kept), refused, note: 'Fields outside the permitted set were discarded, not stored.' }
        : { recorded: Object.keys(kept) };
    }

    case 'escalate_to_agent':
      ctx.escalations.push({ at: new Date().toISOString(), ...input });
      return { delivered: true, to: branch.name ?? 'the office' };

    default:
      return { error: `No such tool: ${name}` };
  }
}

export { RECORDABLE };
