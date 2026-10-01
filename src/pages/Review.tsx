import { FIELDS, FORM_STEPS, type AppData, displayValue, isEmpty, isVisible, maskSensitive, missingFields } from '../../shared/schema';
import { PRODUCTS, formatINR, type ProductId } from '../../shared/products';
import { Field } from '../components/Field';
import { useHighlight } from '../components/useHighlight';
import { goBack, goTo, submitApplication } from '../state/actions';
import { gate } from '../state/journey';
import { currentEligibility, useApp } from '../state/store';
import { StepPage } from './StepPage';

export function ReviewPage() {
  const data = useApp((s) => s.data);
  const e = useApp((s) => currentEligibility(s));
  const attempted = useApp((s) => !!s.attempted.review);
  const problems = attempted ? gate('review').problems : [];
  const p = PRODUCTS[(data.product as ProductId) ?? 'personal'];

  return (
    <StepPage
      step="review"
      hideFields
      footer={
        <div className="mt-6">
          {problems.length > 0 && (
            <ul className="mb-3 list-disc rounded-2xl bg-bad/5 p-4 pl-8 text-sm text-bad">
              {problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => goBack()} className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted hover:bg-white hover:text-ink">
              ← Back
            </button>
            <button type="button" id="btn-submit" onClick={() => submitApplication('user')} className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 hover:bg-brand-700">
              Submit application
            </button>
          </div>
        </div>
      }
    >
      <div className="mt-6 rounded-3xl bg-brand-900 p-5 text-white shadow-lg">
        <p className="text-sm text-brand-200">{p.name}</p>
        <p className="mt-1 font-display text-3xl font-bold">{typeof data.amount === 'number' ? formatINR(data.amount) : '-'}</p>
        <p className="mt-1 text-sm text-brand-100">
          {data.tenure_months ? `${data.tenure_months} months` : '-'} · {e ? `${e.indicativeRate}% p.a. · EMI ${formatINR(e.emiForRequested ?? 0)}/month` : 'eligibility not checked'}
        </p>
      </div>

      <div className="mt-4 grid gap-3">
        {FORM_STEPS.map((s) => (
          <ReviewSection key={s.id} stepId={s.id} title={s.title} missing={missingFields(s.id, data).length} data={data} />
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <Field id="consent_terms" showErrors={attempted} />
        <Field id="consent_bureau" showErrors={attempted} />
      </div>
    </StepPage>
  );

}

function ReviewSection({ stepId, title, missing, data }: { stepId: (typeof FORM_STEPS)[number]['id']; title: string; missing: number; data: AppData }) {
  const pointed = useHighlight(`review_${stepId}`);
  const fields = FORM_STEPS.find((s) => s.id === stepId)!.fields.filter((id) => isVisible(FIELDS[id], data));
  return (
    <div id={`review_${stepId}`} className={`scroll-mt-28 rounded-2xl border border-line bg-white p-4 ${pointed ? 'agent-point' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {title} {missing > 0 ? <span className="ml-1 rounded-full bg-bad/10 px-2 py-0.5 text-xs text-bad">{missing} missing</span> : <span className="ml-1 text-xs text-ok">✓</span>}
        </h3>
        <button type="button" onClick={() => goTo(stepId)} className="text-sm font-medium text-brand-600 hover:underline">
          Edit
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {fields.map((id) => (
          <div key={id} className="flex justify-between gap-3 border-b border-line/60 py-1 last:border-0">
            <dt className="text-muted">{FIELDS[id].label}</dt>
            <dd className={`text-right font-medium ${isEmpty(data[id]) ? 'text-bad' : ''}`}>{maskSensitive(id, displayValue(id, data))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
