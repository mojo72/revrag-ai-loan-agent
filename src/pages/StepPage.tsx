import type { ReactNode } from 'react';
import { STEP_BY_ID, type StepId } from '../../shared/schema';
import { Field } from '../components/Field';
import { goBack, goNext } from '../state/actions';
import { useApp } from '../state/store';

// Fields that also appear on an earlier screen, so we can say "carried over".
const CARRIED: Record<string, string> = { employment_type: 'eligibility', monthly_income: 'eligibility' };

export function StepPage({ step, children, footer, hideFields }: { step: StepId; children?: ReactNode; footer?: ReactNode; hideFields?: boolean }) {
  const def = STEP_BY_ID[step];
  const attempted = useApp((s) => !!s.attempted[step]);
  useApp((s) => s.data); // re-render on data changes (conditional fields)

  return (
    <section className="slide-in">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Step {Object.keys(STEP_BY_ID).indexOf(step)} of 8</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">{def.title}</h1>
      <p className="mt-1.5 text-muted">{def.subtitle}</p>

      {!hideFields && (
        <div className="mt-6 grid gap-4 rounded-3xl border border-line bg-white/70 p-4 shadow-sm sm:p-6">
          {def.fields.map((id) => (
            <Field key={id} id={id} showErrors={attempted} carriedFrom={step === 'employment' ? CARRIED[id] : undefined} />
          ))}
        </div>
      )}
      {children}
      {footer ?? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => goBack()} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-white hover:text-ink">
            ← Back
          </button>
          <button
            type="button"
            id="btn-next"
            onClick={() => goNext('user')}
            className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-700"
          >
            Continue →
          </button>
        </div>
      )}
    </section>
  );
}
