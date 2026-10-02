import { useEffect, useRef, useState } from 'react';
import { useRevrag } from '../revrag/RevragLayer';

// "System status" popover: what the RevRag SDK is doing live.
export function StatusBadge() {
  const [open, setOpen] = useState(false);
  const rv = useRevrag();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const rows: [string, boolean, string][] = [
    ['RevRag SDK', rv.initialized, !rv.configured ? 'no API key' : rv.error ? `error: ${rv.error}` : rv.initialized ? 'initialised' : 'initialising…'],
    ['Customer identified', rv.identified, rv.identified ? 'USER_DATA sent' : 'waiting for SDK'],
    ['RevRag agent call', rv.callActive, rv.callActive ? 'connected' : 'idle (tap the agent button)'],
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
