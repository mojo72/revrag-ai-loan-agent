// Journey rules shared by the on-screen buttons and the agent, so both go through the same gates.

import { FIELDS, FORM_STEPS, STEPS, STEP_BY_ID, fieldError, missingFields, type StepId } from '../../shared/schema';
import { formatINR } from '../../shared/products';
import { currentEligibility, useApp } from './store';

export function nextStepId(step: StepId): StepId | null {
  const i = STEPS.findIndex((s) => s.id === step);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1].id : null;
}

export function prevStepId(step: StepId): StepId | null {
  const i = STEPS.findIndex((s) => s.id === step);
  return i > 0 ? STEPS[i - 1].id : null;
}

export interface GateResult {
  ok: boolean;
  problems: string[];
}

export function gate(step: StepId): GateResult {
  const s = useApp.getState();
  const d = s.data;
  const problems = missingFields(step, d).map((id) => `${FIELDS[id].label}: ${fieldError(id, d)}`);

  if (step === 'eligibility' && problems.length === 0) {
    const e = currentEligibility(s);
    if (!e) problems.push('Eligibility has not been checked with the current details yet (press check_eligibility).');
    else if (!e.eligible) problems.push(`Not eligible: ${e.reasons.join(' ')}`);
    else if (typeof d.amount === 'number' && d.amount > e.maxEligibleAmount)
      problems.push(`Requested ${formatINR(d.amount)} exceeds the eligible maximum of ${formatINR(e.maxEligibleAmount)}. Reduce the amount or increase the tenure.`);
  }

  if (step === 'review') {
    for (const fs of FORM_STEPS) {
      const m = missingFields(fs.id, d);
      if (m.length) problems.push(`${fs.title} is incomplete (${m.map((id) => FIELDS[id].label).join(', ')}).`);
    }
    const e = currentEligibility(s);
    if (!e?.eligible) problems.push('Eligibility must be checked and passed before submitting.');
  }

  return { ok: problems.length === 0, problems };
}

export function completedSteps(): StepId[] {
  return FORM_STEPS.filter((s) => gate(s.id).ok).map((s) => s.id);
}

export function stepTitle(id: StepId) {
  return STEP_BY_ID[id].title;
}
