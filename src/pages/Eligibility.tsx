import { formatINR } from '../../shared/products';
import { useHighlight } from '../components/useHighlight';
import { checkEligibilityAction } from '../state/actions';
import { currentEligibility, useApp } from '../state/store';
import { StepPage } from './StepPage';

export function EligibilityPage() {
  const e = useApp((s) => currentEligibility(s));
  const stale = useApp((s) => !!s.eligibility && !currentEligibility(s));
  const amount = useApp((s) => s.data.amount as number | undefined);
  const pointed = useHighlight('eligibility_result');

  return (
    <StepPage step="eligibility">
      <div id="eligibility_result" className={`mt-4 scroll-mt-28 rounded-3xl border border-line bg-white p-5 shadow-sm ${pointed ? 'agent-point' : ''}`}>
        {!e ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{stale ? 'Your details changed' : 'See how much you can borrow'}</p>
              <p className="text-sm text-muted">Soft check. No impact on your credit score.</p>
            </div>
            <button type="button" onClick={() => checkEligibilityAction('user')} className="rounded-xl border border-brand-600 px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              Check eligibility
            </button>
          </div>
        ) : e.eligible ? (
          <div className="slide-in">
            <p className="text-sm font-semibold text-ok">✓ You're eligible</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Stat label="Eligible up to" value={formatINR(e.maxEligibleAmount)} />
              <Stat label="Indicative rate" value={`${e.indicativeRate}%`} />
              <Stat label="EMI for your amount" value={e.emiForRequested ? formatINR(e.emiForRequested) : '-'} />
            </div>
            {amount !== undefined && amount > e.maxEligibleAmount && (
              <p className="mt-3 rounded-xl bg-accent/10 p-3 text-sm text-ink">
                You asked for {formatINR(amount)}, which is above your eligible limit. Lower the amount or increase the tenure to continue.
              </p>
            )}
          </div>
        ) : (
          <div className="slide-in">
            <p className="text-sm font-semibold text-bad">Not eligible right now</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              {e.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StepPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-brand-50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-brand-900">{value}</p>
    </div>
  );
}
