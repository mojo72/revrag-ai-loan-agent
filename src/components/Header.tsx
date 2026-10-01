import { Link, useLocation } from 'react-router-dom';
import { FORM_STEPS, STEP_BY_ID, stepForPath } from '../../shared/schema';
import { call, useCall } from '../revrag/call';
import { completedSteps } from '../state/journey';
import { useApp } from '../state/store';
import { goTo } from '../state/actions';
import { StatusBadge } from './StatusBadge';

export function Header() {
  const { pathname } = useLocation();
  const step = stepForPath(pathname);
  useApp((s) => s.data);
  const done = new Set(completedSteps());
  const inFlow = pathname.startsWith('/apply') && step.id !== 'submitted';
  const steps = [...FORM_STEPS, STEP_BY_ID.review];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold text-brand-900">
          <img src="/favicon.svg" alt="" className="size-7" />
          Bliss Finance
        </Link>
        <div className="flex items-center gap-2" data-ai-ignore>
          <StatusBadge />
          <button type="button" onClick={() => (call.active ? useCall.setState({ panelOpen: true }) : void call.start())} className="rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white lg:hidden">
            Sara
          </button>
        </div>
      </div>
      {inFlow && (
        <nav aria-label="Application progress" className="mx-auto max-w-3xl overflow-x-auto px-4 pb-3 sm:px-6">
          <ol className="flex min-w-max gap-1.5">
            {steps.map((s) => {
              const current = s.id === step.id;
              const complete = done.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(s.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      current ? 'bg-brand-600 text-white' : complete ? 'bg-ok/10 text-ok' : 'bg-white text-muted hover:text-ink'
                    }`}
                  >
                    {complete && !current ? '✓ ' : ''}
                    {s.short}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </header>
  );
}
