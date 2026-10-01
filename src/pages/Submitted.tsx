import { Navigate } from 'react-router-dom';
import { AFTER_SUBMISSION, PRODUCTS, formatINR, type ProductId } from '../../shared/products';
import { startNew } from '../state/actions';
import { useApp } from '../state/store';

export function SubmittedPage() {
  const { applicationId, data } = useApp();
  if (!applicationId) return <Navigate to="/" replace />;
  return (
    <section className="slide-in text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-ok/10 text-3xl text-ok">✓</div>
      <h1 className="mt-4 font-display text-3xl font-bold">Application submitted</h1>
      <p className="mt-2 text-muted">
        {PRODUCTS[(data.product as ProductId) ?? 'personal'].name} of {formatINR(Number(data.amount))} for {String(data.tenure_months)} months
      </p>
      <p className="mt-4 inline-block rounded-2xl border border-line bg-white px-5 py-3 font-mono text-lg tracking-wider">
        <span className="mr-2 text-sm text-muted">Application ID</span>
        {applicationId}
      </p>
      <ol className="mx-auto mt-8 max-w-lg space-y-3 text-left">
        {AFTER_SUBMISSION.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-2xl bg-white p-3.5 text-sm shadow-sm">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-ok text-white' : 'bg-brand-50 text-brand-700'}`}>{i === 0 ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => startNew()} className="mt-8 text-sm font-medium text-brand-600 hover:underline">
        Start a new application
      </button>
    </section>
  );
}
