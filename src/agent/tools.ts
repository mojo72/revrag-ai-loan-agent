// Executes the agent's tool calls against the live app. Every result reports what actually happened,
// including validation errors, so the model never assumes an action succeeded.

import { emiBreakdown, indicativeRate, type CreditBand } from '../../shared/finance';
import { PRODUCTS, formatINR, type ProductId } from '../../shared/products';
import { FIELDS, STEP_BY_ID, coerceField, displayValue, isVisible, maskSensitive, type StepId } from '../../shared/schema';
import { currentStep, goTo, pressButton } from '../state/actions';
import { bus } from '../state/bus';
import { useApp } from '../state/store';
import { fullState } from './context';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ToolOutcome {
  content: string;
  isError: boolean;
  /** Short human-readable line for the action timeline. */
  summary: string;
}

function stepOfField(fieldId: string): StepId | undefined {
  return (Object.values(STEP_BY_ID).find((s) => s.fields.includes(fieldId) && s.id !== 'discover')?.id) as StepId | undefined;
}

export function scrollToTarget(target: string) {
  const el = document.getElementById(FIELDS[target] ? `field-${target}` : target);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  useApp.getState().setHighlight(target);
  return true;
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case 'navigate_to': {
      const step = input.step as StepId;
      if (!STEP_BY_ID[step]) return { content: `Unknown screen ${step}.`, isError: true, summary: 'Navigation failed' };
      if (step === 'submitted' && !useApp.getState().applicationId)
        return { content: 'The confirmation screen is only available after submission.', isError: true, summary: 'Navigation blocked' };
      goTo(step);
      await wait(350);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { content: `Now on ${STEP_BY_ID[step].title}.`, isError: false, summary: `Opened ${STEP_BY_ID[step].title}` };
    }

    case 'fill_fields': {
      const items = (input.fields as { field_id: string; value: unknown }[]) ?? [];
      const store = useApp.getState();
      const onScreen = STEP_BY_ID[currentStep()].fields;
      const results: string[] = [];
      const done: string[] = [];
      let anyError = false;
      for (const { field_id, value } of items) {
        const f = FIELDS[field_id];
        if (!f) {
          results.push(`${field_id}: unknown field`);
          anyError = true;
          continue;
        }
        if (/^consent_/.test(field_id) && String(value) === 'true' && currentStep() !== 'review') {
          results.push(`${field_id}: consents can only be given on the review screen after the customer agrees there.`);
          anyError = true;
          continue;
        }
        const data = useApp.getState().data;
        const isClear = value === '' || value === null;
        const { value: v, error } = isClear ? { value: undefined, error: undefined } : coerceField(field_id, value, data);
        if (error && v === undefined) {
          results.push(`${field_id}: NOT SET. ${error}`);
          anyError = true;
          continue;
        }
        if (onScreen.includes(field_id)) {
          scrollToTarget(field_id);
          await wait(140);
        }
        store.setField(field_id, v, 'agent');
        // The model gets the exact captured value (so it can read it back); the on-screen timeline is masked.
        const shown = v === undefined ? 'cleared' : displayValue(field_id, useApp.getState().data);
        const masked = v === undefined ? 'cleared' : maskSensitive(field_id, shown);
        if (error) {
          results.push(`${field_id}: set to "${shown}" but INVALID: ${error}`);
          anyError = true;
        } else {
          const where = onScreen.includes(field_id) ? '' : ` (saved for the ${STEP_BY_ID[stepOfField(field_id) ?? 'loan'].title} screen)`;
          const hidden = isVisible(f, useApp.getState().data) ? '' : ' (not applicable for current answers, hidden)';
          results.push(`${field_id}: ${shown}${where}${hidden}`);
          done.push(`${f.label}: ${masked}`);
        }
      }
      return {
        content: results.join('\n'),
        isError: anyError && done.length === 0,
        summary: done.length ? `Filled ${done.join(', ')}` : 'Could not fill fields',
      };
    }

    case 'press_button': {
      const button = String(input.button);
      const r = pressButton(button, 'agent');
      await wait(r.ok ? 350 : 50);
      if (r.ok && button === 'check_eligibility') scrollToTarget('eligibility_result');
      const label = button.replace(/_/g, ' ');
      const relay = r.ok && ['check_eligibility', 'submit_application'].includes(button) ? ' Tell the customer this result now, in plain words.' : '';
      return { content: r.message + relay, isError: !r.ok, summary: r.ok ? `Pressed “${label}”` : `“${label}” blocked` };
    }

    case 'scroll_to': {
      const target = String(input.target);
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return { content: 'Scrolled to top.', isError: false, summary: 'Scrolled to top' };
      }
      const ok = scrollToTarget(target);
      const label = FIELDS[target]?.label ?? target.replace(/_/g, ' ');
      return ok
        ? { content: `Scrolled to and highlighted ${label}.`, isError: false, summary: `Pointed to ${label}` }
        : { content: `${target} is not on the current screen. Navigate to the right screen first.`, isError: true, summary: 'Scroll target not found' };
    }

    case 'calculate_emi': {
      const d = useApp.getState().data;
      const product = ((input.product as ProductId) ?? (d.product as ProductId) ?? 'personal') as ProductId;
      const rate = typeof input.annual_rate === 'number' ? input.annual_rate : indicativeRate(product, d.credit_band as CreditBand | undefined);
      const amount = Number(input.amount);
      const months = Number(input.tenure_months);
      if (!(amount > 0 && months > 0)) return { content: 'amount and tenure_months must be positive.', isError: true, summary: 'EMI calc failed' };
      const b = emiBreakdown(amount, rate, months);
      return {
        content: `Tell the customer: ${PRODUCTS[product].name}: ${formatINR(amount)} for ${months} months at ${rate}% p.a. -> EMI ${formatINR(b.emi)}/month, total interest ${formatINR(b.totalInterest)}, total payable ${formatINR(b.totalPayable)}.${typeof input.annual_rate === 'number' ? '' : ' Rate is indicative based on the declared credit score.'}`,
        isError: false,
        summary: `EMI ${formatINR(b.emi)}/mo`,
      };
    }

    case 'get_application_state':
      return { content: JSON.stringify(fullState()), isError: false, summary: 'Reviewed application' };

    default:
      return { content: `Unknown tool ${name}.`, isError: true, summary: `Unknown tool ${name}` };
  }
}

export function announce(summary: string, tool: string) {
  bus.emit({ type: 'agent_action', tool, summary });
}
