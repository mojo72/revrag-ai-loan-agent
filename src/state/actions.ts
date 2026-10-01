// App-level actions. The UI buttons and the AI agent call exactly the same functions.

import { FIELDS, STEP_BY_ID, type FileMeta, type StepId } from '../../shared/schema';
import { formatINR } from '../../shared/products';
import { bus } from './bus';
import { gate, nextStepId, prevStepId } from './journey';
import { useApp } from './store';

type Navigate = (path: string) => void;
let navigateImpl: Navigate = () => {};
let currentPathImpl: () => string = () => window.location.pathname;

export function bindRouter(nav: Navigate, currentPath: () => string) {
  navigateImpl = nav;
  currentPathImpl = currentPath;
}

export function currentStep(): StepId {
  const path = currentPathImpl();
  return (Object.values(STEP_BY_ID).find((s) => s.path === path)?.id ?? 'discover') as StepId;
}

export function goTo(step: StepId) {
  navigateImpl(STEP_BY_ID[step].path);
}

export type Source = 'user' | 'agent';

export interface ActionResult {
  ok: boolean;
  message: string;
}

export function goNext(source: Source): ActionResult {
  const step = currentStep();
  if (step === 'review') return { ok: false, message: 'On the review screen, use submit_application instead of next.' };
  const g = gate(step);
  if (!g.ok) {
    useApp.getState().markAttempted(step);
    bus.emit({ type: 'validation_failed', step, problems: g.problems, source });
    return { ok: false, message: `Cannot continue from ${STEP_BY_ID[step].title}: ${g.problems.join(' ')}` };
  }
  const next = nextStepId(step);
  if (!next) return { ok: false, message: 'Already at the last screen.' };
  goTo(next);
  return { ok: true, message: `Moved to ${STEP_BY_ID[next].title}.` };
}

export function goBack(): ActionResult {
  const prev = prevStepId(currentStep());
  if (!prev) return { ok: false, message: 'Already at the first screen.' };
  goTo(prev);
  return { ok: true, message: `Moved back to ${STEP_BY_ID[prev].title}.` };
}

export function checkEligibilityAction(source: Source): ActionResult {
  const s = useApp.getState();
  const required = ['dob', 'employment_type', 'monthly_income', 'existing_emi', 'credit_band', 'amount', 'tenure_months'];
  const missing = required.filter((id) => s.data[id] === undefined || s.data[id] === '');
  if (missing.length) {
    useApp.getState().markAttempted('eligibility');
    return { ok: false, message: `Need these before checking eligibility: ${missing.map((id) => FIELDS[id].label).join(', ')}.` };
  }
  const r = s.runEligibility();
  bus.emit({ type: 'eligibility_checked', result: r, source });
  const amt = s.data.amount as number;
  return {
    ok: true,
    message: r.eligible
      ? `Eligible. Maximum eligible amount ${formatINR(r.maxEligibleAmount)} at an indicative ${r.indicativeRate}% p.a.; EMI for the requested ${formatINR(amt)} would be ${formatINR(r.emiForRequested ?? 0)}/month.${amt > r.maxEligibleAmount ? ' Requested amount EXCEEDS the eligible maximum.' : ''}`
      : `Not eligible: ${r.reasons.join(' ')}`,
  };
}

const SAMPLE_FILES: Record<string, FileMeta> = {
  doc_pan: { name: 'sample-pan-card.jpg', size: 184_220, sample: true },
  doc_aadhaar: { name: 'sample-aadhaar.pdf', size: 402_118, sample: true },
  doc_income: { name: 'sample-salary-slips-3m.pdf', size: 611_902, sample: true },
  doc_bank_statement: { name: 'sample-bank-statement-6m.pdf', size: 1_204_551, sample: true },
};

export function attachSampleDocs(source: Source): ActionResult {
  const s = useApp.getState();
  const attached: string[] = [];
  for (const [id, meta] of Object.entries(SAMPLE_FILES)) {
    if (!s.data[id]) {
      s.setField(id, meta, source === 'agent' ? 'agent' : 'user');
      attached.push(FIELDS[id].label);
    }
  }
  return { ok: true, message: attached.length ? `Attached sample files for: ${attached.join(', ')}.` : 'All documents were already attached.' };
}

export function submitApplication(source: Source): ActionResult {
  if (currentStep() !== 'review') return { ok: false, message: 'Navigate to the review screen first.' };
  const g = gate('review');
  if (!g.ok) {
    useApp.getState().markAttempted('review');
    bus.emit({ type: 'validation_failed', step: 'review', problems: g.problems, source });
    return { ok: false, message: `Cannot submit yet: ${g.problems.join(' ')}` };
  }
  const id = useApp.getState().submit();
  bus.emit({ type: 'submitted', applicationId: id, source });
  goTo('submitted');
  return { ok: true, message: `Application submitted. Application ID ${id}.` };
}

export function startNew(): ActionResult {
  useApp.getState().reset();
  goTo('loan');
  return { ok: true, message: 'Started a fresh application on the Loan details screen.' };
}

export function pressButton(button: string, source: Source): ActionResult {
  const step = currentStep();
  const onScreen = STEP_BY_ID[step].actions.some((a) => a.id === button);
  if (!['next', 'back'].includes(button) && !onScreen)
    return { ok: false, message: `Button "${button}" is not on the current screen (${STEP_BY_ID[step].title}).` };
  switch (button) {
    case 'next':
      return goNext(source);
    case 'back':
      return goBack();
    case 'check_eligibility':
      return checkEligibilityAction(source);
    case 'attach_sample_documents':
      return attachSampleDocs(source);
    case 'submit_application':
      return submitApplication(source);
    case 'start_application':
      goTo('loan');
      return { ok: true, message: 'Opened Loan details.' };
    case 'start_new_application':
      return startNew();
    default:
      return { ok: false, message: `Unknown button ${button}.` };
  }
}
