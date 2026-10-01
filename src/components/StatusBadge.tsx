import { useEffect, useRef, useState } from 'react';
import { useCall } from '../revrag/call';
import { useRevrag } from '../revrag/RevragLayer';

// "System status" popover: shows reviewers what RevRag is doing live (SDK, call, Action Intelligence).
export function StatusBadge() {
  const [open, setOpen] = useState(false);
  const rv = useRevrag();
  const { status, stats } = useCall();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const inCall = status !== 'off' && status !== 'connecting';
  const rows: [string, boolean, string][] = [
    ['RevRag SDK', rv.initialized, !rv.configured ? 'no API key' : rv.error ? `error: ${rv.error}` : rv.initialized ? 'initialised' : 'initialising…'],
    ['RevRag voice agent', inCall, inCall ? `on call · ${status}` : status === 'connecting' ? 'connecting…' : 'idle'],
    ['Action Intelligence', stats.missions > 0, `${stats.snapshots} screen snapshots sent · ${stats.missions} missions · ${stats.steps} actions`],
    ['Context events', rv.eventsSent > 0, `${rv.eventsSent} sent${rv.lastEvent ? ` · last: ${rv.lastEvent}` : ''}`],
  ];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:text-ink" aria-expanded={open}>
        <span className={`size-2 rounded-full ${rv.initialized ? 'bg-ok' : 'bg-accent'}`} />
        Status
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-2xl border border-line bg-white p-4 text-sm shadow-xl">
          <p className="font-semibold">System status</p>
          <ul className="mt-2 space-y-2">
            {rows.map(([name, ok, note]) => (
              <li key={name} className="flex items-start justify-between gap-3">
                <span className="shrink-0">{name}</span>
                <span className={`text-right text-xs ${ok ? 'text-ok' : 'text-muted'}`}>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
