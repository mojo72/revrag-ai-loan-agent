import { attachSampleDocs } from '../state/actions';
import { useApp } from '../state/store';
import { StepPage } from './StepPage';

export function DocumentsPage() {
  const salaried = useApp((s) => s.data.employment_type !== 'self_employed');
  return (
    <StepPage step="documents">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 p-4 text-sm">
        <p className="text-brand-900">
          {salaried ? 'Salaried: 3 months salary slips and 6 months bank statement.' : 'Self-employed: 2 years ITR and 12 months bank statement.'} PDF or photo, up to 10 MB each.
        </p>
        <button type="button" onClick={() => attachSampleDocs('user')} className="rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:border-brand-500">
          Use sample documents (demo)
        </button>
      </div>
    </StepPage>
  );
}
