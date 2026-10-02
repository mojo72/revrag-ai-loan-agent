import { useEffect, useRef, useState } from 'react';
import { agent, useAgent } from '../agent/controller';

// Small "system status" popover: lets reviewers see which providers are live.
export function StatusBadge() {
  const [open, setOpen] = useState(false);
  const providers = useAgent((s) => s.providers);
  const sttProvider = useAgent((s) => s.sttProvider);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void agent.loadProviders();
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const allGood = providers?.llm && providers.stt && providers.tts;
  const rows: [string, boolean | null, string][] = [
    ['Claude (agent brain)', providers?.llm ?? null, providers?.llm ? 'configured' : 'missing key'],
    ['Deepgram (speech-to-text)', providers?.stt ?? null, sttProvider === 'browser' ? 'using browser fallback' : providers?.stt ? 'configured' : 'browser fallback'],
    ['Murf (text-to-speech)', providers?.tts ?? null, providers?.tts ? 'configured' : 'browser fallback'],
  ];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:text-ink" aria-expanded={open}>
        <span className={`size-2 rounded-full ${allGood ? 'bg-ok' : 'bg-accent'}`} />
        Status
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-2xl border border-line bg-white p-4 text-sm shadow-xl">
          <p className="font-semibold">System status</p>
          <ul className="mt-2 space-y-2">
            {rows.map(([name, ok, note]) => (
              <li key={name} className="flex items-start justify-between gap-3">
                <span>{name}</span>
                <span className={`text-right text-xs ${ok ? 'text-ok' : 'text-accent'}`}>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
