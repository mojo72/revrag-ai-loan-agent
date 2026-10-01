// Builds the <app_context> block sent with every agent turn: the agent's live view of the app.

import { FIELDS, FORM_STEPS, STEP_BY_ID, displayValue, fieldError, isEmpty, isRequired, isVisible, maskSensitive, missingFields } from '../../shared/schema';
import { formatINR } from '../../shared/products';
import { currentStep } from '../state/actions';
import { completedSteps } from '../state/journey';
import { currentEligibility, useApp } from '../state/store';
import { currentLanguage } from '../voice/language';

export function buildContext(opts: { voiceMuted?: boolean } = {}): string {
  const s = useApp.getState();
  const d = s.data;
  const step = currentStep();
  const def = STEP_BY_ID[step];
  const e = currentEligibility(s);

  const fields = def.fields
    .filter((id) => isVisible(FIELDS[id], d))
    .map((id) => {
      const err = fieldError(id, d);
      const v = isEmpty(d[id]) ? null : maskSensitive(id, displayValue(id, d));
      return { id, label: FIELDS[id].label, value: v, required: isRequired(FIELDS[id], d), status: err ? (v === null ? 'missing' : `invalid: ${err}`) : 'ok' };
    });

  const missingElsewhere = Object.fromEntries(
    FORM_STEPS.filter((fs) => fs.id !== step)
      .map((fs) => [fs.id, missingFields(fs.id, d)] as const)
      .filter(([, m]) => m.length > 0),
  );

  const ctx = {
    screen: step,
    screen_title: def.title,
    screen_purpose: def.purpose,
    fields_on_screen: fields,
    buttons_on_screen: ['next', 'back', ...def.actions.map((a) => a.id)],
    completed_steps: completedSteps(),
    missing_on_other_screens: missingElsewhere,
    eligibility: e
      ? { eligible: e.eligible, max_eligible_amount: formatINR(e.maxEligibleAmount), indicative_rate: `${e.indicativeRate}%`, emi_for_requested: e.emiForRequested ? formatINR(e.emiForRequested) : null, reasons: e.reasons }
      : s.eligibility
        ? 'stale: inputs changed since the last check, re-run check_eligibility'
        : 'not checked yet',
    application_id: s.applicationId,
    customer_did_by_hand: s.takeManualChanges(),
    conversation_language: `${currentLanguage().label} (${currentLanguage().code})`,
    ...(opts.voiceMuted
      ? { voice_output: 'MUTED. The RevRag voice agent is talking to the customer. You are the silent action co-pilot: act on what the customer says, reply with at most a few words, never ask questions.' }
      : {}),
  };
  return `<app_context>\n${JSON.stringify(ctx)}\n</app_context>`;
}

export function fullState() {
  const s = useApp.getState();
  const d = s.data;
  return {
    current_screen: currentStep(),
    values: Object.fromEntries(
      Object.keys(FIELDS)
        .filter((id) => !isEmpty(d[id]))
        .map((id) => [id, maskSensitive(id, displayValue(id, d))]),
    ),
    missing_by_screen: Object.fromEntries(FORM_STEPS.map((fs) => [fs.id, missingFields(fs.id, d)])),
    completed_steps: completedSteps(),
    eligibility: currentEligibility(s) ?? 'not checked with current inputs',
    application_id: s.applicationId,
  };
}
